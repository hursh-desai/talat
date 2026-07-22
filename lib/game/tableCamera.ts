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
type PlayerTableStation = "near" | "left" | "far";
type BoardLayoutBase = {
  position: Vector3Tuple;
  rotationX: number;
  rotationY: number;
  scale: number;
};
type BoardStationSpec = Omit<BoardLayoutBase, "position"> & { y: number };

export const TABLE_LAYOUT_RULES = {
  frontCenter: [0.02, 1.24],
  sideToFrontGutter: 0.96,
  sideInnerGutter: 0.86,
  reserveHandGutter: 0.62,
  captureRackGutter: 0.26,
  cameraPaddingX: 0.58,
  cameraPaddingZ: 0.86,
  cameraDepthScale: 0.84,
  cameraZoomScale: 0.78,
} as const;

export const TABLE_ACCESSORY_SIZES = {
  reserveHand: { width: 3.48, trayDepth: 1.08, footprintDepth: 1.34 },
  captureRack: { width: 1.18, depth: 0.42 },
} as const;

const BOARD_STATION_SPECS: Record<BoardStation, BoardStationSpec> = {
  left: {
    y: 0.22,
    rotationX: 0.12,
    rotationY: 0.42,
    scale: 0.7,
  },
  right: {
    y: 0.24,
    rotationX: 0.14,
    rotationY: -0.32,
    scale: 0.52,
  },
  front: {
    y: 0,
    rotationX: 0,
    rotationY: -0.02,
    scale: 1.02,
  },
};

function rimBoundsForStation(spec: BoardStationSpec) {
  const half = BOARD_RIM_SIZE / 2;
  const localCorners: Vector3Tuple[] = [
    [-half, 0.1, -half],
    [half, 0.1, -half],
    [-half, 0.1, half],
    [half, 0.1, half],
  ];

  return boundsFor(
    localCorners.map((corner) =>
      rotateY(
        rotateX(scaleXZ(corner, spec.scale), spec.rotationX),
        spec.rotationY,
      ),
    ),
  );
}

function computeStationLayout(): Record<BoardStation, BoardLayoutBase> {
  const front = BOARD_STATION_SPECS.front;
  const left = BOARD_STATION_SPECS.left;
  const right = BOARD_STATION_SPECS.right;
  const frontBounds = rimBoundsForStation(front);
  const leftBounds = rimBoundsForStation(left);
  const rightBounds = rimBoundsForStation(right);
  const [frontX, frontZ] = TABLE_LAYOUT_RULES.frontCenter;
  const sideNearEdge =
    frontZ + frontBounds.minZ - TABLE_LAYOUT_RULES.sideToFrontGutter;

  return {
    front: {
      ...front,
      position: [frontX, front.y, frontZ],
    },
    left: {
      ...left,
      position: [
        frontX - TABLE_LAYOUT_RULES.sideInnerGutter / 2 - leftBounds.maxX,
        left.y,
        sideNearEdge - leftBounds.maxZ,
      ],
    },
    right: {
      ...right,
      position: [
        frontX + TABLE_LAYOUT_RULES.sideInnerGutter / 2 - rightBounds.minX,
        right.y,
        sideNearEdge - rightBounds.maxZ,
      ],
    },
  };
}

const STATION_LAYOUT = computeStationLayout();

export const BASE_BOARD_LAYOUT: Record<BoardId, BoardLayoutBase> = {
  board01: STATION_LAYOUT.left,
  board02: STATION_LAYOUT.front,
  board12: STATION_LAYOUT.right,
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

function playerTableStationForSlot(
  slot: PlayerSlot,
  perspectiveSlot: PlayerSlot,
): PlayerTableStation {
  if (slot === perspectiveSlot) return "near";
  if (slot === clockwiseNext(perspectiveSlot)) return "left";
  return "far";
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

function accessoryCorners(
  center: Vector3Tuple,
  width: number,
  depth: number,
): Vector3Tuple[] {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;

  return [
    [center[0] - halfWidth, center[1], center[2] - halfDepth],
    [center[0] + halfWidth, center[1], center[2] - halfDepth],
    [center[0] - halfWidth, center[1], center[2] + halfDepth],
    [center[0] + halfWidth, center[1], center[2] + halfDepth],
  ];
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

function boardRimBounds(
  boardId: BoardId,
  focusedBoardId: BoardId | null,
  perspectiveSlot: PlayerSlot,
) {
  const half = BOARD_RIM_SIZE / 2;
  const corners: Vector3Tuple[] = [
    [-half, 0.1, -half],
    [half, 0.1, -half],
    [-half, 0.1, half],
    [half, 0.1, half],
  ];

  return boundsFor(
    corners.map((corner) =>
      transformPoint(corner, boardId, focusedBoardId, perspectiveSlot),
    ),
  );
}

export function playerHandPosition(
  _slot: PlayerSlot,
  perspectiveSlot: PlayerSlot,
  focusedBoardId: BoardId | null = null,
): Vector3Tuple {
  const frontBoard = boardsForPerspective(perspectiveSlot).front;
  const frontBounds = boardRimBounds(frontBoard, focusedBoardId, perspectiveSlot);

  return [
    (frontBounds.minX + frontBounds.maxX) / 2,
    0.02,
    frontBounds.maxZ +
      TABLE_ACCESSORY_SIZES.reserveHand.footprintDepth / 2 +
      TABLE_LAYOUT_RULES.reserveHandGutter,
  ];
}

export function captureRackPosition(
  slot: PlayerSlot,
  perspectiveSlot: PlayerSlot,
  focusedBoardId: BoardId | null = null,
): Vector3Tuple {
  const station = playerTableStationForSlot(slot, perspectiveSlot);
  const [leftBoard, rightBoard, frontBoard] =
    boardRenderOrderForPerspective(perspectiveSlot);
  const rack = TABLE_ACCESSORY_SIZES.captureRack;

  if (station === "near") {
    const bounds = boardRimBounds(frontBoard, focusedBoardId, perspectiveSlot);
    return [
      bounds.maxX + rack.width / 2 + TABLE_LAYOUT_RULES.captureRackGutter,
      0.05,
      bounds.maxZ - rack.depth / 2 - 0.18,
    ];
  }

  if (station === "left") {
    const bounds = boardRimBounds(leftBoard, focusedBoardId, perspectiveSlot);
    return [
      (bounds.minX + bounds.maxX) / 2,
      0.08,
      bounds.maxZ + rack.depth / 2 + TABLE_LAYOUT_RULES.captureRackGutter,
    ];
  }

  const bounds = boardRimBounds(rightBoard, focusedBoardId, perspectiveSlot);
  return [
    (bounds.minX + bounds.maxX) / 2,
    0.1,
    bounds.maxZ + rack.depth / 2 + TABLE_LAYOUT_RULES.captureRackGutter,
  ];
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

export function tableAccessoryCorners(
  perspectiveSlot: PlayerSlot = 0,
  {
    focusedBoardId = null,
    includeReserveHand = false,
  }: {
    focusedBoardId?: BoardId | null;
    includeReserveHand?: boolean;
  } = {},
): Vector3Tuple[] {
  const rack = TABLE_ACCESSORY_SIZES.captureRack;
  const captureCorners = ([0, 1, 2] as PlayerSlot[]).flatMap((slot) =>
    accessoryCorners(
      captureRackPosition(slot, perspectiveSlot, focusedBoardId),
      rack.width,
      rack.depth,
    ),
  );

  if (!includeReserveHand) return captureCorners;

  const hand = TABLE_ACCESSORY_SIZES.reserveHand;
  return [
    ...captureCorners,
    ...accessoryCorners(
      playerHandPosition(perspectiveSlot, perspectiveSlot, focusedBoardId),
      hand.width,
      hand.footprintDepth,
    ),
  ];
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
  {
    includeReserveHand = false,
  }: {
    includeReserveHand?: boolean;
  } = {},
): CameraFrame {
  const bounds = boundsFor(
    [
      ...battlefieldRimCorners(focusedBoardId, perspectiveSlot),
      ...tableAccessoryCorners(perspectiveSlot, {
        focusedBoardId,
        includeReserveHand,
      }),
    ],
  );
  const footprintWidth = bounds.maxX - bounds.minX;
  const footprintDepth = bounds.maxZ - bounds.minZ;
  const center: Vector3Tuple = [
    (bounds.minX + bounds.maxX) / 2,
    0.08,
    (bounds.minZ + bounds.maxZ) / 2 + 0.18,
  ];
  const viewWidth =
    Math.max(
      footprintWidth + TABLE_LAYOUT_RULES.cameraPaddingX,
      (footprintDepth + TABLE_LAYOUT_RULES.cameraPaddingZ) *
        aspect *
        TABLE_LAYOUT_RULES.cameraDepthScale,
    ) * TABLE_LAYOUT_RULES.cameraZoomScale;

  return {
    kind: "orthographic",
    viewWidth,
    position: [center[0], 5.05, 7.85],
    target: [center[0], center[1], center[2] - 0.1],
    up: [0, 1, 0],
  };
}
