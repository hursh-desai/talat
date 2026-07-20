"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { Circle, History, Map, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
import { BOARD_LABELS } from "./TriangleLayout";
import { Scoreboard } from "./Scoreboard";
import { GameOverModal } from "./GameOverModal";
import { GameTimeline } from "./GameTimeline";
import { Lobby } from "./Lobby";
import { TableScene } from "./TableScene";
import { TowerPiece, towerLabel } from "./Tower";
import { slotLabel } from "./Tower";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { cameraAngleForSlot, type CameraAngle } from "@/lib/game/tableCamera";

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

type Selection =
  | { kind: "setup"; tower: TowerSpec }
  | { kind: "play"; boardId: BoardId; position: Position }
  | null;

const CAMERA_OPTIONS: {
  angle: CameraAngle;
  label: string;
  Icon: LucideIcon;
  iconClassName?: string;
}[] = [
  {
    angle: "black",
    label: "Black perspective",
    Icon: Circle,
    iconClassName: "fill-[#171512] text-[#d9bb62]",
  },
  {
    angle: "white",
    label: "White perspective",
    Icon: Circle,
    iconClassName: "fill-[#f5f5f5] text-[#888]",
  },
  {
    angle: "grey",
    label: "Grey perspective",
    Icon: Circle,
    iconClassName: "fill-[#6b7280] text-[#d9bb62]",
  },
  { angle: "map", label: "Bird's-eye map", Icon: Map },
];

function positionLabel(position: Position): string {
  return `${position.row + 1},${position.col + 1}`;
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
  const [showHistory, setShowHistory] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startingSolo, setStartingSolo] = useState(false);
  const [rematching, setRematching] = useState(false);
  const [pending, setPending] = useState(false);
  const [cameraOverride, setCameraOverride] = useState<CameraAngle | null>(
    null,
  );
  const cameraAngle = cameraOverride ?? cameraAngleForSlot(viewer);

  const playState = useMemo(
    () => (rawPlayState ? playStateFromStored(rawPlayState) : null),
    [rawPlayState],
  );

  const isSoloHost = mode === "solo" && isHost;
  const controlSlot =
    isSoloHost && playState
      ? playState.currentTurnSlot
      : viewer;
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

  const currentPlayer = useMemo(
    () =>
      playState
        ? players.find((p) => p.slot === playState.currentTurnSlot)
        : undefined,
    [players, playState],
  );

  const highlightedSpaceCount = useMemo(
    () =>
      Object.values(highlightByBoard).reduce(
        (total, positions) => total + (positions?.length ?? 0),
        0,
      ),
    [highlightByBoard],
  );

  const lastMoveText = (() => {
    if (!playState?.lastMove) return "Opening position";
    const actor =
      players.find((player) => player.slot === playState.lastMove?.slot)
        ?.displayName ?? slotLabel(playState.lastMove.slot);

    if (playState.lastMove.kind === "setup") {
      return `${actor} placed ${towerLabel(playState.lastMove.tower)} on ${
        BOARD_LABELS[playState.lastMove.boardId]
      } ${positionLabel(playState.lastMove.position)}`;
    }

    const captured = playState.lastMove.captured
      ? ` and captured ${rankLabel(playState.lastMove.captured)}`
      : "";
    return `${actor} moved on ${BOARD_LABELS[playState.lastMove.boardId]} from ${positionLabel(
      playState.lastMove.from,
    )} to ${positionLabel(playState.lastMove.to)}${captured}`;
  })();

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

  const trayTitle =
    status === "setup"
      ? selection?.kind === "setup"
        ? "Place on a lit square"
        : "Choose a piece"
      : selection?.kind === "play"
        ? "Choose a destination"
        : "Choose a piece";

  const trayDetail =
    status === "setup"
      ? selection?.kind === "setup"
        ? `${towerLabel(selection.tower)} has ${highlightedSpaceCount} lit spaces`
        : "Your hand is the move menu"
      : selection?.kind === "play"
        ? `${highlightedSpaceCount} legal moves from ${positionLabel(selection.position)}`
        : isMyTurn
          ? "Movable pieces glow on the board"
          : turnText;

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

  const handleCellClick = useCallback(
    async (
      boardId: BoardId,
      position: Position,
      piece: PlacedTower | null,
    ) => {
      if (
        !playerToken ||
        !playState ||
        controlSlot === null ||
        !isMyTurn ||
        pending
      ) {
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
            actingSlot: isSoloHost ? controlSlot : undefined,
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
                actingSlot: isSoloHost ? controlSlot : undefined,
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

        if (piece && piece.ownerSlot === controlSlot) {
          setSelection({ kind: "play", boardId, position });
        }
      }
    },
    [
      playerToken,
      playState,
      controlSlot,
      isMyTurn,
      isSoloHost,
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
        onStartSolo={handleStartSolo}
        starting={starting}
        startingSolo={startingSolo}
      />
    );
  }

  if (!playState) {
    return (
      <p className="text-center text-white/60">Loading game state…</p>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-7rem)] pb-28 lg:pb-4">
      <header className="mx-auto max-w-6xl space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="border-[#d9bb62]/50 text-[#d9bb62]"
              >
                {status === "setup"
                  ? "Setup"
                  : status === "playing"
                    ? "Live"
                    : "Finished"}
              </Badge>
              <span
                className={cn(
                  "text-sm font-medium",
                  isMyTurn ? "text-[#d9bb62]" : "text-white/62",
                )}
              >
                {turnText}
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-white/42">
              {lastMoveText}
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-white/15 bg-black/30 text-white hover:border-[#d9bb62]/60"
            onClick={() => setShowHistory((open) => !open)}
          >
            {showHistory ? <X /> : <History />}
            {showHistory ? "Close" : "History"}
          </Button>
        </div>

        <Scoreboard
          players={players}
          scores={playState.scores}
          capturedBySlot={playState.capturedBySlot}
          viewerSlot={viewerSlot}
          activeSlot={controlSlot}
        />
      </header>

      <main className="mx-auto mt-3 grid max-w-6xl gap-3 lg:grid-cols-[minmax(0,1fr)_248px] lg:items-start">
        <div className="min-w-0">
          <section className="relative h-[420px] overflow-hidden rounded-md border border-black/40 bg-[#130d09] shadow-[0_30px_70px_rgba(0,0,0,0.34)] sm:h-[min(58vh,560px)] lg:h-[min(60vh,680px)]">
            {pending && (
              <span className="absolute right-3 top-3 z-30 rounded-sm border border-black/30 bg-[#1a120b]/80 px-2 py-1 text-xs font-medium text-[#f1d892]">
                Sending...
              </span>
            )}

            <div className="absolute left-3 top-3 z-30 flex rounded-md border border-black/35 bg-[#120d08]/76 p-1 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur">
              {CAMERA_OPTIONS.map(({ angle, label, Icon, iconClassName }) => {
                const active = cameraAngle === angle;

                return (
                  <button
                    key={angle}
                    type="button"
                    aria-label={label}
                    title={label}
                    aria-pressed={active}
                    data-testid={`camera-${angle}`}
                    onClick={() => {
                      setCameraOverride(angle);
                    }}
                    className={cn(
                      "grid h-8 w-8 place-items-center rounded-sm border transition",
                      active
                        ? "border-[#d9bb62]/70 bg-[#d9bb62]/18 text-[#f3d777]"
                        : "border-transparent text-white/60 hover:border-white/18 hover:bg-white/8 hover:text-white",
                    )}
                  >
                    <Icon
                      className={cn("h-4 w-4", iconClassName)}
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
            </div>

            <TableScene
              boards={playState.boardState.boards}
              frozenBoards={playState.frozenBoards}
              interactive={!!isMyTurn}
              cameraAngle={cameraAngle}
              highlightByBoard={highlightByBoard}
              selected={
                selection?.kind === "play"
                  ? { boardId: selection.boardId, position: selection.position }
                  : null
              }
              onCellClick={handleCellClick}
            />
          </section>

          {showHistory && playerToken && (
            <div className="mt-4">
              <GameTimeline
                gameId={gameId}
                playerToken={playerToken}
                players={players}
                liveState={playState}
              />
            </div>
          )}
          </div>

        <section className="fixed inset-x-0 bottom-0 z-[70] border-t border-black/40 bg-[#120d08]/94 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 shadow-[0_-18px_45px_rgba(0,0,0,0.46)] backdrop-blur lg:static lg:inset-auto lg:rounded-md lg:border lg:p-3 lg:shadow-[0_18px_50px_rgba(0,0,0,0.3)]">
        <div className="mx-auto max-w-5xl">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-white">
                {trayTitle}
              </h2>
              <p className="truncate text-xs text-white/45">{trayDetail}</p>
            </div>
            {selection && (
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Clear selection"
                className="border-white/15 bg-black/30"
                onClick={() => setSelection(null)}
              >
                <X />
              </Button>
            )}
          </div>

          {status === "setup" && controlSlot !== null && isMyTurn ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {playState.boardState.reserves[controlSlot].map((tower) => {
                const selected =
                  selection?.kind === "setup" &&
                  selection.tower.height === tower.height &&
                  selection.tower.sides === tower.sides;

                return (
                  <button
                    key={towerLabel(tower)}
                    type="button"
                    data-testid={`reserve-${tower.height}-${tower.sides}`}
                    aria-label={`Place ${towerLabel(tower)}`}
                    onClick={() => {
                      setSelection({ kind: "setup", tower });
                    }}
                    className={cn(
                      "grid h-20 min-w-16 place-items-center rounded-md border bg-[#111513] transition",
                      selected
                        ? "border-[#d9bb62] bg-[#d9bb62]/18"
                        : "border-white/10 hover:border-[#d9bb62]/55",
                    )}
                  >
                    <TowerPiece
                      tower={tower}
                      slot={controlSlot}
                      size="md"
                      physical
                    />
                  </button>
                );
              })}
            </div>
          ) : captureHints.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {captureHints.map(({ to, attacker, defender, reason }) => (
                <div
                  key={`${to.row}-${to.col}`}
                  className="min-w-[220px] rounded-md border border-[#d9bb62]/30 bg-[#151817] px-3 py-2"
                >
                  <p className="text-xs font-medium text-[#d9bb62]">
                    Capture at {positionLabel(to)}
                  </p>
                  <p className="mt-1 text-xs text-white/68">
                    {rankLabel(attacker)} beats {rankLabel(defender)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-white/42">{reason}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-12 items-center rounded-md border border-white/10 bg-[#111513] px-3 text-sm text-white/50">
              {status === "finished"
                ? "Game complete"
                : isMyTurn
                  ? "Tap a glowing piece or switch boards"
                  : "The table will update when the turn changes"}
            </div>
          )}
        </div>
        </section>
      </main>

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
