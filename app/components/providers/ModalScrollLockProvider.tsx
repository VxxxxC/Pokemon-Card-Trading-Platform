"use client";

import { useEffect } from "react";
import {
  hasOpenModalInDom,
  setBodyScrollLocked,
} from "@/lib/ui/body-scroll-lock";

const EXIT_ANIMATION_RECHECK_MS = 220;

export function ModalScrollLockProvider() {
  useEffect(() => {
    let rafId = 0;
    let exitRecheckTimer: ReturnType<typeof setTimeout> | null = null;

    const sync = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const shouldLock = hasOpenModalInDom();
        setBodyScrollLocked(shouldLock);

        if (exitRecheckTimer) {
          clearTimeout(exitRecheckTimer);
          exitRecheckTimer = null;
        }

        if (!shouldLock) {
          exitRecheckTimer = setTimeout(() => {
            if (!hasOpenModalInDom()) {
              setBodyScrollLocked(false);
            }
          }, EXIT_ANIMATION_RECHECK_MS);
        }
      });
    };

    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "data-open",
        "data-closed",
        "data-ending-style",
        "data-starting-style",
        "aria-modal",
        "aria-hidden",
        "role",
        "hidden",
        "class",
        "style",
      ],
    });

    window.addEventListener("resize", sync);

    return () => {
      cancelAnimationFrame(rafId);
      if (exitRecheckTimer) {
        clearTimeout(exitRecheckTimer);
      }
      observer.disconnect();
      window.removeEventListener("resize", sync);
      setBodyScrollLocked(false);
    };
  }, []);

  return null;
}
