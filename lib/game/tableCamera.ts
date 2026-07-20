import { startingRow } from "./geometry";
import { playersOnBoard } from "./types";
import type { BoardId, PlayerSlot } from "./types";

export type Vector3Tuple = [number, number, number];

export const BOARD_RENDER_ORDER: BoardId[] = ["board01", "board12", "board02"];
export const BOARD_INDEX: Record<BoardId, number> = {
  board01: 0,
  board02: 1,
  board12: 2,
};

export const CELL_WORLD_SIZE = 0.64;
export const BOARD_WORLD_SIZE = CELL_WORLD_SIZE * 5;
export const BOARD_RIM_SIZE = BOARD_WORLD_SIZE + 0.42;

export type BoardRenderLayout = {
  position: Vector3Tuple;
  rotationX: number;
  rotationY: number;
  scale: number;
  pieceScale: number;
  labelPositionZ: number;
  labelRotationZ: number;
  flippedToViewer: boolean;
  focused: boolean;
};

type BoardStation = "left" | "right" | "front";

export const BASE_BOARD_LAYOUT: Record<
  BoardId,
  { position: Vector3Tuple; rotationX: number; rotationY: number; scale: number }
> = {
  board01: {
    position: [-1.86, 0.22, -1.78],
    rotationX: 0.12,
    rotationY: 0.42,
    scale: 0.7,
  },
  board12: {
    position: [1.28, 0.24, -3.18],
    rotationX: 0.14,
    rotationY: -0.32,
    scale: 0.52,
  },
  board02: {
    position: [0.02, 0, 1.08],
    rotationX: 0,
    rotationY: -0.02,
    scale: 1.02,
  },
};

const STATION_LAYOUT: Record<
  BoardStation,
  { position: Vector3Tuple; rotationX: number; rotationY: number; scale: number }
> = {
  left: BASE_BOARD_LAYOUT.board01,
  right: BASE_BOARD_LAYOUT.board12,
  front: BASE_BOARD_LAYOUT.board02,
};

function clockwiseNext(slot: PlayerSlot): PlayerSlot {
  return ((slot + 1) % 3) as PlayerSlot;
}

function clockwisePrevious(slot: PlayerSlot): PlayerSlot {
  return ((slot + 2) % 3) as PlayerSlot;
}

function boardForSlots(a: PlayerSlot, b: PlayerSlot): BoardId {
  if ((a === 0 && b === 1) || (a === 1 && b === 0)) return "board01";
  if ((a === 0 && b === 2) || (a === 2 && b === 0)) return "board02";
  return "board12";
}

function boardsForPerspective(
  perspectiveSlot: PlayerSlot,
): Record<BoardStation, BoardId> {
  const next = clockwiseNext(perspectiveSlot);
  const previous = clockwisePrevious(perspectiveSlot);

  return {
    front: boardForSlots(perspectiveSlot, previous),
    left: boardForSlots(perspectiveSlot, next),
    right: boardForSlots(next, previous),
  };
}

function stationForBoard(
  boardId: BoardId,
  perspectiveSlot: PlayerSlot,
): BoardStation {
  const stations = boardsForPerspective(perspectiveSlot);
  if (stations.front === boardId) return "front";
  if (stations.left === boardId) return "left";
  return "right";
}

function facingSlotForBoard(
  boardId: BoardId,
  perspectiveSlot: PlayerSlot,
): PlayerSlot {
  const boardPlayers = playersOnBoard(boardId);
  if (boardPlayers.includes(perspectiveSlot)) return perspectiveSlot;
  return clockwiseNext(perspectiveSlot);
}

export function boardRenderOrderForPerspective(
  perspectiveSlot: PlayerSlot = 0,
): BoardId[] {
  const stations = boardsForPerspective(perspectiveSlot);
  return [stations.left, stations.right, stations.front];
}

function add(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function rotateY([x, y, z]: Vector3Tuple, rotationY: number): Vector3Tuple {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  return [x * cos + z * sin, y, -x * sin + z * cos];
}

function rotateX([x, y, z]: Vector3Tuple, rotationX: number): Vector3Tuple {
  const cos = Math.cos(rotationX);
  const sin = Math.sin(rotationX);
  return [x, y * cos - z * sin, y * sin + z * cos];
}

function scaleXZ([x, y, z]: Vector3Tuple, scale: number): Vector3Tuple {
  return [x * scale, y, z * scale];
}

export function boardLayoutForFocus(
  boardId: BoardId,
  focusedBoardId: BoardId | null,
  perspectiveSlot: PlayerSlot = 0,
): BoardRenderLayout {
  const station = stationForBoard(boardId, perspectiveSlot);
  const base = STATION_LAYOUT[station];
  const focused = focusedBoardId === boardId;
  const hasFocus = focusedBoardId !== null;
  const focusScale = focused ? 1.13 : hasFocus ? 0.95 : 1;
  const scale = base.scale * focusScale;
  const facingSlot = facingSlotForBoard(boardId, perspectiveSlot);
  const flippedToViewer = startingRow(boardId, facingSlot) === 0;
  const rowTurn = flippedToViewer ? Math.PI : 0;

  return {
    position: [
      base.position[0],
      base.position[1] + (focused ? 0.08 : 0),
      base.position[2],
    ],
    rotationX: base.rotationX,
    rotationY: base.rotationY + rowTurn,
    scale,
    pieceScale: Math.min(1.16, 1 / base.scale),
    labelPositionZ: flippedToViewer
      ? BOARD_RIM_SIZE / 2 + 0.18
      : -BOARD_RIM_SIZE / 2 - 0.18,
    labelRotationZ: flippedToViewer ? Math.PI : 0,
    flippedToViewer,
    focused,
  };
}

function transformPoint(
  point: Vector3Tuple,
  boardId: BoardId,
  focusedBoardId: BoardId | null,
  perspectiveSlot: PlayerSlot,
): Vector3Tuple {
  const layout = boardLayoutForFocus(boardId, focusedBoardId, perspectiveSlot);
  return add(
    rotateY(
      rotateX(scaleXZ(point, layout.scale), layout.rotationX),
      layout.rotationY,
    ),
    layout.position,
  );
}

export function battlefieldRimCorners(
  focusedBoardId: BoardId | null = null,
  perspectiveSlot: PlayerSlot = 0,
): Vector3Tuple[] {
  const half = BOARD_RIM_SIZE / 2;
  const localCorners: Vector3Tuple[] = [
    [-half, 0.1, -half],
    [half, 0.1, -half],
    [-half, 0.1, half],
    [half, 0.1, half],
  ];

  return boardRenderOrderForPerspective(perspectiveSlot).flatMap((boardId) =>
    localCorners.map((corner) =>
      transformPoint(corner, boardId, focusedBoardId, perspectiveSlot),
    ),
  );
}

function boundsFor(points: Vector3Tuple[]) {
  return points.reduce(
    (bounds, [x, , z]) => ({
      minX: Math.min(bounds.minX, x),
      maxX: Math.max(bounds.maxX, x),
      minZ: Math.min(bounds.minZ, z),
      maxZ: Math.max(bounds.maxZ, z),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY,
    },
  );
}

export const BATTLEFIELD_BOUNDS = boundsFor(battlefieldRimCorners());
export const BATTLEFIELD_FOOTPRINT = {
  width: BATTLEFIELD_BOUNDS.maxX - BATTLEFIELD_BOUNDS.minX,
  depth: BATTLEFIELD_BOUNDS.maxZ - BATTLEFIELD_BOUNDS.minZ,
};
export const BATTLEFIELD_CENTER: Vector3Tuple = [
  (BATTLEFIELD_BOUNDS.minX + BATTLEFIELD_BOUNDS.maxX) / 2,
  0.08,
  (BATTLEFIELD_BOUNDS.minZ + BATTLEFIELD_BOUNDS.maxZ) / 2,
];

export type CameraFrame = {
  kind: "orthographic";
  viewWidth: number;
  position: Vector3Tuple;
  target: Vector3Tuple;
  up: Vector3Tuple;
};

export function resolveWarTableFrame(
  aspect: number,
  focusedBoardId: BoardId | null = null,
  perspectiveSlot: PlayerSlot = 0,
): CameraFrame {
  const bounds = boundsFor(
    battlefieldRimCorners(focusedBoardId, perspectiveSlot),
  );
  const footprintWidth = bounds.maxX - bounds.minX;
  const footprintDepth = bounds.maxZ - bounds.minZ;
  const center: Vector3Tuple = [
    (bounds.minX + bounds.maxX) / 2,
    0.08,
    (bounds.minZ + bounds.maxZ) / 2 + 0.18,
  ];
  const viewWidth = Math.max(
    footprintWidth + 0.72,
    (footprintDepth + 1.08) * aspect * 0.88,
  );

  return {
    kind: "orthographic",
    viewWidth,
    position: [center[0], 5.05, 7.85],
    target: [center[0], center[1], center[2] - 0.1],
    up: [0, 1, 0],
  };
}
