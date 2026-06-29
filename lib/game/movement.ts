import { canCapturePiece } from "./capture";
import {
  addPosition,
  forwardDeltas,
  inBounds,
  isOnOpponentStartingRow,
  sidewaysDeltas,
} from "./geometry";
import type {
  Board,
  BoardId,
  MoveAction,
  PlacedTower,
  PlayerSlot,
  Position,
} from "./types";

export function getPiece(board: Board, pos: Position): PlacedTower | null {
  if (!inBounds(pos)) return null;
  return board[pos.row][pos.col];
}

function movementDeltas(
  boardId: BoardId,
  slot: PlayerSlot,
  row: number,
): Position[] {
  if (isOnOpponentStartingRow(boardId, slot, row)) {
    return sidewaysDeltas();
  }
  return forwardDeltas(boardId, slot);
}

export function getValidMovesForPiece(
  board: Board,
  boardId: BoardId,
  from: Position,
): Position[] {
  const piece = getPiece(board, from);
  if (!piece) return [];

  const destinations: Position[] = [];
  const deltas = movementDeltas(boardId, piece.ownerSlot, from.row);

  for (const delta of deltas) {
    const to = addPosition(from, delta);
    if (!inBounds(to)) continue;

    const target = getPiece(board, to);
    if (target === null) {
      destinations.push(to);
    } else if (canCapturePiece(piece, target)) {
      destinations.push(to);
    }
  }

  return destinations;
}

export function isValidMove(
  board: Board,
  boardId: BoardId,
  from: Position,
  to: Position,
  expectedSlot?: PlayerSlot,
): boolean {
  const piece = getPiece(board, from);
  if (!piece) return false;
  if (expectedSlot !== undefined && piece.ownerSlot !== expectedSlot) {
    return false;
  }
  return getValidMovesForPiece(board, boardId, from).some(
    (dest) => dest.row === to.row && dest.col === to.col,
  );
}

export function applyMoveToBoard(
  board: Board,
  action: MoveAction,
): { board: Board; captured: PlacedTower | null } {
  const piece = getPiece(board, action.from);
  if (!piece) {
    throw new Error("No piece at source");
  }
  if (!isValidMove(board, action.boardId, action.from, action.to)) {
    throw new Error("Invalid move");
  }

  const next = board.map((row) => [...row]) as Board;
  const captured = next[action.to.row][action.to.col];
  next[action.from.row][action.from.col] = null;
  next[action.to.row][action.to.col] = piece;

  return { board: next, captured };
}
