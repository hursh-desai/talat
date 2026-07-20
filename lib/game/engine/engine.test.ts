import { describe, expect, it } from "vitest";
import {
  applyCommand,
  stableSerializeGameState,
  type GameCommand,
  type GameState,
} from ".";
import { commandFromTableDrop } from "./interaction";
import { getValidPlayActions, getValidSetupActions } from "../applyMove";
import { gameCommandValidator, playStateValidator } from "../../../convex/validators";

function playCommands(): GameCommand[] {
  let state: GameState | null = null;
  const commands: GameCommand[] = [{ kind: "start", mode: "solo" }];
  state = applyCommand(state, commands[0]).state;

  while (state.status === "setup") {
    const actorSlot = state.currentTurnSlot;
    const action = getValidSetupActions(state, actorSlot)[0];
    commands.push({
      kind: "setup.place",
      actorSlot,
      boardId: action.boardId,
      position: action.position,
      tower: action.tower,
    });
    state = applyCommand(state, commands[commands.length - 1]).state;
  }

  const actorSlot = state.currentTurnSlot;
  const action = getValidPlayActions(state, actorSlot)[0];
  commands.push({
    kind: "play.move",
    actorSlot,
    boardId: action.boardId,
    from: action.from,
    to: action.to,
  });

  return commands;
}

function replay(commands: GameCommand[]): GameState {
  let state: GameState | null = null;
  for (const command of commands) {
    state = applyCommand(state, command).state;
  }
  if (!state) throw new Error("Expected replayed state");
  return state;
}

describe("deterministic game engine", () => {
  it("replays command lists into byte-stable state", () => {
    const commands = playCommands();
    const first = replay(commands);
    const second = replay(commands);

    expect(stableSerializeGameState(first)).toBe(
      stableSerializeGameState(second),
    );
  });

  it("increments stateVersion exactly once for each accepted command", () => {
    let state: GameState | null = null;
    const commands = playCommands().slice(0, 4);

    commands.forEach((command, index) => {
      const result = applyCommand(state, command);
      expect(result.state.stateVersion).toBe(index);
      expect(result.event.stateVersion).toBe(index);
      state = result.state;
    });
  });

  it("does not mutate state when a command is invalid", () => {
    const state = replay(playCommands().slice(0, 1));
    const before = stableSerializeGameState(state);

    expect(() =>
      applyCommand(state, {
        kind: "play.move",
        actorSlot: 0,
        boardId: "board01",
        from: { row: 0, col: 0 },
        to: { row: 1, col: 0 },
      }),
    ).toThrow("Not in play phase");

    expect(stableSerializeGameState(state)).toBe(before);
  });

  it("exposes Convex validators for canonical state and commands", () => {
    expect(playStateValidator.isConvexValidator).toBe(true);
    expect(gameCommandValidator.isConvexValidator).toBe(true);
  });

  it("maps table drag/drop intents to engine commands", () => {
    expect(
      commandFromTableDrop(
        { kind: "reserve", actorSlot: 1, tower: { height: 2, sides: 4 } },
        { boardId: "board12", position: { row: 4, col: 2 } },
      ),
    ).toEqual({
      kind: "setup.place",
      actorSlot: 1,
      boardId: "board12",
      position: { row: 4, col: 2 },
      tower: { height: 2, sides: 4 },
    });

    expect(
      commandFromTableDrop(
        {
          kind: "piece",
          boardId: "board01",
          position: { row: 0, col: 2 },
          piece: { height: 3, sides: 6, ownerSlot: 0 },
        },
        { boardId: "board01", position: { row: 1, col: 2 } },
      ),
    ).toEqual({
      kind: "play.move",
      actorSlot: 0,
      boardId: "board01",
      from: { row: 0, col: 2 },
      to: { row: 1, col: 2 },
    });
  });
});
