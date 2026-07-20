"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { Copy, Home, Menu, X } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
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
  const [awaitingStateVersion, setAwaitingStateVersion] = useState<
    number | null
  >(null);
  const [menuOpen, setMenuOpen] = useState(false);

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
  const isAwaitingServerState =
    awaitingStateVersion !== null &&
    playState?.stateVersion === awaitingStateVersion;
  const interactionLocked = pending || isAwaitingServerState;

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
  const gameDisplay = `Game ${code}`;
  const phaseDisplay =
    status === "setup"
      ? "Setup"
      : status === "playing"
        ? "Live"
        : "Finished";

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

  const handleCopyInvite = useCallback(async () => {
    const inviteUrl =
      typeof window === "undefined" ? code : window.location.href;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success("Invite link copied");
      setMenuOpen(false);
    } catch {
      toast.error("Could not copy invite link");
    }
  }, [code]);

  const submitSetupDrop = useCallback(
    async (tower: TowerSpec, boardId: BoardId, position: Position) => {
      if (
        !playerToken ||
        !playState ||
        controlSlot === null ||
        !isMyTurn ||
        interactionLocked ||
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

      setAwaitingStateVersion(playState.stateVersion);
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
        setAwaitingStateVersion(null);
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
      interactionLocked,
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
        interactionLocked ||
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

      setAwaitingStateVersion(playState.stateVersion);
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
        setAwaitingStateVersion(null);
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
      interactionLocked,
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
          interactive={!!isMyTurn && !interactionLocked}
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
          pending={interactionLocked}
          statusText={statusText}
          onReserveDrop={submitSetupDrop}
          onPieceDrop={submitMoveDrop}
          onPieceSelect={handlePieceSelect}
        />
      </section>

      <div className="pointer-events-none absolute left-3 top-3 z-40 flex max-w-[calc(100%-1.5rem)] items-start gap-2 sm:left-4 sm:top-4">
        <div className="pointer-events-auto relative">
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label={menuOpen ? "Close game menu" : "Open game menu"}
            aria-expanded={menuOpen}
            className="border-black/45 bg-[#120d08]/82 text-[#f3d777] shadow-[0_12px_28px_rgba(0,0,0,0.38)] backdrop-blur hover:border-[#d9bb62]/60 hover:bg-[#1b130c]/92"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X /> : <Menu />}
          </Button>

          {menuOpen && (
            <div className="absolute left-0 top-9 w-64 rounded-md border border-black/45 bg-[#120d08]/92 p-2 text-sm text-white shadow-[0_18px_44px_rgba(0,0,0,0.5)] backdrop-blur">
              <div className="border-b border-white/10 px-2 pb-2">
                <p className="font-semibold text-[#f3d777]">{gameDisplay}</p>
                <p className="mt-0.5 text-xs text-white/55">{statusText}</p>
              </div>

              <div className="mt-2 grid gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-start text-white/76 hover:bg-white/10 hover:text-white"
                  onClick={handleCopyInvite}
                >
                  <Copy />
                  Copy invite link
                </Button>
                <Link
                  href="/"
                  className="inline-flex h-7 items-center justify-start gap-1 rounded-md px-2.5 text-[0.8rem] font-medium text-white/76 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Home className="h-3.5 w-3.5" />
                  Back to lobby
                </Link>
              </div>

              <div className="mt-2 border-t border-white/10 px-2 pt-2">
                <p className="text-[11px] uppercase text-white/38">Seats</p>
                <div className="mt-1 space-y-1">
                  {players.map((player) => (
                    <div
                      key={player.slot}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="text-white/64">
                        {slotLabel(player.slot as PlayerSlot)}
                      </span>
                      <span className="truncate text-white/86">
                        {player.displayName}
                        {player.slot === viewerSlot ? " (you)" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="pointer-events-auto rounded-md border border-black/40 bg-[#120d08]/78 px-2.5 py-1.5 text-xs text-white shadow-[0_12px_28px_rgba(0,0,0,0.34)] backdrop-blur">
          <div className="flex max-w-[72vw] items-center gap-2 sm:max-w-none">
            <span className="font-semibold text-[#f3d777]">{gameDisplay}</span>
            <span className="h-1 w-1 rounded-full bg-white/35" />
            <span className="text-white/70">{phaseDisplay}</span>
            <span className="hidden text-white/45 sm:inline">{turnText}</span>
          </div>
        </div>
      </div>

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
