"use client";

import { CAPTURE_POINTS, END_LINE_POINTS } from "@/lib/game/scoring";
import { slotLabel } from "./Tower";

type ScoreboardProps = {
  players: { slot: number; displayName: string }[];
  scores: number[];
  capturedBySlot: Array<Array<{ height: number; sides: number }>>;
  viewerSlot: number | null;
};

export function Scoreboard({
  players,
  scores,
  capturedBySlot,
  viewerSlot,
}: ScoreboardProps) {
  return (
    <div className="mx-auto grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
      {[0, 1, 2].map((slot) => {
        const player = players.find((p) => p.slot === slot);
        const captures = capturedBySlot[slot]?.length ?? 0;
        return (
          <div
            key={slot}
            className={`rounded-lg border px-4 py-3 ${
              viewerSlot === slot
                ? "border-[#c9a227] bg-[#c9a227]/10"
                : "border-white/10 bg-black/40"
            }`}
          >
            <div className="text-xs uppercase tracking-wide text-white/50">
              {slotLabel(slot as 0 | 1 | 2)}
            </div>
            <div className="font-medium">{player?.displayName ?? "—"}</div>
            <div className="mt-1 text-2xl font-semibold text-[#c9a227]">
              {scores[slot] ?? 0}
            </div>
            <div className="mt-1 text-xs text-white/50">
              {captures} captures ({captures * CAPTURE_POINTS} pts)
            </div>
          </div>
        );
      })}
      <p className="col-span-full text-center text-xs text-white/40">
        +{END_LINE_POINTS} pts per tower on opponent&apos;s starting line at game end
      </p>
    </div>
  );
}
