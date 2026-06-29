export type Height = 1 | 2 | 3;
export type Sides = 3 | 4 | 6;
export type BoardId = "board01" | "board02" | "board12";
export type PlayerSlot = 0 | 1 | 2;
export type GamePhase = "setup" | "play";
export type GameStatus = "waiting" | "setup" | "playing" | "finished";

export const BOARD_IDS: BoardId[] = ["board01", "board02", "board12"];
export const BOARD_SIZE = 5;

export type TowerSpec = {
  height: Height;
  sides: Sides;
};

export type PlacedTower = TowerSpec & {
  ownerSlot: PlayerSlot;
};

export type Cell = PlacedTower | null;
export type Board = Cell[][];
export type Boards = Record<BoardId, Board>;

export type Position = {
  row: number;
  col: number;
};

export type MoveAction = {
  kind: "move";
  boardId: BoardId;
  from: Position;
  to: Position;
};

export type SetupAction = {
  kind: "setup";
  boardId: BoardId;
  position: Position;
  tower: TowerSpec;
};

export type GameBoardState = {
  boards: Boards;
  reserves: TowerSpec[][];
};

export type LastMove =
  | {
      kind: "setup";
      boardId: BoardId;
      position: Position;
      tower: TowerSpec;
      slot: PlayerSlot;
    }
  | {
      kind: "move";
      boardId: BoardId;
      from: Position;
      to: Position;
      slot: PlayerSlot;
      captured: PlacedTower | null;
    };

export const PLAYER_COLORS = ["Black", "White", "Grey"] as const;

export const ALL_TOWER_SPECS: TowerSpec[] = (
  [1, 2, 3] as Height[]
).flatMap((height) =>
  ([3, 4, 6] as Sides[]).map((sides) => ({ height, sides })),
);

export function towerKey(tower: TowerSpec): string {
  return `${tower.height}-${tower.sides}`;
}

export function towerRank(tower: TowerSpec): number {
  return tower.height * 10 + tower.sides;
}

export function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => null),
  );
}

export function createInitialBoardState(): GameBoardState {
  return {
    boards: {
      board01: createEmptyBoard(),
      board02: createEmptyBoard(),
      board12: createEmptyBoard(),
    },
    reserves: [
      [...ALL_TOWER_SPECS],
      [...ALL_TOWER_SPECS],
      [...ALL_TOWER_SPECS],
    ],
  };
}

export function boardsForSlot(slot: PlayerSlot): BoardId[] {
  switch (slot) {
    case 0:
      return ["board01", "board02"];
    case 1:
      return ["board01", "board12"];
    case 2:
      return ["board02", "board12"];
  }
}

export function opponentsOnBoard(
  boardId: BoardId,
  slot: PlayerSlot,
): PlayerSlot {
  switch (boardId) {
    case "board01":
      return slot === 0 ? 1 : 0;
    case "board02":
      return slot === 0 ? 2 : 0;
    case "board12":
      return slot === 1 ? 2 : 1;
  }
}

export function playersOnBoard(boardId: BoardId): [PlayerSlot, PlayerSlot] {
  switch (boardId) {
    case "board01":
      return [0, 1];
    case "board02":
      return [0, 2];
    case "board12":
      return [1, 2];
  }
}
