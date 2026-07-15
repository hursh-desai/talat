"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { playStateFromStored, type PlayState } from "@/lib/game/applyMove";
import { TriangleLayout } from "./TriangleLayout";
import { slotLabel } from "./Tower";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type GameTimelineProps = {
  gameId: Id<"games">;
  playerToken: string | null;
  players: { slot: number; displayName: string }[];
  liveState: PlayState;
};

export function GameTimeline({
  gameId,
  playerToken,
  players,
  liveState,
}: GameTimelineProps) {
  const events = useQuery(
    api.games.getGameEvents,
    playerToken ? { gameId, playerToken } : "skip",
  );
  const [selectedSequence, setSelectedSequence] = useState<number | null>(null);

  const selectedEvent = useMemo(() => {
    if (!events || selectedSequence === null) return null;
    return events.find((event) => event.sequence === selectedSequence) ?? null;
  }, [events, selectedSequence]);

  const replayState = selectedEvent
    ? playStateFromStored(selectedEvent.playState)
    : liveState;

  function actorName(slot: number | null): string {
    if (slot === null) return "System";
    return (
      players.find((player) => player.slot === slot)?.displayName ??
      slotLabel(slot as 0 | 1 | 2)
    );
  }

  return (
    <section className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="rounded-lg border border-white/10 bg-[#151817] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Replay board</h2>
            <p className="text-xs text-white/50">
              {selectedEvent
                ? `After turn ${selectedEvent.sequence}: ${selectedEvent.description}`
                : "Live position"}
            </p>
          </div>
          {selectedEvent && (
            <Button
              type="button"
              variant="outline"
              className="border-[#c9a227]/50"
              onClick={() => setSelectedSequence(null)}
            >
              Live
            </Button>
          )}
        </div>
        <TriangleLayout
          boards={replayState.boardState.boards}
          frozenBoards={replayState.frozenBoards}
          interactive={false}
        />
      </div>

      <aside className="rounded-lg border border-white/10 bg-[#151817] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Event feed</h2>
          <Badge variant="outline" className="border-[#c9a227]/40 text-[#c9a227]">
            {events?.length ?? 0}
          </Badge>
        </div>

        {events === undefined ? (
          <p className="text-sm text-white/50">Loading events...</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-white/50">Moves will appear here.</p>
        ) : (
          <ol className="max-h-[520px] space-y-2 overflow-auto pr-1">
            {events.map((event) => {
              const selected = selectedSequence === event.sequence;
              return (
                <li key={event._id}>
                  <button
                    type="button"
                    onClick={() => setSelectedSequence(event.sequence)}
                    className={cn(
                      "w-full rounded-md border px-3 py-2 text-left transition-colors",
                      selected
                        ? "border-[#c9a227] bg-[#c9a227]/15"
                        : "border-white/10 bg-black/20 hover:border-[#c9a227]/50",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs uppercase text-white/40">
                        Turn {event.sequence}
                      </span>
                      <span className="text-xs text-white/45">
                        {actorName(event.actorSlot)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-white/80">
                      {event.description}
                    </p>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </aside>
    </section>
  );
}
