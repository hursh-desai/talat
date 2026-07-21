"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  BookOpen,
  ChevronDown,
  Copy,
  Home,
  Menu,
  ScrollText,
  X,
} from "lucide-react";
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

type GameLogEvent = {
  _id: Id<"gameEvents">;
  _creationTime: number;
  gameId: Id<"games">;
  sequence: number;
  kind: "start" | "setup" | "move" | "rematch";
  actorSlot: number | null;
  description: string;
  playState: PlayState;
  createdAt: number;
};

const RULESET_SECTIONS = [
  {
    title: "Movement",
    items: [
      "Move one piece per turn on one active, non-frozen board.",
      "Empty moves go one square forward or forward-diagonal toward that opponent.",
      "Horizontal moves only happen when you are capturing an adjacent enemy piece.",
    ],
  },
  {
    title: "Captures",
    items: [
      "Large captures Medium. Medium captures Small. Large does not skip straight to Small.",
      "At the same size, more sides capture fewer sides: 6 beats 4, and 4 beats 3.",
      "Extra sides do not let a taller piece skip the one-size capture step.",
      "Small 3-sided pieces can capture Large 6-sided pieces.",
    ],
  },
  {
    title: "Frozen Boards",
    items: [
      "A board freezes when neither player can ever reach a capture on it, even after future quiet moves.",
      "Frozen boards are closed for the rest of the game.",
      "The game ends when 2 of the 3 boards are frozen.",
    ],
  },
  {
    title: "Scoring",
    items: [
      "Each captured piece is worth 5 points.",
      "Each piece on an opponent's starting row at the end is worth 3 points.",
      "Ties go to the player with the highest-rank capture. A full tie is a draw.",
    ],
  },
] as const;

function positionLabel(position: Position): string {
  const column = String.fromCharCode(65 + position.col);
  return `${column}${position.row + 1}`;
}

function boardLabel(boardId: BoardId): string {
  switch (boardId) {
    case "board01":
      return `${slotLabel(0)}-${slotLabel(1)} board`;
    case "board02":
      return `${slotLabel(0)}-${slotLabel(2)} board`;
    case "board12":
      return `${slotLabel(1)}-${slotLabel(2)} board`;
  }
}

function sameTower(a: TowerSpec, b: TowerSpec): boolean {
  return a.height === b.height && a.sides === b.sides;
}

function samePosition(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

function mutationErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("Not your turn")) {
    return "That turn already moved. Wait for the table to catch up.";
  }
  if (message.includes("Invalid setup placement")) {
    return "That piece cannot be placed there.";
  }
  if (message.includes("Invalid move")) {
    return "That piece cannot move there.";
  }
  if (message.includes("Board is frozen")) {
    return "That board is frozen.";
  }
  if (message.includes("You cannot move on that board")) {
    return "Choose one of your active boards.";
  }
  if (
    message.includes("Not in setup phase") ||
    message.includes("Not in play phase")
  ) {
    return "The table moved to the next phase. Wait a beat and try again.";
  }
  if (message.includes("Invalid player token")) {
    return "This browser is no longer seated in the game. Rejoin from the invite link.";
  }

  return fallback;
}

function actionLabel(kind: GameLogEvent["kind"]): string {
  return kind === "setup" ? "Setup" : "Move";
}

function towerLogLabel(tower: TowerSpec): string {
  const height =
    tower.height === 1 ? "Small" : tower.height === 2 ? "Medium" : "Large";
  return `${height} ${tower.sides}`;
}

function gameLogActionText(event: GameLogEvent): string {
  const lastMove = event.playState.lastMove;

  if (event.kind === "setup" && lastMove?.kind === "setup") {
    return `Placed ${towerLogLabel(lastMove.tower)} on ${boardLabel(
      lastMove.boardId,
    )} at ${positionLabel(lastMove.position)}`;
  }

  if (event.kind === "move" && lastMove?.kind === "move") {
    const movedPiece =
      event.playState.boardState.boards[lastMove.boardId][lastMove.to.row][
        lastMove.to.col
      ];
    const movedLabel = movedPiece ? towerLogLabel(movedPiece) : "Piece";
    const path = `${positionLabel(lastMove.from)} to ${positionLabel(
      lastMove.to,
    )}`;

    if (lastMove.captured) {
      return `${movedLabel} captured ${slotLabel(
        lastMove.captured.ownerSlot,
      )} ${towerLogLabel(lastMove.captured)} on ${boardLabel(
        lastMove.boardId,
      )}: ${path}`;
    }

    return `Moved ${movedLabel} on ${boardLabel(lastMove.boardId)}: ${path}`;
  }

  return event.description;
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
  const events = useQuery(
    api.games.getGameEvents,
    playerToken && status !== "waiting" ? { gameId, playerToken } : "skip",
  );
  const [selection, setSelection] = useState<Selection>(null);
  const [starting, setStarting] = useState(false);
  const [startingSolo, setStartingSolo] = useState(false);
  const [rematching, setRematching] = useState(false);
  const [pending, setPending] = useState(false);
  const [awaitingStateVersion, setAwaitingStateVersion] = useState<
    number | null
  >(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [gameLogOpen, setGameLogOpen] = useState(false);
  const [rulesetOpen, setRulesetOpen] = useState(false);
  const activeDropMutationRef = useRef(false);

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

  const gameLogEvents = useMemo(() => {
    if (!events) return [];

    let latestResetIndex = -1;
    events.forEach((event, index) => {
      if (event.kind === "start" || event.kind === "rematch") {
        latestResetIndex = index;
      }
    });

    return events
      .slice(latestResetIndex + 1)
      .filter(
        (event): event is GameLogEvent =>
          event.kind === "setup" || event.kind === "move",
      );
  }, [events]);

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
      if (activeDropMutationRef.current) return;

      activeDropMutationRef.current = true;
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
        toast.error(mutationErrorMessage(e, "Invalid placement"));
      } finally {
        activeDropMutationRef.current = false;
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
      if (activeDropMutationRef.current) return;

      activeDropMutationRef.current = true;
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
        toast.error(mutationErrorMessage(e, "Invalid move"));
      } finally {
        activeDropMutationRef.current = false;
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
            onClick={() => {
              setMenuOpen((open) => {
                if (open) setRulesetOpen(false);
                if (!open) setGameLogOpen(false);
                return !open;
              });
            }}
          >
            {menuOpen ? <X /> : <Menu />}
          </Button>

          {menuOpen && (
            <div className="absolute left-0 top-9 max-h-[calc(100dvh-5.5rem)] w-[min(21rem,calc(100vw-1.5rem))] overflow-y-auto rounded-md border border-black/45 bg-[#120d08]/94 p-2 text-sm text-white shadow-[0_18px_44px_rgba(0,0,0,0.5)] backdrop-blur">
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
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-expanded={rulesetOpen}
                  className="justify-between text-white/76 hover:bg-white/10 hover:text-white"
                  onClick={() => setRulesetOpen((open) => !open)}
                >
                  <span className="inline-flex items-center gap-1">
                    <BookOpen />
                    Ruleset
                  </span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${
                      rulesetOpen ? "rotate-180" : ""
                    }`}
                  />
                </Button>
                {rulesetOpen && (
                  <div className="rounded-md border border-[#d9bb62]/20 bg-black/22 px-3 py-2">
                    <div className="grid gap-3">
                      {RULESET_SECTIONS.map((section) => (
                        <section key={section.title} className="space-y-1.5">
                          <h3 className="text-[11px] font-semibold uppercase text-[#f3d777]/80">
                            {section.title}
                          </h3>
                          <ul className="space-y-1 text-xs leading-5 text-white/68">
                            {section.items.map((item) => (
                              <li
                                key={item}
                                className="grid grid-cols-[0.45rem_minmax(0,1fr)] gap-2"
                              >
                                <span
                                  aria-hidden="true"
                                  className="mt-2 h-1 w-1 rounded-full bg-[#f3d777]/55"
                                />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </section>
                      ))}
                    </div>
                  </div>
                )}
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

      <div className="pointer-events-none absolute right-3 top-3 z-40 sm:right-4 sm:top-4">
        <div className="pointer-events-auto relative">
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            title="Game log"
            aria-label={gameLogOpen ? "Close game log" : "Open game log"}
            aria-expanded={gameLogOpen}
            className="relative border-black/45 bg-[#120d08]/82 text-[#f3d777] shadow-[0_12px_28px_rgba(0,0,0,0.38)] backdrop-blur hover:border-[#d9bb62]/60 hover:bg-[#1b130c]/92"
            onClick={() => {
              setGameLogOpen((open) => {
                if (!open) {
                  setMenuOpen(false);
                  setRulesetOpen(false);
                }
                return !open;
              });
            }}
          >
            {gameLogOpen ? <X /> : <ScrollText />}
            <span className="absolute -right-1.5 -top-1.5 grid min-w-4 place-items-center rounded-full border border-black/55 bg-[#d9bb62] px-1 text-[10px] font-semibold leading-4 text-[#171310]">
              {gameLogEvents.length}
            </span>
          </Button>

          {gameLogOpen && (
            <aside className="absolute right-0 top-9 max-h-[calc(100dvh-5.5rem)] w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-md border border-black/45 bg-[#120d08]/94 text-sm text-white shadow-[0_18px_44px_rgba(0,0,0,0.5)] backdrop-blur">
              <div className="border-b border-white/10 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-[#f3d777]">
                    Game Log
                  </h2>
                  <span className="text-[11px] uppercase text-white/38">
                    {gameLogEvents.length} moves
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-white/55">
                  Moves since this game started.
                </p>
              </div>

              {events === undefined ? (
                <p className="px-3 py-3 text-sm text-white/55">
                  Loading moves...
                </p>
              ) : gameLogEvents.length === 0 ? (
                <p className="px-3 py-3 text-sm text-white/55">
                  Moves will appear here after the first placement.
                </p>
              ) : (
                <ol className="max-h-[min(28rem,calc(100dvh-10rem))] overflow-y-auto px-2 py-2">
                  {gameLogEvents.map((event, index) => {
                    const actorSlot = event.actorSlot as PlayerSlot | null;
                    const actorName =
                      actorSlot === null
                        ? null
                        : players.find((player) => player.slot === actorSlot)
                            ?.displayName;
                    const actor =
                      actorSlot === null
                        ? "System"
                        : actorName
                          ? `${actorName} (${slotLabel(actorSlot)})`
                          : slotLabel(actorSlot);

                    return (
                      <li
                        key={event._id}
                        className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-2 rounded-md px-1.5 py-2"
                      >
                        <span className="mt-0.5 grid h-6 w-6 place-items-center rounded-full border border-[#d9bb62]/40 bg-black/24 text-[11px] font-semibold text-[#f3d777]">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold uppercase text-white/42">
                              {actionLabel(event.kind)}
                            </span>
                            <span className="truncate text-xs text-white/45">
                              {actor}
                            </span>
                          </div>
                          <p className="mt-0.5 text-sm leading-5 text-white/82">
                            {gameLogActionText(event)}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </aside>
          )}
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
