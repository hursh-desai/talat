"use client";

import type { BoardId, Boards, PlayerSlot, Position } from "@/lib/game/types";
import { BoardGrid } from "./Board";

const BOARD_LABELS: Record<BoardId, string> = {
  board01: "Black ↔ White",
  board02: "Black ↔ Grey",
  board12: "White ↔ Grey",
};

type TriangleLayoutProps = {
  boards: Boards;
  frozenBoards: boolean[];
  interactive?: boolean;
  highlightByBoard?: Partial<Record<BoardId, Position[]>>;
  selected?: { boardId: BoardId; position: Position } | null;
  onCellClick?: (
    boardId: BoardId,
    position: Position,
    piece: import("@/lib/game/types").PlacedTower | null,
  ) => void;
  viewerSlot?: PlayerSlot | null;
};

const BOARD_ORDER: BoardId[] = ["board01", "board02", "board12"];

export function TriangleLayout({
  boards,
  frozenBoards,
  interactive = false,
  highlightByBoard = {},
  selected,
  onCellClick,
  viewerSlot,
}: TriangleLayoutProps) {
  return (
    <div className="mx-auto grid max-w-4xl grid-cols-1 gap-8 md:grid-cols-2 md:gap-6">
      <div className="flex justify-center md:col-span-2">
        <BoardGrid
          boardId="board01"
          board={boards.board01}
          label={BOARD_LABELS.board01}
          frozen={frozenBoards[0]}
          interactive={interactive && !frozenBoards[0]}
          highlightPositions={highlightByBoard.board01}
          selectedPosition={
            selected?.boardId === "board01" ? selected.position : null
          }
          onCellClick={(pos, piece) => onCellClick?.("board01", pos, piece)}
          viewerSlot={viewerSlot}
        />
      </div>
      <div className="flex justify-center">
        <BoardGrid
          boardId="board02"
          board={boards.board02}
          label={BOARD_LABELS.board02}
          frozen={frozenBoards[1]}
          interactive={interactive && !frozenBoards[1]}
          highlightPositions={highlightByBoard.board02}
          selectedPosition={
            selected?.boardId === "board02" ? selected.position : null
          }
          onCellClick={(pos, piece) => onCellClick?.("board02", pos, piece)}
          viewerSlot={viewerSlot}
        />
      </div>
      <div className="flex justify-center">
        <BoardGrid
          boardId="board12"
          board={boards.board12}
          label={BOARD_LABELS.board12}
          frozen={frozenBoards[2]}
          interactive={interactive && !frozenBoards[2]}
          highlightPositions={highlightByBoard.board12}
          selectedPosition={
            selected?.boardId === "board12" ? selected.position : null
          }
          onCellClick={(pos, piece) => onCellClick?.("board12", pos, piece)}
          viewerSlot={viewerSlot}
        />
      </div>
    </div>
  );
}

export { BOARD_ORDER };
