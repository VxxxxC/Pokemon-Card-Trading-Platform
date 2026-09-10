type BodyScrollLockSnapshot = {
  scrollY: number;
};

let isLocked = false;
let snapshot: BodyScrollLockSnapshot | null = null;

function getScrollbarWidth(): number {
  if (typeof window === "undefined") return 0;
  return Math.max(0, window.innerWidth - document.documentElement.clientWidth);
}

function readCapturedScrollY(): number {
  const top = document.body.style.top;
  if (top.startsWith("-")) {
    const parsed = Number.parseInt(top.slice(1), 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return snapshot?.scrollY ?? window.scrollY;
}

function applyBodyScrollLock(): void {
  const { body, documentElement } = document;

  snapshot = {
    scrollY: window.scrollY,
  };

  const scrollbarWidth = getScrollbarWidth();

  documentElement.setAttribute("data-scroll-locked", "");
  documentElement.style.overflow = "hidden";
  body.style.overflow = "hidden";
  body.style.position = "fixed";
  body.style.top = `-${snapshot.scrollY}px`;
  body.style.width = "100%";

  if (scrollbarWidth > 0) {
    body.style.paddingRight = `${scrollbarWidth}px`;
  }
}

function forceReleaseBodyScrollLock(): void {
  const scrollY = readCapturedScrollY();
  const { body, documentElement } = document;

  documentElement.removeAttribute("data-scroll-locked");
  documentElement.style.removeProperty("overflow");
  body.style.removeProperty("overflow");
  body.style.removeProperty("padding-right");
  body.style.removeProperty("position");
  body.style.removeProperty("top");
  body.style.removeProperty("width");

  snapshot = null;
  isLocked = false;
  window.scrollTo(0, scrollY);
}

function isVisibleModalElement(element: Element): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (element.hidden) {
    return false;
  }

  if (element.getAttribute("aria-hidden") === "true") {
    return false;
  }

  if (
    element.hasAttribute("data-ending-style") ||
    element.hasAttribute("data-closed")
  ) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.opacity === "0"
  ) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

export const MODAL_OVERLAY_OPEN_SELECTOR = [
  '[data-slot="dialog-overlay"][data-open]:not([data-ending-style]):not([data-closed])',
  '[data-slot="alert-dialog-overlay"][data-open]:not([data-ending-style]):not([data-closed])',
  '[data-slot="sheet-overlay"][data-open]:not([data-ending-style]):not([data-closed])',
].join(", ");

export const MODAL_DIALOG_SELECTOR = '[role="dialog"][aria-modal="true"]';

/** @deprecated use MODAL_OVERLAY_OPEN_SELECTOR */
export const MODAL_OPEN_SELECTOR = [
  MODAL_OVERLAY_OPEN_SELECTOR,
  MODAL_DIALOG_SELECTOR,
].join(", ");

export function hasOpenModalInDom(): boolean {
  if (typeof document === "undefined") return false;

  const openOverlays = document.querySelectorAll(MODAL_OVERLAY_OPEN_SELECTOR);
  if (openOverlays.length > 0) {
    return true;
  }

  const dialogs = document.querySelectorAll(MODAL_DIALOG_SELECTOR);
  for (const dialog of dialogs) {
    if (isVisibleModalElement(dialog)) {
      return true;
    }
  }

  return false;
}

/** Idempotent toggle used by the global modal observer. */
export function setBodyScrollLocked(next: boolean): void {
  if (typeof document === "undefined") return;

  if (next) {
    if (isLocked) return;
    isLocked = true;
    applyBodyScrollLock();
    return;
  }

  if (isLocked || document.body.style.position === "fixed") {
    forceReleaseBodyScrollLock();
  }
}
