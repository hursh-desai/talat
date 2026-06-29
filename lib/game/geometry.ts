import {
  BOARD_SIZE,
  type BoardId,
  type PlayerSlot,
  type Position,
} from "./types";

/** Row index of a player's starting line on a given board. */
export function startingRow(boardId: BoardId, slot: PlayerSlot): number {
  switch (boardId) {
    case "board01":
      return slot === 0 ? 0 : 4;
    case "board02":
      return slot === 0 ? 0 : 4;
    case "board12":
      return slot === 1 ? 0 : 4;
  }
}

export function isStartingRow(
  boardId: BoardId,
  slot: PlayerSlot,
  row: number,
): boolean {
  return row === startingRow(boardId, slot);
}

/** +1 means toward higher row index, -1 toward lower. */
export function forwardDirection(
  boardId: BoardId,
  slot: PlayerSlot,
): 1 | -1 {
  return startingRow(boardId, slot) === 0 ? 1 : -1;
}

export function opponentStartingRow(
  boardId: BoardId,
  slot: PlayerSlot,
): number {
  return startingRow(boardId, slot) === 0 ? 4 : 0;
}

export function isOnOpponentStartingRow(
  boardId: BoardId,
  slot: PlayerSlot,
  row: number,
): boolean {
  return row === opponentStartingRow(boardId, slot);
}

export function inBounds({ row, col }: Position): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

/** Forward and forward-diagonal deltas for a piece owner. */
export function forwardDeltas(
  boardId: BoardId,
  slot: PlayerSlot,
): Position[] {
  const dir = forwardDirection(boardId, slot);
  return [
    { row: dir, col: -1 },
    { row: dir, col: 0 },
    { row: dir, col: 1 },
  ];
}

/** Sideways-only deltas (used on opponent starting line). */
export function sidewaysDeltas(): Position[] {
  return [
    { row: 0, col: -1 },
    { row: 0, col: 1 },
  ];
}

export function addPosition(a: Position, b: Position): Position {
  return { row: a.row + b.row, col: a.col + b.col };
}
