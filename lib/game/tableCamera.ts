import type { BoardId, PlayerSlot } from "./types";

export type CameraAngle = "black" | "white" | "grey" | "map";
export type Vector3Tuple = [number, number, number];

export const BOARD_RENDER_ORDER: BoardId[] = ["board01", "board02", "board12"];
export const BOARD_INDEX: Record<BoardId, number> = {
  board01: 0,
  board02: 1,
  board12: 2,
};

export const CELL_WORLD_SIZE = 0.64;
export const BOARD_WORLD_SIZE = CELL_WORLD_SIZE * 5;
export const BOARD_RIM_SIZE = BOARD_WORLD_SIZE + 0.42;

export const BOARD_LAYOUT: Record<
  BoardId,
  { position: Vector3Tuple; rotationY: number }
> = {
  board01: { position: [-2.28, 0, -1.5], rotationY: -0.3 },
  board02: { position: [0, 0, 2.18], rotationY: 0 },
  board12: { position: [2.28, 0, -1.5], rotationY: 0.3 },
};

function add(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function rotateY([x, y, z]: Vector3Tuple, rotationY: number): Vector3Tuple {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  return [x * cos + z * sin, y, -x * sin + z * cos];
}

function transformPoint(point: Vector3Tuple, boardId: BoardId): Vector3Tuple {
  const layout = BOARD_LAYOUT[boardId];
  return add(rotateY(point, layout.rotationY), layout.position);
}

export function battlefieldRimCorners(): Vector3Tuple[] {
  const half = BOARD_RIM_SIZE / 2;
  const localCorners: Vector3Tuple[] = [
    [-half, 0.1, -half],
    [half, 0.1, -half],
    [-half, 0.1, half],
    [half, 0.1, half],
  ];

  return BOARD_RENDER_ORDER.flatMap((boardId) =>
    localCorners.map((corner) => transformPoint(corner, boardId)),
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
const CAMERA_PADDING = 0.9;
const WIDE_CAMERA_ASPECT = 1.12;
export const BATTLEFIELD_FOOTPRINT = {
  width: BATTLEFIELD_BOUNDS.maxX - BATTLEFIELD_BOUNDS.minX + CAMERA_PADDING,
  depth: BATTLEFIELD_BOUNDS.maxZ - BATTLEFIELD_BOUNDS.minZ + CAMERA_PADDING,
};
export const BATTLEFIELD_CENTER: Vector3Tuple = [
  (BATTLEFIELD_BOUNDS.minX + BATTLEFIELD_BOUNDS.maxX) / 2,
  0.06,
  (BATTLEFIELD_BOUNDS.minZ + BATTLEFIELD_BOUNDS.maxZ) / 2,
];

const boardCenter = (boardId: BoardId) => BOARD_LAYOUT[boardId].position;

// Board centers are the edge midpoints of the player triangle.
export const PLAYER_TABLE_POSITIONS: Record<PlayerSlot, Vector3Tuple> = {
  0: subtract(
    add(boardCenter("board01"), boardCenter("board02")),
    boardCenter("board12"),
  ),
  1: subtract(
    add(boardCenter("board01"), boardCenter("board12")),
    boardCenter("board02"),
  ),
  2: subtract(
    add(boardCenter("board02"), boardCenter("board12")),
    boardCenter("board01"),
  ),
};

export const PLAYER_CAMERA_ANGLES: Record<PlayerSlot, CameraAngle> = {
  0: "black",
  1: "white",
  2: "grey",
};

export function cameraAngleForSlot(slot: PlayerSlot | null): CameraAngle {
  return slot === null ? "black" : PLAYER_CAMERA_ANGLES[slot];
}

function playerCameraPosition(
  slot: PlayerSlot,
  distance: number,
  height: number,
): Vector3Tuple {
  const [x, , z] = PLAYER_TABLE_POSITIONS[slot];
  const length = Math.hypot(x, z);
  return [(x / length) * distance, height, (z / length) * distance];
}

type PerspectiveCameraPreset = {
  kind: "perspective";
  desktop: { fov: number; position: Vector3Tuple };
  narrow: { fov: number; position: Vector3Tuple };
  target: Vector3Tuple;
};

type OrthographicCameraPreset = {
  kind: "orthographic";
  desktop: { viewWidth: number; position: Vector3Tuple };
  narrow: { viewWidth: number; position: Vector3Tuple };
  target: Vector3Tuple;
  up: Vector3Tuple;
};

export type CameraPreset = PerspectiveCameraPreset | OrthographicCameraPreset;

export const CAMERA_PRESETS: Record<CameraAngle, CameraPreset> = {
  black: {
    kind: "perspective",
    desktop: { fov: 46, position: playerCameraPosition(0, 7.5, 7.8) },
    narrow: { fov: 78, position: playerCameraPosition(0, 14.5, 8.6) },
    target: BATTLEFIELD_CENTER,
  },
  white: {
    kind: "perspective",
    desktop: { fov: 46, position: playerCameraPosition(1, 7.5, 7.8) },
    narrow: { fov: 78, position: playerCameraPosition(1, 14.5, 8.6) },
    target: BATTLEFIELD_CENTER,
  },
  grey: {
    kind: "perspective",
    desktop: { fov: 46, position: playerCameraPosition(2, 7.5, 7.8) },
    narrow: { fov: 78, position: playerCameraPosition(2, 14.5, 8.6) },
    target: BATTLEFIELD_CENTER,
  },
  map: {
    kind: "orthographic",
    desktop: {
      viewWidth: BATTLEFIELD_FOOTPRINT.width,
      position: [BATTLEFIELD_CENTER[0], 9.8, BATTLEFIELD_CENTER[2] + 0.01],
    },
    narrow: {
      viewWidth: BATTLEFIELD_FOOTPRINT.width,
      position: [BATTLEFIELD_CENTER[0], 9.8, BATTLEFIELD_CENTER[2] + 0.01],
    },
    target: [BATTLEFIELD_CENTER[0], 0, BATTLEFIELD_CENTER[2]],
    up: [0, 0, -1],
  },
};

export type CameraFrame =
  | {
      kind: "perspective";
      fov: number;
      position: Vector3Tuple;
      target: Vector3Tuple;
    }
  | {
      kind: "orthographic";
      viewWidth: number;
      position: Vector3Tuple;
      target: Vector3Tuple;
      up: Vector3Tuple;
    };

export function resolveCameraFrame(
  cameraAngle: CameraAngle,
  aspect: number,
): CameraFrame {
  const preset = CAMERA_PRESETS[cameraAngle];
  const isNarrow = aspect < WIDE_CAMERA_ASPECT;

  if (preset.kind === "perspective") {
    const size = isNarrow ? preset.narrow : preset.desktop;
    return {
      kind: "perspective",
      fov: size.fov,
      position: size.position,
      target: preset.target,
    };
  }

  const size = isNarrow ? preset.narrow : preset.desktop;

  return {
    kind: "orthographic",
    viewWidth: Math.max(
      size.viewWidth,
      BATTLEFIELD_FOOTPRINT.depth * aspect,
    ),
    position: size.position,
    target: preset.target,
    up: preset.up,
  };
}
