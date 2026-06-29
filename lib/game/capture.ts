import type { PlacedTower, TowerSpec } from "./types";

export function canCapture(attacker: TowerSpec, defender: TowerSpec): boolean {
  if (attacker.height === defender.height + 1) {
    return true;
  }

  if (attacker.height === defender.height && attacker.sides > defender.sides) {
    return true;
  }

  if (
    attacker.height === 1 &&
    attacker.sides === 3 &&
    defender.height === 3 &&
    defender.sides === 6
  ) {
    return true;
  }

  return false;
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
