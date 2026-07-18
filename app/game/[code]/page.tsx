"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { GameView } from "@/components/game/GameView";
import { playStateFromStored } from "@/lib/game/applyMove";
import { usePlayerToken } from "@/lib/usePlayerToken";

export default function GamePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const playerToken = usePlayerToken(code);

  const game = useQuery(api.games.getGameByCodeAndToken, {
    code,
    playerToken: playerToken ?? undefined,
  });

  if (game === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-white/60">Loading game…</p>
      </div>
    );
  }

  if (!playerToken) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4">
        <p className="text-center text-white/70">
          You don&apos;t have a seat in game{" "}
          <span className="font-mono text-[#c9a227]">{code}</span>.
        </p>
        <Link href="/" className="text-[#c9a227] underline">
          Go home to create or join
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-3 py-3 sm:px-4 sm:py-6">
      <div className="mb-3 flex items-center justify-between sm:mb-5">
        <div>
          <Link href="/" className="text-sm text-white/40 hover:text-[#c9a227]">
            ← Talat
          </Link>
          <h1 className="text-lg font-semibold text-[#c9a227] sm:text-xl">
            Game {game.code}
          </h1>
        </div>
      </div>

      <GameView
        gameId={game.gameId}
        code={game.code}
        status={game.status}
        players={game.players}
        viewerSlot={game.viewerSlot}
        isHost={game.isHost}
        playerToken={playerToken}
        playState={
          game.playState ? playStateFromStored(game.playState) : null
        }
        winnerSlot={game.winnerSlot}
      />
    </div>
  );
}
