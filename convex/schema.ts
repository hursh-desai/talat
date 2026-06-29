import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { gameStatusValidator, playStateValidator } from "./validators";

export default defineSchema({
  games: defineTable({
    code: v.string(),
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
});
