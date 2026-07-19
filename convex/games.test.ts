/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  getValidPlayActions,
  getValidSetupActions,
  playStateFromStored,
  type PlayState,
} from "../lib/game/applyMove";
import type { PlayerSlot } from "../lib/game/types";
import { hashToken } from "./lib/tokens";

const modules = import.meta.glob("./**/*.ts");

type TestBackend = TestConvex<typeof schema>;

function testBackend(): TestBackend {
  return convexTest(schema, modules);
}

async function soloState(
  t: TestBackend,
  code: string,
  playerToken: string,
): Promise<PlayState> {
  const game = await t.query(api.games.getGameByCodeAndToken, {
    code,
    playerToken,
  });
  if (!game.playState) throw new Error("Expected play state");
  return playStateFromStored(game.playState);
}

async function finishSoloSetup(
  t: TestBackend,
  args: { gameId: Id<"games">; code: string; playerToken: string },
): Promise<PlayState> {
  let state = await soloState(t, args.code, args.playerToken);

  while (state.status === "setup") {
    const actorSlot = state.currentTurnSlot;
    const action = getValidSetupActions(state, actorSlot)[0];
    if (!action) throw new Error(`No setup action for slot ${actorSlot}`);

    await t.mutation(api.games.placeTower, {
      gameId: args.gameId,
      playerToken: args.playerToken,
      actingSlot: actorSlot,
      boardId: action.boardId,
      position: action.position,
      tower: action.tower,
    });

    state = await soloState(t, args.code, args.playerToken);
  }

  return state;
}

describe("solo beta mode", () => {
  it("starts solo from a host-only lobby and creates beta seats", async () => {
    const t = testBackend();
    const created = await t.mutation(api.games.createGame, {
      displayName: "Host",
    });

    await t.mutation(api.games.startSoloGame, {
      gameId: created.gameId,
      playerToken: created.playerToken,
    });

    const game = await t.query(api.games.getGameByCodeAndToken, {
      code: created.code,
      playerToken: created.playerToken,
    });

    expect(game.mode).toBe("solo");
    expect(game.status).toBe("setup");
    expect(game.players).toMatchObject([
      { slot: 0, displayName: "Host", isHost: true },
      { slot: 1, displayName: "Beta White", isHost: false },
      { slot: 2, displayName: "Beta Grey", isHost: false },
    ]);
  });

  it("allows the solo host to place and move for the current slot", async () => {
    const t = testBackend();
    const created = await t.mutation(api.games.createGame, {
      displayName: "Tester",
    });
    await t.mutation(api.games.startSoloGame, {
      gameId: created.gameId,
      playerToken: created.playerToken,
    });

    let state = await soloState(t, created.code, created.playerToken);
    expect(state.currentTurnSlot).toBe(0);

    const firstSetup = getValidSetupActions(state, 0)[0];
    await t.mutation(api.games.placeTower, {
      gameId: created.gameId,
      playerToken: created.playerToken,
      actingSlot: 0,
      boardId: firstSetup.boardId,
      position: firstSetup.position,
      tower: firstSetup.tower,
    });

    state = await soloState(t, created.code, created.playerToken);
    expect(state.currentTurnSlot).toBe(1);

    const secondSetup = getValidSetupActions(state, 1)[0];
    await t.mutation(api.games.placeTower, {
      gameId: created.gameId,
      playerToken: created.playerToken,
      actingSlot: 1,
      boardId: secondSetup.boardId,
      position: secondSetup.position,
      tower: secondSetup.tower,
    });

    state = await finishSoloSetup(t, created);
    expect(state.status).toBe("playing");

    const actorSlot = state.currentTurnSlot;
    const playAction = getValidPlayActions(state, actorSlot)[0];
    expect(playAction).toBeDefined();

    await t.mutation(api.games.moveTower, {
      gameId: created.gameId,
      playerToken: created.playerToken,
      actingSlot: actorSlot,
      boardId: playAction.boardId,
      from: playAction.from,
      to: playAction.to,
    });

    state = await soloState(t, created.code, created.playerToken);
    expect(state.lastMove).toMatchObject({
      kind: "move",
      slot: actorSlot,
    });
  });

  it("rejects non-host and stale tokens for solo seat control", async () => {
    const t = testBackend();
    const created = await t.mutation(api.games.createGame, {
      displayName: "Host",
    });
    await t.mutation(api.games.startSoloGame, {
      gameId: created.gameId,
      playerToken: created.playerToken,
    });

    await t.run(async (ctx) => {
      const betaWhite = await ctx.db
        .query("players")
        .withIndex("by_game_and_slot", (q) =>
          q.eq("gameId", created.gameId).eq("slot", 1),
        )
        .unique();
      if (!betaWhite) throw new Error("Expected Beta White");
      await ctx.db.patch(betaWhite._id, {
        tokenHash: await hashToken("beta-token"),
      });
    });

    const state = await soloState(t, created.code, created.playerToken);
    const action = getValidSetupActions(
      state,
      state.currentTurnSlot as PlayerSlot,
    )[0];

    await expect(
      t.mutation(api.games.placeTower, {
        gameId: created.gameId,
        playerToken: "beta-token",
        actingSlot: state.currentTurnSlot,
        boardId: action.boardId,
        position: action.position,
        tower: action.tower,
      }),
    ).rejects.toThrow("Only the host can control solo beta seats");

    await expect(
      t.mutation(api.games.placeTower, {
        gameId: created.gameId,
        playerToken: "stale-token",
        actingSlot: state.currentTurnSlot,
        boardId: action.boardId,
        position: action.position,
        tower: action.tower,
      }),
    ).rejects.toThrow("Invalid player token");
  });
});

describe("multiplayer start", () => {
  it("still requires three players", async () => {
    const t = testBackend();
    const created = await t.mutation(api.games.createGame, {
      displayName: "Host",
    });

    await expect(
      t.mutation(api.games.startGame, {
        gameId: created.gameId,
        playerToken: created.playerToken,
      }),
    ).rejects.toThrow("Need 3 players to start");
  });
});
