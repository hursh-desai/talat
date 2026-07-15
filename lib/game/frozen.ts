import { canCapturePiece } from "./capture";
import { getValidMovesForPiece } from "./movement";
import type { Board, BoardId, MoveAction, PlayerSlot } from "./types";
import { playersOnBoard } from "./types";

/**
 * A board is frozen when no player can reach a capturable opponent piece
 * via any sequence of legal moves.
 */
export function isBoardFrozen(board: Board, boardId: BoardId): boolean {
  const visited = new Set<string>();
  const queue = [cloneBoard(board)];

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor];
    const key = boardKey(current);
    if (visited.has(key)) continue;
    visited.add(key);

    if (hasImmediateCapture(current, boardId)) {
      return false;
    }

    for (const action of getAllNonCapturingMoves(current, boardId)) {
      queue.push(applyNonCapturingMove(current, action));
    }
  }

  return true;
}

function hasImmediateCapture(board: Board, boardId: BoardId): boolean {
  const [slotA, slotB] = playersOnBoard(boardId);
  for (const slot of [slotA, slotB] as PlayerSlot[]) {
    if (canSlotCaptureOnBoard(board, boardId, slot)) {
      return true;
    }
  }

  return false;
}

function canSlotCaptureOnBoard(
  board: Board,
  boardId: BoardId,
  slot: PlayerSlot,
): boolean {
  for (let row = 0; row < board.length; row++) {
    for (let col = 0; col < board[row].length; col++) {
      const piece = board[row][col];
      if (!piece || piece.ownerSlot !== slot) continue;

      const destinations = getValidMovesForPiece(board, boardId, { row, col });
      for (const dest of destinations) {
        const target = board[dest.row][dest.col];
        if (target && canCapturePiece(piece, target)) {
          return true;
        }
      }
    }
  }

  return false;
}

function getAllNonCapturingMoves(board: Board, boardId: BoardId): MoveAction[] {
  const actions: MoveAction[] = [];

  for (let row = 0; row < board.length; row++) {
    for (let col = 0; col < board[row].length; col++) {
      const piece = board[row][col];
      if (!piece) continue;

      const from = { row, col };
      for (const to of getValidMovesForPiece(board, boardId, from)) {
        if (board[to.row][to.col] !== null) continue;
        actions.push({ kind: "move", boardId, from, to });
      }
    }
  }

  return actions;
}

function applyNonCapturingMove(board: Board, action: MoveAction): Board {
  const next = cloneBoard(board);
  next[action.to.row][action.to.col] = next[action.from.row][action.from.col];
  next[action.from.row][action.from.col] = null;
  return next;
}

function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

function boardKey(board: Board): string {
  return board
    .map((row) =>
      row
        .map((cell) =>
          cell
            ? `${cell.ownerSlot}${cell.height}${cell.sides}`
            : ".",
        )
        .join(","),
    )
    .join("/");
}

export function countFrozenBoards(
  boards: Record<BoardId, Board>,
): number {
  return (["board01", "board02", "board12"] as BoardId[]).filter((id) =>
    isBoardFrozen(boards[id], id),
  ).length;
}

export function computeFrozenBoards(
  boards: Record<BoardId, Board>,
): boolean[] {
  return (["board01", "board02", "board12"] as BoardId[]).map((id) =>
    isBoardFrozen(boards[id], id),
  );
}
