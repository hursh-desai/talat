"use client";

import type {
  Board,
  BoardId,
  PlacedTower,
  PlayerSlot,
  Position,
} from "@/lib/game/types";
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
  variant?: "active" | "mini" | "table";
  showLabel?: boolean;
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
  variant = "active",
  showLabel = true,
}: BoardProps) {
  const highlightSet = new Set(highlightPositions.map(posKey));
  const selectedKey = selectedPosition ? posKey(selectedPosition) : null;
  const isMini = variant === "mini";
  const isTable = variant === "table";
  const pieceSize = isMini || isTable ? "sm" : "lg";

  return (
    <div
      className={cn(
        "flex w-full flex-col items-center",
        isMini ? "gap-1.5" : "gap-3",
        frozen && "opacity-60",
      )}
    >
      {showLabel && (
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-[#d9bb62]">{label}</h3>
          {frozen && (
            <span className="rounded bg-white/10 px-2 py-0.5 text-xs text-white/70">
              Frozen
            </span>
          )}
        </div>
      )}
      <div
        className={cn(
          "relative grid aspect-square w-full grid-cols-5 overflow-hidden border bg-[#16110d] shadow-[0_22px_45px_rgba(0,0,0,0.42)]",
          "before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(135deg,rgba(255,255,255,0.1),rgba(255,255,255,0)_38%,rgba(0,0,0,0.22))]",
          "after:pointer-events-none after:absolute after:inset-x-2 after:bottom-0 after:h-2 after:bg-black/30",
          isMini
            ? "max-w-32 gap-1 rounded-md border-white/15 p-1 shadow-[0_10px_24px_rgba(0,0,0,0.35)]"
            : isTable
              ? "max-w-none gap-0.5 rounded-[3px] border-black p-1.5 shadow-[0_18px_26px_rgba(0,0,0,0.34)] sm:gap-1 sm:p-2"
              : "max-w-[min(64vw,560px)] gap-1 rounded-lg border-[#d9bb62]/35 p-2 sm:max-w-[min(82vw,560px)]",
        )}
        style={{
          transform: isMini
            ? "perspective(520px) rotateX(10deg)"
            : isTable
              ? "none"
            : "perspective(900px) rotateX(7deg)",
          transformOrigin: "center bottom",
        }}
      >
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
                  "relative z-10 flex aspect-square min-w-0 items-center justify-center border transition duration-150",
                  isMini || isTable ? "rounded-[1px]" : "rounded-[4px]",
                  isStartRow
                    ? "border-[#b5763c]/55 bg-[#efe8dc]"
                    : "border-[#b5763c]/50 bg-[#dcd6cc]",
                  "shadow-[inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-3px_0_rgba(0,0,0,0.18)]",
                  isHighlighted &&
                    "border-[#f2ca58] bg-[#e7c46d] ring-2 ring-[#f2ca58]/80 ring-offset-1 ring-offset-[#16110d]",
                  isSelected &&
                    "border-white bg-[#f4ead0] ring-2 ring-white/80 ring-offset-1 ring-offset-[#16110d]",
                  interactive && "cursor-pointer hover:-translate-y-0.5 hover:border-[#f2ca58]/80",
                  !interactive && "cursor-default",
                )}
              >
                {cell && (
                  <TowerPiece tower={cell} size={pieceSize} physical />
                )}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
