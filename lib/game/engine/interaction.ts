import type {
  BoardId,
  PlacedTower,
  PlayerSlot,
  Position,
  TowerSpec,
} from "../types";
import type { GameCommand } from ".";

export type TableDragIntent =
  | { kind: "reserve"; tower: TowerSpec; actorSlot: PlayerSlot }
  | {
      kind: "piece";
      boardId: BoardId;
      position: Position;
      piece: PlacedTower;
    };

export type TableDropTarget = {
  boardId: BoardId;
  position: Position;
};

export function commandFromTableDrop(
  drag: TableDragIntent,
  drop: TableDropTarget,
): GameCommand {
  if (drag.kind === "reserve") {
    return {
      kind: "setup.place",
      actorSlot: drag.actorSlot,
      boardId: drop.boardId,
      position: drop.position,
      tower: drag.tower,
    };
  }

  return {
    kind: "play.move",
    actorSlot: drag.piece.ownerSlot,
    boardId: drag.boardId,
    from: drag.position,
    to: drop.position,
  };
}
