"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { slotLabel } from "./Tower";

type GameOverModalProps = {
  winnerSlot: number | null;
  players: { slot: number; displayName: string }[];
  scores: number[];
  isHost?: boolean;
  onRematch?: () => void;
  rematching?: boolean;
};

export function GameOverModal({
  winnerSlot,
  players,
  scores,
  isHost = false,
  onRematch,
  rematching = false,
}: GameOverModalProps) {
  const sorted = [0, 1, 2]
    .map((slot) => ({
      slot,
      name: players.find((p) => p.slot === slot)?.displayName ?? slotLabel(slot as 0 | 1 | 2),
      score: scores[slot] ?? 0,
    }))
    .sort((a, b) => b.score - a.score);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <Card className="w-full max-w-md border-[#c9a227]/40 bg-[#111]">
        <CardHeader>
          <CardTitle className="text-center text-[#c9a227]">Game Over</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {winnerSlot !== null ? (
            <p className="text-center text-lg">
              <span className="text-[#c9a227]">
                {players.find((p) => p.slot === winnerSlot)?.displayName}
              </span>{" "}
              wins!
            </p>
          ) : (
            <p className="text-center text-lg text-white/80">
              It&apos;s a draw — everybody&apos;s a winner!
            </p>
          )}

          <ol className="space-y-2">
            {sorted.map(({ slot, name, score }, index) => (
              <li
                key={slot}
                className="flex items-center justify-between rounded-md border border-white/10 px-3 py-2"
              >
                <span>
                  #{index + 1} {name}{" "}
                  <span className="text-white/40">({slotLabel(slot as 0 | 1 | 2)})</span>
                </span>
                <span className="font-semibold text-[#c9a227]">{score}</span>
              </li>
            ))}
          </ol>

          <div className="grid gap-2 sm:grid-cols-2">
            {isHost && (
              <Button
                className="bg-[#c9a227] text-black hover:bg-[#d4b23a]"
                onClick={onRematch}
                disabled={rematching}
              >
                {rematching ? "Starting..." : "Rematch"}
              </Button>
            )}
            <Button
              className="bg-[#263d39] text-white hover:bg-[#31504a]"
              onClick={() => (window.location.href = "/")}
            >
              Back home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
