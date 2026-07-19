import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  boardIdValidator,
  gameModeValidator,
  gameStatusValidator,
  playerSlotValidator,
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
import { rankLabel } from "../lib/game/scoring";
import type { LastMove, PlayerSlot, TowerSpec } from "../lib/game/types";

const playerSummaryValidator = v.object({
  slot: v.number(),
  displayName: v.string(),
  isHost: v.boolean(),
});

const lobbyValidator = v.object({
  _id: v.id("games"),
  code: v.string(),
  mode: gameModeValidator,
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
  mode: gameModeValidator,
  status: gameStatusValidator,
  players: v.array(playerSummaryValidator),
  viewerSlot: v.union(v.number(), v.null()),
  isHost: v.boolean(),
  playState: v.union(playStateValidator, v.null()),
  winnerSlot: v.union(v.number(), v.null()),
});

const gameEventViewValidator = v.object({
  _id: v.id("gameEvents"),
  _creationTime: v.number(),
  gameId: v.id("games"),
  sequence: v.number(),
  kind: v.union(v.literal("start"), v.literal("setup"), v.literal("move")),
  actorSlot: v.union(v.number(), v.null()),
  description: v.string(),
  playState: playStateValidator,
  createdAt: v.number(),
});

const gameEventsResultValidator = v.array(gameEventViewValidator);

type GameMode = "multiplayer" | "solo";

function gameMode(game: { mode?: GameMode }): GameMode {
  return game.mode ?? "multiplayer";
}

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

async function nextEventSequence(
  ctx: MutationCtx,
  gameId: Id<"games">,
): Promise<number> {
  const latest = await ctx.db
    .query("gameEvents")
    .withIndex("by_game_and_sequence", (q) => q.eq("gameId", gameId))
    .order("desc")
    .take(1);
  return latest[0] ? latest[0].sequence + 1 : 0;
}

async function appendGameEvent(
  ctx: MutationCtx,
  args: {
    gameId: Id<"games">;
    kind: "start" | "setup" | "move";
    actorSlot: number | null;
    description: string;
    playState: NonNullable<Awaited<ReturnType<typeof createPlayStateFromWaiting>>>;
    createdAt: number;
  },
): Promise<void> {
  await ctx.db.insert("gameEvents", {
    ...args,
    sequence: await nextEventSequence(ctx, args.gameId),
  });
}

async function clearGameEvents(
  ctx: MutationCtx,
  gameId: Id<"games">,
): Promise<void> {
  const existing = await ctx.db
    .query("gameEvents")
    .withIndex("by_game_and_sequence", (q) => q.eq("gameId", gameId))
    .take(250);

  for (const event of existing) {
    await ctx.db.delete(event._id);
  }
}

async function insertBetaPlayer(
  ctx: MutationCtx,
  args: {
    gameId: Id<"games">;
    slot: PlayerSlot;
    displayName: string;
    now: number;
  },
): Promise<void> {
  const playerToken = generatePlayerToken();
  const tokenHash = await hashToken(playerToken);

  await ctx.db.insert("players", {
    gameId: args.gameId,
    slot: args.slot,
    displayName: args.displayName,
    tokenHash,
    isHost: false,
    joinedAt: args.now,
  });
}

async function actorSlotForMutation(
  ctx: MutationCtx,
  game: Doc<"games">,
  playerToken: string,
  actingSlot?: PlayerSlot,
): Promise<PlayerSlot> {
  const player = await getPlayerForToken(ctx, game._id, playerToken);
  const requestedSlot = actingSlot ?? (player.slot as PlayerSlot);

  if (gameMode(game) === "solo") {
    if (!player.isHost) {
      throw new Error("Only the host can control solo beta seats");
    }
    return requestedSlot;
  }

  if (actingSlot !== undefined && actingSlot !== player.slot) {
    throw new Error("You cannot act as another player");
  }

  return player.slot as PlayerSlot;
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
      mode: "multiplayer",
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
    await appendGameEvent(ctx, {
      gameId: args.gameId,
      kind: "start",
      actorSlot: null,
      description: "Game started",
      playState,
      createdAt: now,
    });

    return null;
  },
});

export const startSoloGame = mutation({
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
    if (players.length !== 1 || !players[0].isHost) {
      throw new Error("Solo beta starts from a host-only lobby");
    }

    const now = Date.now();
    await insertBetaPlayer(ctx, {
      gameId: args.gameId,
      slot: 1,
      displayName: "Beta White",
      now,
    });
    await insertBetaPlayer(ctx, {
      gameId: args.gameId,
      slot: 2,
      displayName: "Beta Grey",
      now,
    });

    const playState = createPlayStateFromWaiting();

    await ctx.db.patch(args.gameId, {
      mode: "solo",
      status: "setup",
      playState,
      updatedAt: now,
    });
    await appendGameEvent(ctx, {
      gameId: args.gameId,
      kind: "start",
      actorSlot: null,
      description: "Solo beta game started",
      playState,
      createdAt: now,
    });

    return null;
  },
});

export const rematchGame = mutation({
  args: {
    gameId: v.id("games"),
    playerToken: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertHost(ctx, args.gameId, args.playerToken);
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "finished") {
      throw new Error("Rematch is available after the game ends");
    }

    const players = await getPlayersForGame(ctx, args.gameId);
    if (players.length !== 3) {
      throw new Error("Need 3 players for a rematch");
    }

    const playState = createPlayStateFromWaiting();
    const now = Date.now();
    await clearGameEvents(ctx, args.gameId);
    await ctx.db.patch(args.gameId, {
      status: "setup",
      playState,
      winnerSlot: undefined,
      updatedAt: now,
    });
    await appendGameEvent(ctx, {
      gameId: args.gameId,
      kind: "start",
      actorSlot: null,
      description: "Rematch started",
      playState,
      createdAt: now,
    });

    return null;
  },
});

export const placeTower = mutation({
  args: {
    gameId: v.id("games"),
    playerToken: v.string(),
    actingSlot: v.optional(playerSlotValidator),
    boardId: boardIdValidator,
    position: positionValidator,
    tower: towerSpecValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game || !game.playState) throw new Error("Game not in progress");
    if (game.status !== "setup") throw new Error("Not in setup phase");

    const actorSlot = await actorSlotForMutation(
      ctx,
      game,
      args.playerToken,
      args.actingSlot,
    );
    const state = playStateFromStored(game.playState);
    const next = applySetupMove(state, actorSlot, {
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
    await appendGameEvent(ctx, {
      gameId: args.gameId,
      kind: "setup",
      actorSlot,
      description: describeLastMove(next.lastMove),
      playState: next,
      createdAt: now,
    });

    return null;
  },
});

export const moveTower = mutation({
  args: {
    gameId: v.id("games"),
    playerToken: v.string(),
    actingSlot: v.optional(playerSlotValidator),
    boardId: boardIdValidator,
    from: positionValidator,
    to: positionValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game || !game.playState) throw new Error("Game not in progress");
    if (game.status !== "playing") throw new Error("Not in play phase");

    const actorSlot = await actorSlotForMutation(
      ctx,
      game,
      args.playerToken,
      args.actingSlot,
    );
    const state = playStateFromStored(game.playState);
    const next = applyPlayMove(state, actorSlot, {
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
    await appendGameEvent(ctx, {
      gameId: args.gameId,
      kind: "move",
      actorSlot,
      description: describeLastMove(next.lastMove),
      playState: next,
      createdAt: now,
    });

    return null;
  },
});

export const getGameEvents = query({
  args: {
    gameId: v.id("games"),
    playerToken: v.string(),
  },
  returns: gameEventsResultValidator,
  handler: async (ctx, args) => {
    await getPlayerForToken(ctx, args.gameId, args.playerToken);
    return await ctx.db
      .query("gameEvents")
      .withIndex("by_game_and_sequence", (q) => q.eq("gameId", args.gameId))
      .take(250);
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
      mode: gameMode(game),
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
      mode: gameMode(game),
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
      mode: gameMode(game),
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
