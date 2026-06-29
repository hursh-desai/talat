const STORAGE_PREFIX = "talat-player";

export function savePlayerSession(
  gameId: string,
  playerToken: string,
  slot: number,
): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    `${STORAGE_PREFIX}:${gameId}`,
    JSON.stringify({ playerToken, slot }),
  );
}

export function loadPlayerSession(gameId: string): {
  playerToken: string;
  slot: number;
} | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(`${STORAGE_PREFIX}:${gameId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { playerToken: string; slot: number };
  } catch {
    return null;
  }
}

export function savePlayerSessionByCode(
  code: string,
  gameId: string,
  playerToken: string,
  slot: number,
): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    `${STORAGE_PREFIX}:code:${code.toUpperCase()}`,
    JSON.stringify({ gameId, playerToken, slot }),
  );
  savePlayerSession(gameId, playerToken, slot);
}

export function loadPlayerSessionByCode(code: string): {
  gameId: string;
  playerToken: string;
  slot: number;
} | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(
    `${STORAGE_PREFIX}:code:${code.toUpperCase()}`,
  );
  if (!raw) return null;
  try {
    return JSON.parse(raw) as {
      gameId: string;
      playerToken: string;
      slot: number;
    };
  } catch {
    return null;
  }
}
