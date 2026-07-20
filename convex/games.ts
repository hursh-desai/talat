import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  boardIdValidator,
  gameCommandValidator,
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
import { playStateFromStored } from "../lib/game/applyMove";
import {
  applyCommand,
  type EngineEvent,
  type GameCommand,
  type GameState,
} from "../lib/game/engine";
import type { PlayerSlot } from "../lib/game/types";

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

const joinResultValidator = v.union(
  v.object({
    status: v.literal("joined"),
    gameId: v.id("games"),
    playerToken: v.string(),
    slot: v.number(),
  }),
  v.object({
    status: v.literal("already_started"),
  }),
);

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
  kind: v.union(
    v.literal("start"),
    v.literal("setup"),
    v.literal("move"),
    v.literal("rematch"),
  ),
  commandKind: v.optional(
    v.union(
      v.literal("start"),
      v.literal("rematch"),
      v.literal("setup.place"),
      v.literal("play.move"),
    ),
  ),
  command: v.optional(gameCommandValidator),
  actorSlot: v.union(v.number(), v.null()),
  description: v.string(),
  schemaVersion: v.optional(v.number()),
  stateVersion: v.optional(v.number()),
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
    event: EngineEvent;
    command: GameCommand;
    playState: GameState;
    createdAt: number;
  },
): Promise<void> {
  await ctx.db.insert("gameEvents", {
    gameId: args.gameId,
    sequence: await nextEventSequence(ctx, args.gameId),
    kind: args.event.kind,
    commandKind: args.event.commandKind,
    command: args.command,
    actorSlot: args.event.actorSlot,
    description: args.event.description,
    schemaVersion: args.event.schemaVersion,
    stateVersion: args.event.stateVersion,
    playState: args.playState,
    createdAt: args.createdAt,
  });
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
      return { status: "already_started" as const };
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

    return { status: "joined" as const, gameId: game._id, playerToken, slot };
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

    const command: GameCommand = { kind: "start", mode: "multiplayer" };
    const result = applyCommand(null, command);
    const now = Date.now();

    await ctx.db.patch(args.gameId, {
      status: "setup",
      playState: result.state,
      updatedAt: now,
    });
    await appendGameEvent(ctx, {
      gameId: args.gameId,
      event: result.event,
      command,
      playState: result.state,
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

    const command: GameCommand = { kind: "start", mode: "solo" };
    const result = applyCommand(null, command);

    await ctx.db.patch(args.gameId, {
      mode: "solo",
      status: "setup",
      playState: result.state,
      updatedAt: now,
    });
    await appendGameEvent(ctx, {
      gameId: args.gameId,
      event: result.event,
      command,
      playState: result.state,
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
    if (!game.playState) throw new Error("Game not in progress");
    if (game.status !== "finished") {
      throw new Error("Rematch is available after the game ends");
    }

    const players = await getPlayersForGame(ctx, args.gameId);
    if (players.length !== 3) {
      throw new Error("Need 3 players for a rematch");
    }

    const command: GameCommand = { kind: "rematch" };
    const result = applyCommand(playStateFromStored(game.playState), command);
    const now = Date.now();
    await ctx.db.patch(args.gameId, {
      status: "setup",
      playState: result.state,
      winnerSlot: undefined,
      updatedAt: now,
    });
    await appendGameEvent(ctx, {
      gameId: args.gameId,
      event: result.event,
      command,
      playState: result.state,
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
    const command: GameCommand = {
      kind: "setup.place",
      actorSlot,
      boardId: args.boardId,
      position: args.position,
      tower: args.tower,
    };
    const result = applyCommand(playStateFromStored(game.playState), command);

    const now = Date.now();
    await ctx.db.patch(args.gameId, {
      playState: result.state,
      status: result.state.status === "playing" ? "playing" : "setup",
      updatedAt: now,
    });
    await appendGameEvent(ctx, {
      gameId: args.gameId,
      event: result.event,
      command,
      playState: result.state,
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
    const command: GameCommand = {
      kind: "play.move",
      actorSlot,
      boardId: args.boardId,
      from: args.from,
      to: args.to,
    };
    const result = applyCommand(playStateFromStored(game.playState), command);

    const now = Date.now();
    await ctx.db.patch(args.gameId, {
      playState: result.state,
      status: result.state.status,
      winnerSlot: result.state.winnerSlot ?? undefined,
      updatedAt: now,
    });
    await appendGameEvent(ctx, {
      gameId: args.gameId,
      event: result.event,
      command,
      playState: result.state,
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
