import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { verifyPlayerToken } from "./tokens";

export async function getGameByCodeOrThrow(
  ctx: QueryCtx | MutationCtx,
  code: string,
): Promise<Doc<"games">> {
  const normalized = code.toUpperCase();
  const game = await ctx.db
    .query("games")
    .withIndex("by_code", (q) => q.eq("code", normalized))
    .unique();

  if (!game) {
    throw new Error("Game not found");
  }

  return game;
}

export async function getPlayersForGame(
  ctx: QueryCtx | MutationCtx,
  gameId: Id<"games">,
): Promise<Doc<"players">[]> {
  return await ctx.db
    .query("players")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .collect();
}

export async function getPlayerForToken(
  ctx: QueryCtx | MutationCtx,
  gameId: Id<"games">,
  playerToken: string,
): Promise<Doc<"players">> {
  const players = await getPlayersForGame(ctx, gameId);
  for (const player of players) {
    if (await verifyPlayerToken(playerToken, player.tokenHash)) {
      return player;
    }
  }
  throw new Error("Invalid player token");
}

export async function assertHost(
  ctx: MutationCtx,
  gameId: Id<"games">,
  playerToken: string,
): Promise<Doc<"players">> {
  const player = await getPlayerForToken(ctx, gameId, playerToken);
  if (!player.isHost) {
    throw new Error("Only the host can perform this action");
  }
  return player;
}
