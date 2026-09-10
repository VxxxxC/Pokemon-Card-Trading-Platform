"use client";

import { useSyncExternalStore } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type DeferredPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export type PwaPromptState =
  | "WAITING"
  | "NATIVE_READY"
  | "BROWSER_COOLING"
  | "ALREADY_INSTALLED";

export interface UsePwaInstallReturn {
  /** Whether the app is already running in standalone / installed mode */
  isInstalled: boolean;
  /** Current prompt state for UI rendering */
  promptState: PwaPromptState;
  /** Trigger the native browser install prompt (no-op if unavailable) */
  onInstall: () => Promise<void>;
}

/* ------------------------------------------------------------------ */
/*  localStorage keys                                                  */
/* ------------------------------------------------------------------ */

const LS_COOLING_KEY = "pwa_cooling_active";
const LS_INSTALLED_KEY = "pwa_installed";

/* ------------------------------------------------------------------ */
/*  Module-level singleton — captures `beforeinstallprompt` eagerly    */
/* ------------------------------------------------------------------ */

let deferredPrompt: DeferredPromptEvent | null = null;
let isInstalled = false;
let coolingFlagSet = false;

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Snapshot is just a version counter so React knows to re-render */
let version = 0;
function getSnapshot() {
  return version;
}
function getServerSnapshot() {
  return 0;
}

if (typeof window !== "undefined") {
  const byMedia = window.matchMedia("(display-mode: standalone)").matches;
  const byNavigator =
    "standalone" in window.navigator &&
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);

  // Only treat the app as installed when actually running standalone.
  // Stale `pwa_installed` in localStorage should not permanently hide the banner in a tab.
  isInstalled = byMedia || byNavigator;

  if (!isInstalled && localStorage.getItem(LS_INSTALLED_KEY) === "true") {
    localStorage.removeItem(LS_INSTALLED_KEY);
  }

  // Read cooling flag so we can distinguish "waiting for beforeinstallprompt"
  // from "user already dismissed and browser is in cooling period".
  coolingFlagSet = localStorage.getItem(LS_COOLING_KEY) !== null;

  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    deferredPrompt = e as DeferredPromptEvent;
    // Native prompt arrived — clear any cooling flag
    coolingFlagSet = false;
    localStorage.removeItem(LS_COOLING_KEY);
    version++;
    emit();
  });

  window.addEventListener("appinstalled", () => {
    isInstalled = true;
    deferredPrompt = null;
    coolingFlagSet = false;
    localStorage.setItem(LS_INSTALLED_KEY, "true");
    localStorage.removeItem(LS_COOLING_KEY);
    version++;
    emit();
  });
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function derivePromptState(): PwaPromptState {
  if (isInstalled) return "ALREADY_INSTALLED";
  if (deferredPrompt) return "NATIVE_READY";
  if (coolingFlagSet) return "BROWSER_COOLING";
  return "WAITING";
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function usePwaInstall(): UsePwaInstallReturn {
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const onInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      isInstalled = true;
      coolingFlagSet = false;
      localStorage.setItem(LS_INSTALLED_KEY, "true");
      localStorage.removeItem(LS_COOLING_KEY);
    } else {
      // User dismissed — enter cooling state so next refresh shows fallback UI
      coolingFlagSet = true;
      localStorage.setItem(
        LS_COOLING_KEY,
        JSON.stringify({ active: true, timestamp: Date.now() })
      );
    }
    deferredPrompt = null;
    version++;
    emit();
  };

  return { isInstalled, promptState: derivePromptState(), onInstall };
}

