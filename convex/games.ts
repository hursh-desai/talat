import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import {
  boardIdValidator,
  gameStatusValidator,
  playStateValidator,
  positionValidator,
  towerSpecValidator,
} from "./validators";
import {
  generateGameCode,
  generatePlayerToken,
  hashToken,
} from "./lib/tokens";
import {
  getGameByCodeOrThrow,
  getPlayerForToken,
  getPlayersForGame,
  assertHost,
} from "./lib/gameHelpers";
import {
  applyPlayMove,
  applySetupMove,
  createPlayStateFromWaiting,
  playStateFromStored,
} from "../lib/game/applyMove";

const playerSummaryValidator = v.object({
  slot: v.number(),
  displayName: v.string(),
  isHost: v.boolean(),
});

const lobbyValidator = v.object({
  _id: v.id("games"),
  code: v.string(),
  status: gameStatusValidator,
  players: v.array(playerSummaryValidator),
  playerCount: v.number(),
});

const createResultValidator = v.object({
  gameId: v.id("games"),
  code: v.string(),
  playerToken: v.string(),
  slot: v.number(),
});

const joinResultValidator = v.object({
  gameId: v.id("games"),
  playerToken: v.string(),
  slot: v.number(),
});

const gameViewValidator = v.object({
  gameId: v.id("games"),
  code: v.string(),
  status: gameStatusValidator,
  players: v.array(playerSummaryValidator),
  viewerSlot: v.union(v.number(), v.null()),
  isHost: v.boolean(),
  playState: v.union(playStateValidator, v.null()),
  winnerSlot: v.union(v.number(), v.null()),
});

async function uniqueCode(ctx: MutationCtx): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateGameCode();
    const existing = await ctx.db
      .query("games")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (!existing) return code;
  }
  throw new Error("Could not generate unique game code");
}

export const createGame = mutation({
  args: {
    displayName: v.string(),
  },
  returns: createResultValidator,
  handler: async (ctx, args) => {
    const name = args.displayName.trim();
    if (!name) throw new Error("Display name is required");

    const now = Date.now();
    const code = await uniqueCode(ctx);
    const playerToken = generatePlayerToken();
    const tokenHash = await hashToken(playerToken);

    const gameId = await ctx.db.insert("games", {
      code,
      status: "waiting",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("players", {
      gameId,
      slot: 0,
      displayName: name,
      tokenHash,
      isHost: true,
      joinedAt: now,
    });

    return { gameId, code, playerToken, slot: 0 };
  },
});

export const joinGame = mutation({
  args: {
    code: v.string(),
    displayName: v.string(),
  },
  returns: joinResultValidator,
  handler: async (ctx, args) => {
    const name = args.displayName.trim();
    if (!name) throw new Error("Display name is required");

    const game = await getGameByCodeOrThrow(ctx, args.code);
    if (game.status !== "waiting") {
      throw new Error("Game already started");
    }

    const players = await getPlayersForGame(ctx, game._id);
    if (players.length >= 3) {
      throw new Error("Game is full");
    }

    const usedSlots = new Set(players.map((p) => p.slot));
    let slot = 0;
    while (usedSlots.has(slot) && slot < 3) slot++;
    if (slot >= 3) throw new Error("Game is full");

    const playerToken = generatePlayerToken();
    const tokenHash = await hashToken(playerToken);
    const now = Date.now();

    await ctx.db.insert("players", {
      gameId: game._id,
      slot,
      displayName: name,
      tokenHash,
      isHost: false,
      joinedAt: now,
    });

    await ctx.db.patch(game._id, { updatedAt: now });

    return { gameId: game._id, playerToken, slot };
  },
});

export const startGame = mutation({
  args: {
    gameId: v.id("games"),
    playerToken: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertHost(ctx, args.gameId, args.playerToken);
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "waiting") throw new Error("Game already started");

    const players = await getPlayersForGame(ctx, args.gameId);
    if (players.length !== 3) {
      throw new Error("Need 3 players to start");
    }

    const playState = createPlayStateFromWaiting();
    const now = Date.now();

    await ctx.db.patch(args.gameId, {
      status: "setup",
      playState,
      updatedAt: now,
    });

    return null;
  },
});

export const placeTower = mutation({
  args: {
    gameId: v.id("games"),
    playerToken: v.string(),
    boardId: boardIdValidator,
    position: positionValidator,
    tower: towerSpecValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const player = await getPlayerForToken(ctx, args.gameId, args.playerToken);
    const game = await ctx.db.get(args.gameId);
    if (!game || !game.playState) throw new Error("Game not in progress");
    if (game.status !== "setup") throw new Error("Not in setup phase");

    const state = playStateFromStored(game.playState);
    const next = applySetupMove(state, player.slot as 0 | 1 | 2, {
      kind: "setup",
      boardId: args.boardId,
      position: args.position,
      tower: args.tower,
    });

    const now = Date.now();
    await ctx.db.patch(args.gameId, {
      playState: next,
      status: next.status === "playing" ? "playing" : "setup",
      updatedAt: now,
    });

    return null;
  },
});

export const moveTower = mutation({
  args: {
    gameId: v.id("games"),
    playerToken: v.string(),
    boardId: boardIdValidator,
    from: positionValidator,
    to: positionValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const player = await getPlayerForToken(ctx, args.gameId, args.playerToken);
    const game = await ctx.db.get(args.gameId);
    if (!game || !game.playState) throw new Error("Game not in progress");
    if (game.status !== "playing") throw new Error("Not in play phase");

    const state = playStateFromStored(game.playState);
    const next = applyPlayMove(state, player.slot as 0 | 1 | 2, {
      kind: "move",
      boardId: args.boardId,
      from: args.from,
      to: args.to,
    });

    const now = Date.now();
    await ctx.db.patch(args.gameId, {
      playState: next,
      status: next.status,
      winnerSlot: next.winnerSlot ?? undefined,
      updatedAt: now,
    });

    return null;
  },
});

export const getGameByCode = query({
  args: { code: v.string() },
  returns: lobbyValidator,
  handler: async (ctx, args) => {
    const game = await getGameByCodeOrThrow(ctx, args.code);
    const players = await getPlayersForGame(ctx, game._id);

    return {
      _id: game._id,
      code: game.code,
      status: game.status,
      players: players
        .sort((a, b) => a.slot - b.slot)
        .map((p) => ({
          slot: p.slot,
          displayName: p.displayName,
          isHost: p.isHost,
        })),
      playerCount: players.length,
    };
  },
});

export const getGame = query({
  args: {
    gameId: v.id("games"),
    playerToken: v.optional(v.string()),
  },
  returns: gameViewValidator,
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");

    const players = await getPlayersForGame(ctx, game._id);
    let viewerSlot: number | null = null;
    let isHost = false;

    if (args.playerToken) {
      try {
        const viewer = await getPlayerForToken(
          ctx,
          args.gameId,
          args.playerToken,
        );
        viewerSlot = viewer.slot;
        isHost = viewer.isHost;
      } catch {
        viewerSlot = null;
      }
    }

    return {
      gameId: game._id,
      code: game.code,
      status: game.status,
      players: players
        .sort((a, b) => a.slot - b.slot)
        .map((p) => ({
          slot: p.slot,
          displayName: p.displayName,
          isHost: p.isHost,
        })),
      viewerSlot,
      isHost,
      playState: game.playState ?? null,
      winnerSlot: game.winnerSlot ?? game.playState?.winnerSlot ?? null,
    };
  },
});

export const getGameByCodeAndToken = query({
  args: {
    code: v.string(),
    playerToken: v.optional(v.string()),
  },
  returns: gameViewValidator,
  handler: async (ctx, args) => {
    const game = await getGameByCodeOrThrow(ctx, args.code);
    const players = await getPlayersForGame(ctx, game._id);
    let viewerSlot: number | null = null;
    let isHost = false;

    if (args.playerToken) {
      try {
        const viewer = await getPlayerForToken(
          ctx,
          game._id,
          args.playerToken,
        );
        viewerSlot = viewer.slot;
        isHost = viewer.isHost;
      } catch {
        viewerSlot = null;
      }
    }

    return {
      gameId: game._id,
      code: game.code,
      status: game.status,
      players: players
        .sort((a, b) => a.slot - b.slot)
        .map((p) => ({
          slot: p.slot,
          displayName: p.displayName,
          isHost: p.isHost,
        })),
      viewerSlot,
      isHost,
      playState: game.playState ?? null,
      winnerSlot: game.winnerSlot ?? game.playState?.winnerSlot ?? null,
    };
  },
});
