"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { captureResult } from "@/lib/game/capture";
import { rankLabel } from "@/lib/game/scoring";
import {
  getValidPlayActions,
  getValidSetupActions,
  playStateFromStored,
  type PlayState,
} from "@/lib/game/applyMove";
import type {
  BoardId,
  PlacedTower,
  PlayerSlot,
  Position,
  TowerSpec,
} from "@/lib/game/types";
import { TriangleLayout } from "./TriangleLayout";
import { Scoreboard } from "./Scoreboard";
import { GameOverModal } from "./GameOverModal";
import { GameTimeline } from "./GameTimeline";
import { Lobby } from "./Lobby";
import { TowerPiece, towerLabel } from "./Tower";
import { slotLabel } from "./Tower";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type GameViewProps = {
  gameId: Id<"games">;
  code: string;
  status: "waiting" | "setup" | "playing" | "finished";
  players: { slot: number; displayName: string; isHost: boolean }[];
  viewerSlot: number | null;
  isHost: boolean;
  playerToken: string | null;
  playState: PlayState | null;
  winnerSlot: number | null;
};

type Selection =
  | { kind: "setup"; tower: TowerSpec }
  | { kind: "play"; boardId: BoardId; position: Position }
  | null;

export function GameView({
  gameId,
  code,
  status,
  players,
  viewerSlot,
  isHost,
  playerToken,
  playState: rawPlayState,
  winnerSlot,
}: GameViewProps) {
  const startGame = useMutation(api.games.startGame);
  const rematchGame = useMutation(api.games.rematchGame);
  const placeTower = useMutation(api.games.placeTower);
  const moveTower = useMutation(api.games.moveTower);
  const [selection, setSelection] = useState<Selection>(null);
  const [starting, setStarting] = useState(false);
  const [rematching, setRematching] = useState(false);
  const [pending, setPending] = useState(false);

  const playState = useMemo(
    () => (rawPlayState ? playStateFromStored(rawPlayState) : null),
    [rawPlayState],
  );

  const viewer = viewerSlot as PlayerSlot | null;
  const isMyTurn =
    playState &&
    viewer !== null &&
    playState.currentTurnSlot === viewer &&
    playState.status !== "finished";

  const validSetupActions = useMemo(() => {
    if (!playState || viewer === null) return [];
    return getValidSetupActions(playState, viewer);
  }, [playState, viewer]);

  const validPlayActions = useMemo(() => {
    if (!playState || viewer === null) return [];
    return getValidPlayActions(playState, viewer);
  }, [playState, viewer]);

  const highlightByBoard = useMemo(() => {
    const result: Partial<Record<BoardId, Position[]>> = {};

    if (status === "setup" && selection?.kind === "setup") {
      for (const action of validSetupActions) {
        if (
          action.tower.height === selection.tower.height &&
          action.tower.sides === selection.tower.sides
        ) {
          result[action.boardId] = [
            ...(result[action.boardId] ?? []),
            action.position,
          ];
        }
      }
    }

    if (status === "playing" && selection === null) {
      const seen = new Set<string>();
      for (const action of validPlayActions) {
        const key = `${action.boardId}:${action.from.row}:${action.from.col}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result[action.boardId] = [
          ...(result[action.boardId] ?? []),
          action.from,
        ];
      }
    }

    if (status === "playing" && selection?.kind === "play") {
      for (const action of validPlayActions) {
        if (
          action.boardId === selection.boardId &&
          action.from.row === selection.position.row &&
          action.from.col === selection.position.col
        ) {
          result[action.boardId] = [
            ...(result[action.boardId] ?? []),
            action.to,
          ];
        }
      }
    }

    return result;
  }, [status, selection, validSetupActions, validPlayActions]);

  const captureHints = useMemo(() => {
    if (!playState || status !== "playing" || selection?.kind !== "play") {
      return [];
    }

    const board = playState.boardState.boards[selection.boardId];
    const attacker =
      board[selection.position.row]?.[selection.position.col] ?? null;
    if (!attacker) return [];

    return validPlayActions
      .filter(
        (action) =>
          action.boardId === selection.boardId &&
          action.from.row === selection.position.row &&
          action.from.col === selection.position.col,
      )
      .map((action) => ({
        action,
        defender: board[action.to.row][action.to.col],
      }))
      .filter((item) => item.defender !== null)
      .map((item) => ({
        to: item.action.to,
        attacker,
        defender: item.defender!,
        reason: captureResult(attacker, item.defender!).reason,
      }));
  }, [playState, selection, status, validPlayActions]);

  const handleStart = useCallback(async () => {
    if (!playerToken) return;
    setStarting(true);
    try {
      await startGame({ gameId, playerToken });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start game");
    } finally {
      setStarting(false);
    }
  }, [gameId, playerToken, startGame]);

  const handleRematch = useCallback(async () => {
    if (!playerToken) return;
    setRematching(true);
    try {
      await rematchGame({ gameId, playerToken });
      setSelection(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start rematch");
    } finally {
      setRematching(false);
    }
  }, [gameId, playerToken, rematchGame]);

  const handleCellClick = useCallback(
    async (
      boardId: BoardId,
      position: Position,
      piece: PlacedTower | null,
    ) => {
      if (!playerToken || !playState || viewer === null || !isMyTurn || pending) {
        return;
      }

      if (status === "setup") {
        if (selection?.kind !== "setup") return;
        const valid = validSetupActions.find(
          (a) =>
            a.boardId === boardId &&
            a.position.row === position.row &&
            a.position.col === position.col &&
            a.tower.height === selection.tower.height &&
            a.tower.sides === selection.tower.sides,
        );
        if (!valid) return;

        setPending(true);
        try {
          await placeTower({
            gameId,
            playerToken,
            boardId,
            position,
            tower: selection.tower,
          });
          setSelection(null);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Invalid placement");
        } finally {
          setPending(false);
        }
        return;
      }

      if (status === "playing") {
        if (selection?.kind === "play") {
          const valid = validPlayActions.find(
            (a) =>
              a.boardId === boardId &&
              a.from.row === selection.position.row &&
              a.from.col === selection.position.col &&
              a.to.row === position.row &&
              a.to.col === position.col,
          );
          if (valid) {
            setPending(true);
            try {
              await moveTower({
                gameId,
                playerToken,
                boardId,
                from: selection.position,
                to: position,
              });
              setSelection(null);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Invalid move");
            } finally {
              setPending(false);
            }
            return;
          }
        }

        if (piece && piece.ownerSlot === viewer) {
          setSelection({ kind: "play", boardId, position });
        }
      }
    },
    [
      playerToken,
      playState,
      viewer,
      isMyTurn,
      pending,
      status,
      selection,
      validSetupActions,
      validPlayActions,
      placeTower,
      moveTower,
      gameId,
    ],
  );

  if (status === "waiting") {
    return (
      <Lobby
        code={code}
        players={players}
        viewerSlot={viewerSlot}
        isHost={isHost}
        onStart={handleStart}
        starting={starting}
      />
    );
  }

  if (!playState) {
    return (
      <p className="text-center text-white/60">Loading game state…</p>
    );
  }

  const currentPlayer = players.find(
    (p) => p.slot === playState.currentTurnSlot,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Badge variant="outline" className="border-[#c9a227]/50 text-[#c9a227]">
          {status === "setup" ? "Setup phase" : status === "playing" ? "Play phase" : "Finished"}
        </Badge>
        {playState.status !== "finished" && (
          <span className="text-sm text-white/70">
            {isMyTurn ? (
              <span className="text-[#c9a227]">Your turn</span>
            ) : (
              <>
                Waiting for{" "}
                <span className="text-white">
                  {currentPlayer?.displayName ?? slotLabel(playState.currentTurnSlot)}
                </span>
              </>
            )}
          </span>
        )}
      </div>

      <Scoreboard
        players={players}
        scores={playState.scores}
        capturedBySlot={playState.capturedBySlot}
        viewerSlot={viewerSlot}
      />

      {status === "setup" && viewer !== null && isMyTurn && (
        <div className="mx-auto max-w-3xl">
          <p className="mb-2 text-center text-sm text-white/60">
            Select a tower to place on your starting line
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {playState.boardState.reserves[viewer].map((tower) => (
              <button
                key={towerLabel(tower)}
                type="button"
                data-testid={`reserve-${tower.height}-${tower.sides}`}
                aria-label={`Place ${towerLabel(tower)}`}
                onClick={() => setSelection({ kind: "setup", tower })}
                className={cn(
                  "rounded-lg border p-2 transition-colors",
                  selection?.kind === "setup" &&
                    selection.tower.height === tower.height &&
                    selection.tower.sides === tower.sides
                    ? "border-[#c9a227] bg-[#c9a227]/20"
                    : "border-white/10 bg-black/40 hover:border-[#c9a227]/50",
                )}
              >
                <TowerPiece tower={tower} slot={viewer} size="sm" />
                <div className="mt-1 text-center text-xs">{towerLabel(tower)}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {status === "playing" && isMyTurn && !selection && (
        <p className="text-center text-sm text-white/60">
          Click one of your towers to move
        </p>
      )}

      {captureHints.length > 0 && (
        <div className="mx-auto max-w-xl rounded-lg border border-[#c9a227]/30 bg-[#151817] px-4 py-3">
          <p className="text-xs uppercase text-[#c9a227]">Legal capture</p>
          <div className="mt-2 space-y-2">
            {captureHints.map(({ to, attacker, defender, reason }) => (
              <div
                key={`${to.row}-${to.col}`}
                className="text-sm text-white/75"
              >
                <span className="text-white">{rankLabel(attacker)}</span>{" "}
                defeats <span className="text-white">{rankLabel(defender)}</span>
                <span className="text-white/45"> at {to.row + 1},{to.col + 1}</span>
                <div className="text-xs text-white/45">Reason: {reason}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <TriangleLayout
        boards={playState.boardState.boards}
        frozenBoards={playState.frozenBoards}
        interactive={
          (status === "setup" && selection?.kind === "setup" && !!isMyTurn) ||
          (status === "playing" && !!isMyTurn)
        }
        highlightByBoard={highlightByBoard}
        selected={
          selection?.kind === "play"
            ? { boardId: selection.boardId, position: selection.position }
            : null
        }
        onCellClick={handleCellClick}
        viewerSlot={viewer}
      />

      {status === "finished" && (
        <GameOverModal
          winnerSlot={winnerSlot}
          players={players}
          scores={playState.scores}
          isHost={isHost}
          onRematch={handleRematch}
          rematching={rematching}
        />
      )}

      {playerToken && (
        <GameTimeline
          gameId={gameId}
          playerToken={playerToken}
          players={players}
          liveState={playState}
        />
      )}
    </div>
  );
}
