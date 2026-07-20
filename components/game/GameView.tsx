"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
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
import { GameOverModal } from "./GameOverModal";
import { GameTableCanvas } from "./GameTableCanvas";
import { Lobby } from "./Lobby";
import { slotLabel } from "./Tower";

type GameViewProps = {
  gameId: Id<"games">;
  code: string;
  mode: "multiplayer" | "solo";
  status: "waiting" | "setup" | "playing" | "finished";
  players: { slot: number; displayName: string; isHost: boolean }[];
  viewerSlot: number | null;
  isHost: boolean;
  playerToken: string | null;
  playState: PlayState | null;
  winnerSlot: number | null;
};

type Selection = { kind: "play"; boardId: BoardId; position: Position } | null;

function positionLabel(position: Position): string {
  return `${position.row + 1},${position.col + 1}`;
}

function sameTower(a: TowerSpec, b: TowerSpec): boolean {
  return a.height === b.height && a.sides === b.sides;
}

function samePosition(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

export function GameView({
  gameId,
  code,
  mode,
  status,
  players,
  viewerSlot,
  isHost,
  playerToken,
  playState: rawPlayState,
  winnerSlot,
}: GameViewProps) {
  const viewer = viewerSlot as PlayerSlot | null;
  const startGame = useMutation(api.games.startGame);
  const startSoloGame = useMutation(api.games.startSoloGame);
  const rematchGame = useMutation(api.games.rematchGame);
  const placeTower = useMutation(api.games.placeTower);
  const moveTower = useMutation(api.games.moveTower);
  const [selection, setSelection] = useState<Selection>(null);
  const [starting, setStarting] = useState(false);
  const [startingSolo, setStartingSolo] = useState(false);
  const [rematching, setRematching] = useState(false);
  const [pending, setPending] = useState(false);

  const playState = useMemo(
    () => (rawPlayState ? playStateFromStored(rawPlayState) : null),
    [rawPlayState],
  );

  const isSoloHost = mode === "solo" && isHost;
  const controlSlot =
    isSoloHost && playState ? playState.currentTurnSlot : viewer;
  const isMyTurn =
    playState &&
    controlSlot !== null &&
    playState.currentTurnSlot === controlSlot &&
    playState.status !== "finished";

  const validSetupActions = useMemo(() => {
    if (!playState || controlSlot === null) return [];
    return getValidSetupActions(playState, controlSlot);
  }, [controlSlot, playState]);

  const validPlayActions = useMemo(() => {
    if (!playState || controlSlot === null) return [];
    return getValidPlayActions(playState, controlSlot);
  }, [controlSlot, playState]);

  const highlightByBoard = useMemo(() => {
    const result: Partial<Record<BoardId, Position[]>> = {};

    if (status === "setup") {
      for (const action of validSetupActions) {
        result[action.boardId] = [
          ...(result[action.boardId] ?? []),
          action.position,
        ];
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
          samePosition(action.from, selection.position)
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

  const currentPlayer = useMemo(
    () =>
      playState
        ? players.find((player) => player.slot === playState.currentTurnSlot)
        : undefined,
    [players, playState],
  );

  const lastMoveText = useMemo(() => {
    if (!playState?.lastMove) return "Opening position";

    const actor =
      players.find((player) => player.slot === playState.lastMove?.slot)
        ?.displayName ?? slotLabel(playState.lastMove.slot);

    if (playState.lastMove.kind === "setup") {
      return `${actor} placed a piece at ${positionLabel(
        playState.lastMove.position,
      )}`;
    }

    const captured = playState.lastMove.captured ? " and captured" : "";
    return `${actor} moved from ${positionLabel(
      playState.lastMove.from,
    )} to ${positionLabel(playState.lastMove.to)}${captured}`;
  }, [players, playState]);

  const turnText =
    playState && playState.status !== "finished"
      ? isSoloHost
        ? `Solo beta: controlling ${slotLabel(playState.currentTurnSlot)}`
        : isMyTurn
          ? "Your turn"
          : `Waiting for ${
              currentPlayer?.displayName ?? slotLabel(playState.currentTurnSlot)
            }`
      : "Finished";

  const statusText = `${status}. ${turnText}. ${lastMoveText}.`;

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

  const handleStartSolo = useCallback(async () => {
    if (!playerToken) return;
    setStartingSolo(true);
    try {
      await startSoloGame({ gameId, playerToken });
      setSelection(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start solo beta");
    } finally {
      setStartingSolo(false);
    }
  }, [gameId, playerToken, startSoloGame]);

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

  const submitSetupDrop = useCallback(
    async (tower: TowerSpec, boardId: BoardId, position: Position) => {
      if (
        !playerToken ||
        !playState ||
        controlSlot === null ||
        !isMyTurn ||
        pending ||
        status !== "setup"
      ) {
        return;
      }

      const valid = validSetupActions.find(
        (action) =>
          action.boardId === boardId &&
          samePosition(action.position, position) &&
          sameTower(action.tower, tower),
      );
      if (!valid) return;

      setPending(true);
      try {
        await placeTower({
          gameId,
          playerToken,
          actingSlot: isSoloHost ? controlSlot : undefined,
          boardId,
          position,
          tower,
        });
        setSelection(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Invalid placement");
      } finally {
        setPending(false);
      }
    },
    [
      controlSlot,
      gameId,
      isMyTurn,
      isSoloHost,
      pending,
      placeTower,
      playState,
      playerToken,
      status,
      validSetupActions,
    ],
  );

  const submitMoveDrop = useCallback(
    async (
      boardId: BoardId,
      from: Position,
      to: Position,
      piece: PlacedTower,
    ) => {
      if (
        !playerToken ||
        !playState ||
        controlSlot === null ||
        !isMyTurn ||
        pending ||
        status !== "playing" ||
        piece.ownerSlot !== controlSlot
      ) {
        return;
      }

      const valid = validPlayActions.find(
        (action) =>
          action.boardId === boardId &&
          samePosition(action.from, from) &&
          samePosition(action.to, to),
      );
      if (!valid) return;

      setPending(true);
      try {
        await moveTower({
          gameId,
          playerToken,
          actingSlot: isSoloHost ? controlSlot : undefined,
          boardId,
          from,
          to,
        });
        setSelection(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Invalid move");
      } finally {
        setPending(false);
      }
    },
    [
      controlSlot,
      gameId,
      isMyTurn,
      isSoloHost,
      moveTower,
      pending,
      playState,
      playerToken,
      status,
      validPlayActions,
    ],
  );

  const handlePieceSelect = useCallback(
    (boardId: BoardId, position: Position, piece: PlacedTower) => {
      if (status !== "playing" || controlSlot === null) return;
      if (!isMyTurn || piece.ownerSlot !== controlSlot) return;
      setSelection({ kind: "play", boardId, position });
    },
    [controlSlot, isMyTurn, status],
  );

  if (status === "waiting") {
    return (
      <Lobby
        code={code}
        players={players}
        viewerSlot={viewerSlot}
        isHost={isHost}
        onStart={handleStart}
        onStartSolo={handleStartSolo}
        starting={starting}
        startingSolo={startingSolo}
      />
    );
  }

  if (!playState) {
    return <p className="text-center text-white/60">Loading game state...</p>;
  }

  return (
    <div className="relative h-full min-h-[calc(100dvh-5rem)]">
      <section className="absolute inset-0" aria-label={statusText}>
        <GameTableCanvas
          boards={playState.boardState.boards}
          frozenBoards={playState.frozenBoards}
          interactive={!!isMyTurn && !pending}
          setupReserves={
            status === "setup" && controlSlot !== null
              ? playState.boardState.reserves[controlSlot]
              : []
          }
          controlSlot={controlSlot}
          activeSlot={playState.currentTurnSlot}
          scores={playState.scores}
          capturedBySlot={playState.capturedBySlot}
          highlightByBoard={highlightByBoard}
          selected={
            selection?.kind === "play"
              ? { boardId: selection.boardId, position: selection.position }
              : null
          }
          pending={pending}
          statusText={statusText}
          onReserveDrop={submitSetupDrop}
          onPieceDrop={submitMoveDrop}
          onPieceSelect={handlePieceSelect}
        />
      </section>

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
    </div>
  );
}
