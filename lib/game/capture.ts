import type { PlacedTower, TowerSpec } from "./types";
import { rankLabel } from "./scoring";

export type CaptureResult =
  | { legal: true; reason: string }
  | { legal: false; reason: string };

export function captureResult(
  attacker: TowerSpec,
  defender: TowerSpec,
): CaptureResult {
  if (attacker.height === defender.height + 1) {
    return {
      legal: true,
      reason: "attacker is exactly one size larger",
    };
  }

  if (attacker.height === defender.height && attacker.sides > defender.sides) {
    return {
      legal: true,
      reason: "same size, attacker has more sides",
    };
  }

  if (
    attacker.height === 1 &&
    attacker.sides === 3 &&
    defender.height === 3 &&
    defender.sides === 6
  ) {
    return {
      legal: true,
      reason: "small 3-sided piece defeats large 6-sided piece",
    };
  }

  return {
    legal: false,
    reason: `${rankLabel(attacker)} cannot capture ${rankLabel(defender)}`,
  };
}

export function canCapture(attacker: TowerSpec, defender: TowerSpec): boolean {
  return captureResult(attacker, defender).legal;
}

export function canCapturePiece(
  attacker: PlacedTower,
  defender: PlacedTower,
): boolean {
  if (attacker.ownerSlot === defender.ownerSlot) {
    return false;
  }
  return canCapture(attacker, defender);
}
