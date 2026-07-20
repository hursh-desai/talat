import {
  applyPlayMove,
  applySetupMove,
  createPlayStateFromWaiting,
  playStateFromStored,
  type PlayState,
} from "../applyMove";
import { rankLabel } from "../scoring";
import type {
  BoardId,
  LastMove,
  PlayerSlot,
  Position,
  TowerSpec,
} from "../types";

export const GAME_SCHEMA_VERSION = 1;

export type GameState = PlayState;

export type StartCommand = {
  kind: "start";
  mode: "multiplayer" | "solo";
};

export type RematchCommand = {
  kind: "rematch";
};

export type SetupPlaceCommand = {
  kind: "setup.place";
  actorSlot: PlayerSlot;
  boardId: BoardId;
  position: Position;
  tower: TowerSpec;
};

export type PlayMoveCommand = {
  kind: "play.move";
  actorSlot: PlayerSlot;
  boardId: BoardId;
  from: Position;
  to: Position;
};

export type GameCommand =
  | StartCommand
  | RematchCommand
  | SetupPlaceCommand
  | PlayMoveCommand;

export type EngineEvent = {
  kind: "start" | "setup" | "move" | "rematch";
  commandKind: GameCommand["kind"];
  actorSlot: PlayerSlot | null;
  description: string;
  schemaVersion: number;
  stateVersion: number;
};

export type EngineEffect =
  | { kind: "status.changed"; status: GameState["status"] }
  | { kind: "winner.declared"; winnerSlot: PlayerSlot | null };

export type EngineResult = {
  state: GameState;
  event: EngineEvent;
  effects: EngineEffect[];
};

function nextVersion(state: GameState | null): number {
  return (state?.stateVersion ?? -1) + 1;
}

function normalizeState(state: GameState): GameState {
  return playStateFromStored(state);
}

function withVersion(state: GameState, stateVersion: number): GameState {
  return {
    ...state,
    schemaVersion: GAME_SCHEMA_VERSION,
    stateVersion,
  };
}

function describeTower(tower: TowerSpec): string {
  return rankLabel(tower);
}

function describeLastMove(lastMove: LastMove | null): string {
  if (!lastMove) return "Game started";
  if (lastMove.kind === "setup") {
    return `Placed ${describeTower(lastMove.tower)} on ${lastMove.boardId}`;
  }

  const capture = lastMove.captured
    ? ` and captured ${describeTower(lastMove.captured)}`
    : "";
  return `Moved on ${lastMove.boardId}${capture}`;
}

function effectsFor(previous: GameState | null, next: GameState): EngineEffect[] {
  const effects: EngineEffect[] = [];

  if (previous?.status !== next.status) {
    effects.push({ kind: "status.changed", status: next.status });
  }
  if (previous?.winnerSlot !== next.winnerSlot && next.status === "finished") {
    effects.push({ kind: "winner.declared", winnerSlot: next.winnerSlot });
  }

  return effects;
}

export function applyCommand(
  state: GameState | null,
  command: GameCommand,
): EngineResult {
  const previous = state ? normalizeState(state) : null;
  const stateVersion = nextVersion(previous);
  let next: GameState;
  let event: Omit<EngineEvent, "schemaVersion" | "stateVersion">;

  switch (command.kind) {
    case "start": {
      if (previous && previous.status !== "finished") {
        throw new Error("Game already started");
      }
      next = createPlayStateFromWaiting();
      event = {
        kind: "start",
        commandKind: command.kind,
        actorSlot: null,
        description:
          command.mode === "solo" ? "Solo beta game started" : "Game started",
      };
      break;
    }

    case "rematch": {
      if (!previous || previous.status !== "finished") {
        throw new Error("Rematch is available after the game ends");
      }
      next = createPlayStateFromWaiting();
      event = {
        kind: "rematch",
        commandKind: command.kind,
        actorSlot: null,
        description: "Rematch started",
      };
      break;
    }

    case "setup.place": {
      if (!previous) throw new Error("Game not in progress");
      next = applySetupMove(previous, command.actorSlot, {
        kind: "setup",
        boardId: command.boardId,
        position: command.position,
        tower: command.tower,
      });
      event = {
        kind: "setup",
        commandKind: command.kind,
        actorSlot: command.actorSlot,
        description: describeLastMove(next.lastMove),
      };
      break;
    }

    case "play.move": {
      if (!previous) throw new Error("Game not in progress");
      next = applyPlayMove(previous, command.actorSlot, {
        kind: "move",
        boardId: command.boardId,
        from: command.from,
        to: command.to,
      });
      event = {
        kind: "move",
        commandKind: command.kind,
        actorSlot: command.actorSlot,
        description: describeLastMove(next.lastMove),
      };
      break;
    }
  }

  const versioned = withVersion(next, stateVersion);
  return {
    state: versioned,
    event: {
      ...event,
      schemaVersion: GAME_SCHEMA_VERSION,
      stateVersion,
    },
    effects: effectsFor(previous, versioned),
  };
}

export function stableSerializeGameState(state: GameState): string {
  return stableSerialize(playStateFromStored(state));
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(object[key])}`)
    .join(",")}}`;
}
