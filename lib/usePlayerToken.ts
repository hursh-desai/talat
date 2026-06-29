"use client";

import { useSyncExternalStore } from "react";
import { loadPlayerSessionByCode } from "@/lib/playerStorage";

function subscribe(): () => void {
  return () => {};
}

export function usePlayerToken(code: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => loadPlayerSessionByCode(code)?.playerToken ?? null,
    () => null,
  );
}
