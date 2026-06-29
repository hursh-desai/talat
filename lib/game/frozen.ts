import { canCapturePiece } from "./capture";
import { getValidMovesForPiece } from "./movement";
import type { Board, BoardId, PlayerSlot } from "./types";
import { playersOnBoard } from "./types";

/**
 * A board is frozen when no player can reach a capturable opponent piece
 * via any sequence of legal moves.
 */
export function isBoardFrozen(board: Board, boardId: BoardId): boolean {
  const [slotA, slotB] = playersOnBoard(boardId);

  for (const slot of [slotA, slotB] as PlayerSlot[]) {
    if (canSlotCaptureOnBoard(board, boardId, slot)) {
      return false;
    }
  }

  return true;
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
