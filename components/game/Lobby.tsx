"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { slotLabel } from "./Tower";

type Player = {
  slot: number;
  displayName: string;
  isHost: boolean;
};

type LobbyProps = {
  code: string;
  players: Player[];
  viewerSlot: number | null;
  isHost: boolean;
  onStart: () => void;
  starting?: boolean;
};

export function Lobby({
  code,
  players,
  viewerSlot,
  isHost,
  onStart,
  starting = false,
}: LobbyProps) {
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/game/${code}`
      : `/game/${code}`;

  async function copyLink() {
    await navigator.clipboard.writeText(shareUrl);
  }

  const slots = [0, 1, 2].map((slot) =>
    players.find((p) => p.slot === slot),
  );

  return (
    <Card className="mx-auto max-w-md border-[#c9a227]/30 bg-black/60">
      <CardHeader>
        <CardTitle className="text-[#c9a227]">Waiting for players</CardTitle>
        <p className="text-sm text-white/60">
          Game code: <span className="font-mono text-white">{code}</span>
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {slots.map((player, slot) => (
            <div
              key={slot}
              className="flex items-center justify-between rounded-md border border-white/10 px-3 py-2"
            >
              <span className="text-sm text-white/70">{slotLabel(slot as 0 | 1 | 2)}</span>
              {player ? (
                <div className="flex items-center gap-2">
                  <span>{player.displayName}</span>
                  {player.isHost && <Badge variant="outline">Host</Badge>}
                  {viewerSlot === slot && (
                    <Badge className="bg-[#c9a227] text-black">You</Badge>
                  )}
                </div>
              ) : (
                <span className="text-sm text-white/40">Empty seat</span>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 border-[#c9a227]/50"
            onClick={copyLink}
          >
            Copy invite link
          </Button>
          {isHost && (
            <Button
              className="flex-1 bg-[#c9a227] text-black hover:bg-[#d4b23a]"
              disabled={players.length < 3 || starting}
              onClick={onStart}
            >
              {starting ? "Starting…" : "Start game"}
            </Button>
          )}
        </div>

        {!isHost && players.length < 3 && (
          <p className="text-center text-sm text-white/50">
            Share the link with two friends to begin.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
