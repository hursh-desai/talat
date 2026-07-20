"use client";

import type {
  BoardId,
  Boards,
  PlacedTower,
  Position,
} from "@/lib/game/types";
import { GameTableCanvas } from "./GameTableCanvas";

type TableSceneProps = {
  boards: Boards;
  frozenBoards: boolean[];
  interactive?: boolean;
  highlightByBoard?: Partial<Record<BoardId, Position[]>>;
  selected?: { boardId: BoardId; position: Position } | null;
  onCellClick?: (
    boardId: BoardId,
    position: Position,
    piece: PlacedTower | null,
  ) => void;
};

export function TableScene({
  boards,
  frozenBoards,
  interactive = false,
  highlightByBoard = {},
  selected,
  onCellClick,
}: TableSceneProps) {
  return (
    <GameTableCanvas
      boards={boards}
      frozenBoards={frozenBoards}
      interactive={interactive}
      highlightByBoard={highlightByBoard}
      selected={selected}
      onPieceSelect={(boardId, position, piece) => {
        onCellClick?.(boardId, position, piece);
      }}
      onPieceDrop={(boardId, from, to) => {
        onCellClick?.(boardId, to, boards[boardId][to.row][to.col]);
        if (from.row === to.row && from.col === to.col) return;
      }}
    />
  );
}
