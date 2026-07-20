import type { BoardId } from "./types";

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
  rotationY: number;
  scale: number;
  pieceScale: number;
  focused: boolean;
};

export const BASE_BOARD_LAYOUT: Record<
  BoardId,
  { position: Vector3Tuple; rotationY: number; scale: number }
> = {
  board01: { position: [-2.08, 0, -2], rotationY: -0.28, scale: 0.82 },
  board12: { position: [2.08, 0, -2], rotationY: 0.28, scale: 0.82 },
  board02: { position: [0, 0, 1.55], rotationY: 0, scale: 1 },
};

function add(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function rotateY([x, y, z]: Vector3Tuple, rotationY: number): Vector3Tuple {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  return [x * cos + z * sin, y, -x * sin + z * cos];
}

function scaleXZ([x, y, z]: Vector3Tuple, scale: number): Vector3Tuple {
  return [x * scale, y, z * scale];
}

export function boardLayoutForFocus(
  boardId: BoardId,
  focusedBoardId: BoardId | null,
): BoardRenderLayout {
  const base = BASE_BOARD_LAYOUT[boardId];
  const focused = focusedBoardId === boardId;
  const hasFocus = focusedBoardId !== null;
  const focusScale = focused ? 1.13 : hasFocus ? 0.95 : 1;
  const scale = base.scale * focusScale;

  return {
    position: [
      base.position[0],
      base.position[1] + (focused ? 0.08 : 0),
      base.position[2],
    ],
    rotationY: base.rotationY,
    scale,
    pieceScale: Math.min(1.16, 1 / base.scale),
    focused,
  };
}

function transformPoint(
  point: Vector3Tuple,
  boardId: BoardId,
  focusedBoardId: BoardId | null,
): Vector3Tuple {
  const layout = boardLayoutForFocus(boardId, focusedBoardId);
  return add(
    rotateY(scaleXZ(point, layout.scale), layout.rotationY),
    layout.position,
  );
}

export function battlefieldRimCorners(
  focusedBoardId: BoardId | null = null,
): Vector3Tuple[] {
  const half = BOARD_RIM_SIZE / 2;
  const localCorners: Vector3Tuple[] = [
    [-half, 0.1, -half],
    [half, 0.1, -half],
    [-half, 0.1, half],
    [half, 0.1, half],
  ];

  return BOARD_RENDER_ORDER.flatMap((boardId) =>
    localCorners.map((corner) =>
      transformPoint(corner, boardId, focusedBoardId),
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
): CameraFrame {
  const bounds = boundsFor(battlefieldRimCorners(focusedBoardId));
  const footprintWidth = bounds.maxX - bounds.minX;
  const footprintDepth = bounds.maxZ - bounds.minZ;
  const center: Vector3Tuple = [
    (bounds.minX + bounds.maxX) / 2,
    0.08,
    (bounds.minZ + bounds.maxZ) / 2 + 0.18,
  ];
  const viewWidth = Math.max(
    footprintWidth + 0.36,
    (footprintDepth + 0.72) * aspect * 0.84,
  );

  return {
    kind: "orthographic",
    viewWidth,
    position: [center[0], 4.9, 7.6],
    target: center,
    up: [0, 1, 0],
  };
}
