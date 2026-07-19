"use client";

import { CAPTURE_POINTS, END_LINE_POINTS } from "@/lib/game/scoring";
import { slotLabel } from "./Tower";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ScoreboardProps = {
  players: { slot: number; displayName: string }[];
  scores: number[];
  capturedBySlot: Array<Array<{ height: number; sides: number }>>;
  viewerSlot: number | null;
  activeSlot?: number | null;
};

export function Scoreboard({
  players,
  scores,
  capturedBySlot,
  viewerSlot,
  activeSlot = viewerSlot,
}: ScoreboardProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[0, 1, 2].map((slot) => {
        const player = players.find((p) => p.slot === slot);
        const captures = capturedBySlot[slot]?.length ?? 0;
        const score = scores[slot] ?? 0;
        return (
          <div
            key={slot}
            className={cn(
              "relative min-w-0 overflow-hidden rounded-md border bg-[#111513] px-2.5 py-2",
              activeSlot === slot
                ? "border-[#d9bb62]/80"
                : "border-white/10",
            )}
          >
            <div
              className={cn(
                "absolute inset-y-0 left-0 w-1",
                slot === 0 && "bg-[#d9bb62]",
                slot === 1 && "bg-[#f5f5f5]",
                slot === 2 && "bg-[#8b96a6]",
              )}
            />
            <div className="truncate pl-1 text-[11px] font-medium text-white/45">
              {slotLabel(slot as 0 | 1 | 2)}
            </div>
            <div className="truncate pl-1 text-sm text-white">
              {player?.displayName ?? "-"}
            </div>
            <div className="mt-1 flex items-end justify-between gap-2 pl-1">
              <span className="text-2xl font-semibold leading-none text-[#d9bb62]">
                {score}
              </span>
              <span className="pb-0.5 text-[11px] text-white/45">
                {captures}x{CAPTURE_POINTS}
              </span>
            </div>
            <div className="mt-2 flex min-h-5 flex-wrap gap-1 pl-1">
              {viewerSlot === slot && (
                <Badge className="h-5 bg-[#72c7bb] px-1.5 text-[10px] text-black">
                  You
                </Badge>
              )}
              {activeSlot === slot && (
                <Badge
                  variant="outline"
                  className="h-5 border-[#d9bb62]/50 px-1.5 text-[10px] text-[#f1d892]"
                >
                  Turn
                </Badge>
              )}
            </div>
          </div>
        );
      })}
      <p className="col-span-full text-center text-[11px] text-white/35">
        End line pieces score +{END_LINE_POINTS}
      </p>
    </div>
  );
}
