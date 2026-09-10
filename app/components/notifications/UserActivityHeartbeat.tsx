"use client";

import { useEffect } from "react";
import { touchUserLastActive } from "@/app/actions/user-activity";
import { useUIStore } from "@/app/store/useUIStore";

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

function isLoggedInRole(role: string): boolean {
  return role === "USER" || role === "MERCHANT" || role === "ADMIN";
}

export function UserActivityHeartbeat() {
  const userAuthRole = useUIStore((state) => state.userAuthRole);

  useEffect(() => {
    if (!isLoggedInRole(userAuthRole)) {
      return;
    }

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const ping = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      void touchUserLastActive();
    };

    const start = () => {
      ping();
      if (intervalId) {
        clearInterval(intervalId);
      }
      intervalId = setInterval(ping, HEARTBEAT_INTERVAL_MS);
    };

    const stop = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        start();
        return;
      }
      stop();
    };

    start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [userAuthRole]);

  return null;
}
