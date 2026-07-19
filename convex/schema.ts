import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  gameModeValidator,
  gameStatusValidator,
  playStateValidator,
} from "./validators";

export default defineSchema({
  games: defineTable({
    code: v.string(),
    mode: v.optional(gameModeValidator),
    status: gameStatusValidator,
    playState: v.optional(playStateValidator),
    winnerSlot: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_code", ["code"]),

  players: defineTable({
    gameId: v.id("games"),
    slot: v.number(),
    displayName: v.string(),
    tokenHash: v.string(),
    isHost: v.boolean(),
    joinedAt: v.number(),
  })
    .index("by_game", ["gameId"])
    .index("by_game_and_slot", ["gameId", "slot"]),

  gameEvents: defineTable({
    gameId: v.id("games"),
    sequence: v.number(),
    kind: v.union(v.literal("start"), v.literal("setup"), v.literal("move")),
    actorSlot: v.union(v.number(), v.null()),
    description: v.string(),
    playState: playStateValidator,
    createdAt: v.number(),
  }).index("by_game_and_sequence", ["gameId", "sequence"]),
});
