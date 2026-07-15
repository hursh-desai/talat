"use client";

import type { Board, BoardId, PlacedTower, PlayerSlot, Position } from "@/lib/game/types";
import { playersOnBoard } from "@/lib/game/types";
import { startingRow } from "@/lib/game/geometry";
import { TowerPiece } from "./Tower";
import { cn } from "@/lib/utils";

type BoardProps = {
  boardId: BoardId;
  board: Board;
  label: string;
  frozen?: boolean;
  interactive?: boolean;
  highlightPositions?: Position[];
  selectedPosition?: Position | null;
  onCellClick?: (position: Position, piece: PlacedTower | null) => void;
  viewerSlot?: PlayerSlot | null;
};

function posKey(p: Position): string {
  return `${p.row},${p.col}`;
}

export function BoardGrid({
  boardId,
  board,
  label,
  frozen = false,
  interactive = false,
  highlightPositions = [],
  selectedPosition,
  onCellClick,
}: BoardProps) {
  const highlightSet = new Set(highlightPositions.map(posKey));
  const selectedKey = selectedPosition ? posKey(selectedPosition) : null;

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2",
        frozen && "opacity-60",
      )}
    >
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium text-[#c9a227]">{label}</h3>
        {frozen && (
          <span className="rounded bg-white/10 px-2 py-0.5 text-xs text-white/70">
            Frozen
          </span>
        )}
      </div>
      <div className="grid grid-cols-5 gap-0.5 rounded-lg border border-[#c9a227]/30 bg-black/40 p-1">
        {board.map((row, rowIndex) =>
          row.map((cell, colIndex) => {
            const position = { row: rowIndex, col: colIndex };
            const key = posKey(position);
            const [playerA, playerB] = playersOnBoard(boardId);
            const isStartRow =
              rowIndex === startingRow(boardId, playerA) ||
              rowIndex === startingRow(boardId, playerB);
            const isHighlighted = highlightSet.has(key);
            const isSelected = selectedKey === key;
            const cellLabel = `${label} row ${rowIndex + 1} column ${
              colIndex + 1
            }${cell ? ` ${cell.ownerSlot}` : " empty"}`;

            return (
              <button
                key={key}
                type="button"
                data-testid={`cell-${boardId}-${rowIndex}-${colIndex}`}
                aria-label={cellLabel}
                disabled={!interactive}
                onClick={() => onCellClick?.(position, cell)}
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-sm border transition-colors sm:h-14 sm:w-14",
                  isStartRow ? "bg-white/10" : "bg-white/5",
                  isHighlighted && "border-[#c9a227] bg-[#c9a227]/20 ring-1 ring-[#c9a227]",
                  isSelected && "border-white bg-white/20",
                  interactive && "cursor-pointer hover:border-[#c9a227]/60",
                  !interactive && "cursor-default",
                )}
              >
                {cell && <TowerPiece tower={cell} size="sm" />}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
