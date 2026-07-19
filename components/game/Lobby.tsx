"use client";

import { CheckCircle2, Clipboard, Play, UserPlus } from "lucide-react";
import { toast } from "sonner";
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
  onStartSolo: () => void;
  starting?: boolean;
  startingSolo?: boolean;
};

export function Lobby({
  code,
  players,
  viewerSlot,
  isHost,
  onStart,
  onStartSolo,
  starting = false,
  startingSolo = false,
}: LobbyProps) {
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/game/${code}`
      : `/game/${code}`;

  async function copyLink() {
    await navigator.clipboard.writeText(shareUrl);
    toast.success("Invite link copied");
  }

  const slots = [0, 1, 2].map((slot) =>
    players.find((p) => p.slot === slot),
  );
  const missingSeats = Math.max(0, 3 - players.length);
  const hostHint =
    players.length === 3
      ? "All seats are filled. Start the game when everyone is ready."
      : players.length === 1
        ? "Invite two players, or start solo beta to learn the flow alone."
        : `Invite ${missingSeats} more player${missingSeats === 1 ? "" : "s"} to start.`;
  const guestHint =
    missingSeats > 0
      ? `Waiting for ${missingSeats} more player${missingSeats === 1 ? "" : "s"}.`
      : "The host can start the game now.";

  return (
    <Card className="mx-auto max-w-xl border-[#72c7bb]/30 bg-[#101513]">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-white">Waiting for players</CardTitle>
            <p className="mt-1 text-sm text-white/60">
              {isHost ? hostHint : guestHint}
            </p>
          </div>
          <Badge
            variant="outline"
            className="border-[#72c7bb]/50 text-[#b8fff6]"
          >
            Step 2
          </Badge>
        </div>
        <p className="text-sm text-white/60">
          Game code: <span className="font-mono text-white">{code}</span>
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <LobbySignal
            active={players.length >= 1}
            label="Seat joined"
          />
          <LobbySignal
            active={players.length >= 3}
            label={players.length >= 3 ? "Table full" : `${missingSeats} open`}
          />
          <LobbySignal
            active={players.length >= 3}
            label={players.length >= 3 ? "Ready to start" : "Not ready"}
          />
        </div>

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

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            variant="outline"
            className="border-[#72c7bb]/50 bg-[#72c7bb]/8 text-[#c6fff8]"
            onClick={copyLink}
          >
            <Clipboard />
            Copy invite link
          </Button>
          {isHost && (
            <Button
              className="bg-[#72c7bb] text-black hover:bg-[#91dbd1]"
              disabled={players.length < 3 || starting || startingSolo}
              onClick={onStart}
            >
              <Play />
              {starting ? "Starting..." : "Start game"}
            </Button>
          )}
        </div>

        {isHost && (
          <Button
            variant="outline"
            className="w-full border-[#d9bb62]/60 bg-[#d9bb62]/10 text-[#f1e1aa] hover:bg-[#d9bb62]/18"
            disabled={players.length !== 1 || starting || startingSolo}
            onClick={onStartSolo}
          >
            <UserPlus />
            {startingSolo ? "Starting solo..." : "Start solo beta"}
          </Button>
        )}

        {!isHost && players.length < 3 && (
          <p className="text-center text-sm text-white/50">
            Share the link with two friends to begin.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function LobbySignal({ active, label }: { active: boolean; label: string }) {
  return (
    <div
      className={[
        "flex items-center justify-center gap-2 rounded-md border px-2 py-2 text-xs",
        active
          ? "border-[#72c7bb]/50 bg-[#72c7bb]/10 text-[#c6fff8]"
          : "border-white/10 bg-black/20 text-white/45",
      ].join(" ")}
    >
      <CheckCircle2 className="h-3.5 w-3.5" />
      {label}
    </div>
  );
}
