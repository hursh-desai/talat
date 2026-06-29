import { opponentStartingRow } from "./geometry";
import { towerRank } from "./types";
import type {
  GameBoardState,
  PlacedTower,
  PlayerSlot,
  TowerSpec,
} from "./types";
import { boardsForSlot } from "./types";

export const CAPTURE_POINTS = 5;
export const END_LINE_POINTS = 3;

export type ScoreBreakdown = {
  capturePoints: number;
  endLinePoints: number;
  total: number;
  captures: PlacedTower[];
  endLineTowers: number;
};

export function scoreForSlot(
  state: GameBoardState,
  slot: PlayerSlot,
  capturedTowers: PlacedTower[],
): ScoreBreakdown {
  const capturePoints = capturedTowers.length * CAPTURE_POINTS;

  let endLineTowers = 0;
  for (const boardId of boardsForSlot(slot)) {
    const board = state.boards[boardId];
    const row = opponentStartingRow(boardId, slot);

    for (let col = 0; col < board[row].length; col++) {
      const piece = board[row][col];
      if (piece && piece.ownerSlot === slot) {
        endLineTowers++;
      }
    }
  }

  const endLinePoints = endLineTowers * END_LINE_POINTS;

  return {
    capturePoints,
    endLinePoints,
    total: capturePoints + endLinePoints,
    captures: capturedTowers,
    endLineTowers,
  };
}

export function highestCaptureRank(captures: PlacedTower[]): number {
  if (captures.length === 0) return 0;
  return Math.max(...captures.map((t) => towerRank(t)));
}

export function determineWinner(
  scores: number[],
  highestCaptureRanks: number[],
): PlayerSlot | null {
  const maxScore = Math.max(...scores);
  const leaders = scores
    .map((score, slot) => ({ score, slot: slot as PlayerSlot }))
    .filter(({ score }) => score === maxScore);

  if (leaders.length === 1) {
    return leaders[0].slot;
  }

  const maxRank = Math.max(
    ...leaders.map(({ slot }) => highestCaptureRanks[slot]),
  );
  const rankLeaders = leaders.filter(
    ({ slot }) => highestCaptureRanks[slot] === maxRank,
  );

  if (rankLeaders.length === 1) {
    return rankLeaders[0].slot;
  }

  return null;
}

export function rankLabel(tower: TowerSpec): string {
  const height = tower.height === 1 ? "Small" : tower.height === 2 ? "Medium" : "Large";
  const sides =
    tower.sides === 3 ? "Triangle" : tower.sides === 4 ? "Square" : "Hexagon";
  return `${height} ${sides}`;
}
