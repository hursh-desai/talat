"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { History, X } from "lucide-react";
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
import { BoardGrid } from "./Board";
import { BOARD_LABELS, BOARD_ORDER } from "./TriangleLayout";
import { Scoreboard } from "./Scoreboard";
import { GameOverModal } from "./GameOverModal";
import { GameTimeline } from "./GameTimeline";
import { Lobby } from "./Lobby";
import { TowerPiece, towerLabel } from "./Tower";
import { slotLabel } from "./Tower";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

const BOARD_INDEX: Record<BoardId, number> = {
  board01: 0,
  board02: 1,
  board12: 2,
};

function positionLabel(position: Position): string {
  return `${position.row + 1},${position.col + 1}`;
}

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
  const [activeBoard, setActiveBoard] = useState<BoardId>(
    viewerSlot === 2 ? "board02" : "board01",
  );
  const [showHistory, setShowHistory] = useState(false);
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

  const currentPlayer = useMemo(
    () =>
      playState
        ? players.find((p) => p.slot === playState.currentTurnSlot)
        : undefined,
    [players, playState],
  );

  const boardStats = useMemo(() => {
    if (!playState) return [];

    return BOARD_ORDER.map((boardId) => {
      const board = playState.boardState.boards[boardId];
      const cells = board.flat();
      const ownPieces =
        viewer === null
          ? 0
          : cells.filter((piece) => piece?.ownerSlot === viewer).length;
      const openActions = highlightByBoard[boardId]?.length ?? 0;

      return {
        boardId,
        ownPieces,
        totalPieces: cells.filter(Boolean).length,
        openActions,
        frozen: playState.frozenBoards[BOARD_INDEX[boardId]],
      };
    });
  }, [highlightByBoard, playState, viewer]);

  const activeBoardHighlights = highlightByBoard[activeBoard] ?? [];

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
      ? isMyTurn
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
        ? `${towerLabel(selection.tower)} can land on ${activeBoardHighlights.length} spaces here`
        : "Your hand is the move menu"
      : selection?.kind === "play"
        ? `${activeBoardHighlights.length} legal moves from ${positionLabel(selection.position)}`
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

  return (
    <div className="min-h-[calc(100dvh-7rem)] pb-28 lg:pb-0">
      <header className="mx-auto max-w-5xl space-y-3">
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
        />
      </header>

      <main className="mx-auto mt-4 grid max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="min-w-0">
          <div className="grid grid-cols-3 gap-2">
          {boardStats.map((stat) => {
            const selectedBoard = stat.boardId === activeBoard;
            return (
              <button
                key={stat.boardId}
                type="button"
                aria-pressed={selectedBoard}
                onClick={() => setActiveBoard(stat.boardId)}
                className={cn(
                  "min-w-0 rounded-md border px-2 py-2 text-left transition",
                  selectedBoard
                    ? "border-[#d9bb62] bg-[#d9bb62]/16 shadow-[0_0_18px_rgba(217,187,98,0.16)]"
                    : "border-white/10 bg-[#121816]/78 hover:border-[#d9bb62]/50",
                )}
              >
                <span className="block truncate text-xs font-medium text-white/86">
                  {BOARD_LABELS[stat.boardId]}
                </span>
                <span className="mt-1 flex items-center gap-1.5 text-[11px] text-white/45">
                  <span>{stat.totalPieces} pieces</span>
                  {stat.frozen ? (
                    <span className="text-[#8fb7ff]">frozen</span>
                  ) : stat.openActions > 0 ? (
                    <span className="text-[#d9bb62]">{stat.openActions} lit</span>
                  ) : (
                    <span>{stat.ownPieces} yours</span>
                  )}
                </span>
              </button>
            );
          })}
          </div>

          <section className="relative mt-3 overflow-hidden rounded-lg border border-white/10 bg-[#101412] px-3 pb-6 pt-4 shadow-[0_30px_70px_rgba(0,0,0,0.34)] sm:px-5 sm:pb-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(217,187,98,0.16),transparent_34%),linear-gradient(180deg,rgba(27,62,54,0.54),rgba(12,12,10,0.9))]" />
          <div className="relative flex items-center justify-between gap-3 pb-3">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-[#f1e1aa]">
                {BOARD_LABELS[activeBoard]}
              </h2>
              <p className="text-xs text-white/45">
                {playState.frozenBoards[BOARD_INDEX[activeBoard]]
                  ? "Board frozen"
                  : activeBoardHighlights.length > 0
                    ? `${activeBoardHighlights.length} legal spaces glowing`
                    : "No lit spaces on this board"}
              </p>
            </div>
            {pending && (
              <span className="text-xs font-medium text-[#d9bb62]">
                Sending...
              </span>
            )}
          </div>

          <div className="relative mx-auto flex max-w-[600px] justify-center py-2">
            <div className="pointer-events-none absolute inset-x-8 bottom-0 h-7 rounded-full bg-black/45 blur-xl" />
            <BoardGrid
              boardId={activeBoard}
              board={playState.boardState.boards[activeBoard]}
              label={BOARD_LABELS[activeBoard]}
              frozen={playState.frozenBoards[BOARD_INDEX[activeBoard]]}
              interactive={
                ((status === "setup" &&
                  selection?.kind === "setup" &&
                  !!isMyTurn) ||
                  (status === "playing" && !!isMyTurn)) &&
                !playState.frozenBoards[BOARD_INDEX[activeBoard]]
              }
              highlightPositions={activeBoardHighlights}
              selectedPosition={
                selection?.kind === "play" && selection.boardId === activeBoard
                  ? selection.position
                  : null
              }
              onCellClick={(pos, piece) =>
                handleCellClick(activeBoard, pos, piece)
              }
              viewerSlot={viewer}
              showLabel={false}
            />
          </div>
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

        <section className="fixed inset-x-0 bottom-0 z-[70] border-t border-white/10 bg-[#080a09]/92 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 shadow-[0_-18px_45px_rgba(0,0,0,0.46)] backdrop-blur lg:static lg:inset-auto lg:rounded-lg lg:border lg:p-3 lg:shadow-[0_18px_50px_rgba(0,0,0,0.3)]">
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

          {status === "setup" && viewer !== null && isMyTurn ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {playState.boardState.reserves[viewer].map((tower) => {
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
                      const firstBoard = validSetupActions.find(
                        (action) =>
                          action.tower.height === tower.height &&
                          action.tower.sides === tower.sides,
                      )?.boardId;
                      if (firstBoard) setActiveBoard(firstBoard);
                    }}
                    className={cn(
                      "grid h-20 min-w-16 place-items-center rounded-md border bg-[#111513] transition",
                      selected
                        ? "border-[#d9bb62] bg-[#d9bb62]/18"
                        : "border-white/10 hover:border-[#d9bb62]/55",
                    )}
                  >
                    <TowerPiece tower={tower} slot={viewer} size="md" physical />
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
