import { v } from "convex/values";

export const heightValidator = v.union(v.literal(1), v.literal(2), v.literal(3));
export const sidesValidator = v.union(v.literal(3), v.literal(4), v.literal(6));
export const boardIdValidator = v.union(
  v.literal("board01"),
  v.literal("board02"),
  v.literal("board12"),
);

export const towerSpecValidator = v.object({
  height: heightValidator,
  sides: sidesValidator,
});

export const placedTowerValidator = v.object({
  height: heightValidator,
  sides: sidesValidator,
  ownerSlot: v.number(),
});

export const cellValidator = v.union(placedTowerValidator, v.null());

export const boardValidator = v.array(v.array(cellValidator));

export const positionValidator = v.object({
  row: v.number(),
  col: v.number(),
});

export const boardsValidator = v.object({
  board01: boardValidator,
  board02: boardValidator,
  board12: boardValidator,
});

export const gameBoardStateValidator = v.object({
  boards: boardsValidator,
  reserves: v.array(v.array(towerSpecValidator)),
});

export const lastMoveValidator = v.union(
  v.object({
    kind: v.literal("setup"),
    boardId: boardIdValidator,
    position: positionValidator,
    tower: towerSpecValidator,
    slot: v.number(),
  }),
  v.object({
    kind: v.literal("move"),
    boardId: boardIdValidator,
    from: positionValidator,
    to: positionValidator,
    slot: v.number(),
    captured: v.union(placedTowerValidator, v.null()),
  }),
);

export const playStateValidator = v.object({
  boardState: gameBoardStateValidator,
  phase: v.union(v.literal("setup"), v.literal("play")),
  currentTurnSlot: v.number(),
  setupTurnIndex: v.number(),
  frozenBoards: v.array(v.boolean()),
  scores: v.array(v.number()),
  capturedBySlot: v.array(v.array(placedTowerValidator)),
  highestCaptureRankBySlot: v.array(v.number()),
  lastMove: v.union(lastMoveValidator, v.null()),
  winnerSlot: v.union(v.number(), v.null()),
  status: v.union(
    v.literal("setup"),
    v.literal("playing"),
    v.literal("finished"),
  ),
});

export const gameStatusValidator = v.union(
  v.literal("waiting"),
  v.literal("setup"),
  v.literal("playing"),
  v.literal("finished"),
);

export const gameModeValidator = v.union(
  v.literal("multiplayer"),
  v.literal("solo"),
);

export const playerSlotValidator = v.union(
  v.literal(0),
  v.literal(1),
  v.literal(2),
);
