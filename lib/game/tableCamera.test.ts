import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { startingRow } from "./geometry";
import { opponentsOnBoard } from "./types";
import type { BoardId, PlayerSlot } from "./types";
import {
  BASE_BOARD_LAYOUT,
  BOARD_RIM_SIZE,
  CELL_WORLD_SIZE,
  TABLE_ACCESSORY_SIZES,
  TABLE_LAYOUT_RULES,
  boardRenderOrderForPerspective,
  battlefieldRimCorners,
  boardLayoutForFocus,
  captureRackPosition,
  playerHandPosition,
  resolveWarTableFrame,
  tableAccessoryCorners,
  tableLayoutModeForAspect,
  type TableLayoutMode,
  type CameraFrame,
} from "./tableCamera";

const VIEWPORTS = {
  screenshot: 1724 / 1088,
  wideDesktop: 16 / 9,
  square: 1,
  tallMobile: 390 / 844,
};

const BOARD_IDS: BoardId[] = ["board01", "board02", "board12"];
const PLAYER_SLOTS: PlayerSlot[] = [0, 1, 2];
const TABLE_SURFACE_Y = -0.04;

function makeCamera(
  frame: CameraFrame,
  aspect: number,
): THREE.OrthographicCamera {
  const viewHeight = frame.viewWidth / aspect;
  const camera = new THREE.OrthographicCamera(
    -frame.viewWidth / 2,
    frame.viewWidth / 2,
    viewHeight / 2,
    -viewHeight / 2,
    0.1,
    100,
  );

  camera.up.set(...frame.up);
  camera.position.set(...frame.position);
  camera.lookAt(...frame.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  return camera;
}

function projectedCorners(
  aspect: number,
  focusedBoardId: BoardId | null = null,
): THREE.Vector3[] {
  const layoutMode = tableLayoutModeForAspect(aspect);
  const camera = makeCamera(
    resolveWarTableFrame(aspect, focusedBoardId),
    aspect,
  );
  return battlefieldRimCorners(focusedBoardId, 0, layoutMode).map((point) =>
    new THREE.Vector3(...point).project(camera),
  );
}

function rotateX(point: THREE.Vector3, rotationX: number): THREE.Vector3 {
  return point.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), rotationX);
}

function minBoardRimBottomY(boardId: BoardId): number {
  const base = BASE_BOARD_LAYOUT[boardId];
  const half = BOARD_RIM_SIZE / 2;
  const rimBottomY = -0.02;
  const bottomCorners = [
    new THREE.Vector3(-half * base.scale, rimBottomY, -half * base.scale),
    new THREE.Vector3(half * base.scale, rimBottomY, -half * base.scale),
    new THREE.Vector3(-half * base.scale, rimBottomY, half * base.scale),
    new THREE.Vector3(half * base.scale, rimBottomY, half * base.scale),
  ];

  return (
    Math.min(
      ...bottomCorners.map((corner) => rotateX(corner, base.rotationX).y),
    ) + base.position[1]
  );
}

function worldCellCenter(
  boardId: BoardId,
  row: number,
  perspectiveSlot: PlayerSlot,
): THREE.Vector3 {
  const layout = boardLayoutForFocus(boardId, null, perspectiveSlot);
  return new THREE.Vector3(
    0,
    0.12,
    (row - 2) * CELL_WORLD_SIZE * layout.scale,
  )
    .applyAxisAngle(new THREE.Vector3(1, 0, 0), layout.rotationX)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), layout.rotationY)
    .add(new THREE.Vector3(...layout.position));
}

function boardRimBounds(
  boardId: BoardId,
  perspectiveSlot: PlayerSlot,
  focusedBoardId: BoardId | null = null,
  layoutMode: TableLayoutMode = "default",
) {
  const layout = boardLayoutForFocus(
    boardId,
    focusedBoardId,
    perspectiveSlot,
    layoutMode,
  );
  const half = BOARD_RIM_SIZE / 2;
  const corners = [
    new THREE.Vector3(-half * layout.scale, 0.1, -half * layout.scale),
    new THREE.Vector3(half * layout.scale, 0.1, -half * layout.scale),
    new THREE.Vector3(-half * layout.scale, 0.1, half * layout.scale),
    new THREE.Vector3(half * layout.scale, 0.1, half * layout.scale),
  ].map((corner) =>
    corner
      .applyAxisAngle(new THREE.Vector3(1, 0, 0), layout.rotationX)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), layout.rotationY)
      .add(new THREE.Vector3(...layout.position)),
  );

  return corners.reduce(
    (bounds, corner) => ({
      minX: Math.min(bounds.minX, corner.x),
      maxX: Math.max(bounds.maxX, corner.x),
      minZ: Math.min(bounds.minZ, corner.z),
      maxZ: Math.max(bounds.maxZ, corner.z),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY,
    },
  );
}

function boxBounds(center: THREE.Vector3, width: number, depth: number) {
  return {
    minX: center.x - width / 2,
    maxX: center.x + width / 2,
    minZ: center.z - depth / 2,
    maxZ: center.z + depth / 2,
  };
}

describe("war table camera model", () => {
  it("keeps the black-perspective control board in front and the second black board to its left", () => {
    expect(BASE_BOARD_LAYOUT.board02.position[2]).toBeGreaterThan(
      BASE_BOARD_LAYOUT.board01.position[2],
    );
    expect(BASE_BOARD_LAYOUT.board02.position[2]).toBeGreaterThan(
      BASE_BOARD_LAYOUT.board12.position[2],
    );
    expect(BASE_BOARD_LAYOUT.board01.position[0]).toBeLessThan(
      BASE_BOARD_LAYOUT.board02.position[0],
    );
    expect(BASE_BOARD_LAYOUT.board12.position[0]).toBeGreaterThan(
      BASE_BOARD_LAYOUT.board02.position[0],
    );
    expect(BASE_BOARD_LAYOUT.board02.scale).toBeGreaterThan(
      BASE_BOARD_LAYOUT.board01.scale,
    );
    expect(BASE_BOARD_LAYOUT.board01.scale).toBeGreaterThan(
      BASE_BOARD_LAYOUT.board12.scale,
    );
  });

  it("arranges each player's boards from that player's clockwise perspective", () => {
    expect(boardRenderOrderForPerspective(0)).toEqual([
      "board01",
      "board12",
      "board02",
    ]);
    expect(boardRenderOrderForPerspective(1)).toEqual([
      "board12",
      "board02",
      "board01",
    ]);
    expect(boardRenderOrderForPerspective(2)).toEqual([
      "board02",
      "board01",
      "board12",
    ]);

    for (const slot of PLAYER_SLOTS) {
      const [leftBoard, rightBoard, frontBoard] =
        boardRenderOrderForPerspective(slot);
      const left = boardLayoutForFocus(leftBoard, null, slot);
      const right = boardLayoutForFocus(rightBoard, null, slot);
      const front = boardLayoutForFocus(frontBoard, null, slot);

      expect(front.position[2], `front board for ${slot}`).toBeGreaterThan(
        left.position[2],
      );
      expect(front.position[2], `front board for ${slot}`).toBeGreaterThan(
        right.position[2],
      );
      expect(left.position[0], `left board for ${slot}`).toBeLessThan(
        front.position[0],
      );
      expect(right.position[0], `right board for ${slot}`).toBeGreaterThan(
        front.position[0],
      );
      expect(
        Math.abs(
          boardRimBounds(leftBoard, slot).maxZ -
            boardRimBounds(rightBoard, slot).maxZ,
        ),
        `side-row edge alignment for ${slot}`,
      ).toBeLessThanOrEqual(0.04);
      expect(right.scale, `far board scale for ${slot}`).toBeLessThan(
        left.scale,
      );
    }
  });

  it("faces the controlled player's starting rows toward the viewer", () => {
    for (const slot of PLAYER_SLOTS) {
      const [leftBoard, , frontBoard] = boardRenderOrderForPerspective(slot);

      for (const boardId of [leftBoard, frontBoard]) {
        const opponent = opponentsOnBoard(boardId, slot);
        const ownRow = worldCellCenter(
          boardId,
          startingRow(boardId, slot),
          slot,
        );
        const opponentRow = worldCellCenter(
          boardId,
          startingRow(boardId, opponent),
          slot,
        );

        expect(
          ownRow.z,
          `${slot} should face ${boardId}`,
        ).toBeGreaterThan(opponentRow.z);
      }
    }
  });

  it("angles the far boards toward each other and tips them up for readability", () => {
    expect(BASE_BOARD_LAYOUT.board01.rotationY).toBeGreaterThan(0);
    expect(BASE_BOARD_LAYOUT.board12.rotationY).toBeLessThan(0);
    expect(BASE_BOARD_LAYOUT.board01.rotationX).toBeGreaterThan(
      BASE_BOARD_LAYOUT.board02.rotationX,
    );
    expect(BASE_BOARD_LAYOUT.board12.rotationX).toBeGreaterThan(
      BASE_BOARD_LAYOUT.board02.rotationX,
    );
  });

  it("derives board positions from clear spacing gutters", () => {
    for (const slot of PLAYER_SLOTS) {
      const [leftBoard, rightBoard, frontBoard] =
        boardRenderOrderForPerspective(slot);
      const left = boardRimBounds(leftBoard, slot);
      const right = boardRimBounds(rightBoard, slot);
      const front = boardRimBounds(frontBoard, slot);

      expect(
        front.minZ - left.maxZ,
        `left/front gutter for player ${slot}`,
      ).toBeGreaterThanOrEqual(TABLE_LAYOUT_RULES.sideToFrontGutter - 0.001);
      expect(
        front.minZ - right.maxZ,
        `right/front gutter for player ${slot}`,
      ).toBeGreaterThanOrEqual(TABLE_LAYOUT_RULES.sideToFrontGutter - 0.001);
      expect(
        right.minX - left.maxX,
        `side-board inner gutter for player ${slot}`,
      ).toBeGreaterThanOrEqual(TABLE_LAYOUT_RULES.sideInnerGutter - 0.001);
    }
  });

  it("uses taller table spacing on narrow mobile viewports", () => {
    const mobileLayoutMode = tableLayoutModeForAspect(VIEWPORTS.tallMobile);

    expect(mobileLayoutMode).toBe("mobileTall");
    expect(tableLayoutModeForAspect(VIEWPORTS.square)).toBe("default");

    for (const slot of PLAYER_SLOTS) {
      const [leftBoard, rightBoard, frontBoard] =
        boardRenderOrderForPerspective(slot);
      const defaultLeft = boardRimBounds(leftBoard, slot);
      const defaultRight = boardRimBounds(rightBoard, slot);
      const defaultFront = boardRimBounds(frontBoard, slot);
      const mobileLeft = boardRimBounds(
        leftBoard,
        slot,
        null,
        mobileLayoutMode,
      );
      const mobileRight = boardRimBounds(
        rightBoard,
        slot,
        null,
        mobileLayoutMode,
      );
      const mobileFront = boardRimBounds(
        frontBoard,
        slot,
        null,
        mobileLayoutMode,
      );

      expect(mobileRight.minX - mobileLeft.maxX).toBeLessThan(
        defaultRight.minX - defaultLeft.maxX,
      );
      expect(mobileFront.minZ - mobileLeft.maxZ).toBeGreaterThan(
        defaultFront.minZ - defaultLeft.maxZ,
      );
      expect(mobileFront.minZ - mobileRight.maxZ).toBeGreaterThan(
        defaultFront.minZ - defaultRight.maxZ,
      );
    }
  });

  it("keeps board gutters visible while a board is focused", () => {
    for (const slot of PLAYER_SLOTS) {
      const [leftBoard, rightBoard, frontBoard] =
        boardRenderOrderForPerspective(slot);

      for (const focusedBoardId of BOARD_IDS) {
        const left = boardRimBounds(leftBoard, slot, focusedBoardId);
        const right = boardRimBounds(rightBoard, slot, focusedBoardId);
        const front = boardRimBounds(frontBoard, slot, focusedBoardId);

        expect(
          front.minZ - left.maxZ,
          `left/front focused gutter for player ${slot}, focus ${focusedBoardId}`,
        ).toBeGreaterThanOrEqual(0.4);
        expect(
          front.minZ - right.maxZ,
          `right/front focused gutter for player ${slot}, focus ${focusedBoardId}`,
        ).toBeGreaterThanOrEqual(0.4);
        expect(
          right.minX - left.maxX,
          `side-board focused gutter for player ${slot}, focus ${focusedBoardId}`,
        ).toBeGreaterThanOrEqual(0.6);
      }
    }
  });

  it("keeps the setup hand clear of the front board", () => {
    for (const slot of PLAYER_SLOTS) {
      const [, , frontBoard] = boardRenderOrderForPerspective(slot);
      const front = boardRimBounds(frontBoard, slot);
      const hand = boxBounds(
        new THREE.Vector3(...playerHandPosition(slot, slot)),
        TABLE_ACCESSORY_SIZES.reserveHand.width,
        TABLE_ACCESSORY_SIZES.reserveHand.footprintDepth,
      );

      expect(
        hand.minZ - front.maxZ,
        `setup hand gutter for player ${slot}`,
      ).toBeGreaterThanOrEqual(TABLE_LAYOUT_RULES.reserveHandGutter - 0.001);
    }
  });

  it("anchors score racks near their related board edges without touching boards", () => {
    for (const perspectiveSlot of PLAYER_SLOTS) {
      const [leftBoard, rightBoard, frontBoard] =
        boardRenderOrderForPerspective(perspectiveSlot);
      const nearSlot = perspectiveSlot;
      const leftSlot = ((perspectiveSlot + 1) % 3) as PlayerSlot;
      const farSlot = ((perspectiveSlot + 2) % 3) as PlayerSlot;
      const left = boardRimBounds(leftBoard, perspectiveSlot);
      const right = boardRimBounds(rightBoard, perspectiveSlot);
      const front = boardRimBounds(frontBoard, perspectiveSlot);
      const rackSize = TABLE_ACCESSORY_SIZES.captureRack;
      const nearRack = boxBounds(
        new THREE.Vector3(
          ...captureRackPosition(nearSlot, perspectiveSlot),
        ),
        rackSize.width,
        rackSize.depth,
      );
      const leftRack = boxBounds(
        new THREE.Vector3(...captureRackPosition(leftSlot, perspectiveSlot)),
        rackSize.width,
        rackSize.depth,
      );
      const farRack = boxBounds(
        new THREE.Vector3(...captureRackPosition(farSlot, perspectiveSlot)),
        rackSize.width,
        rackSize.depth,
      );

      expect(
        nearRack.minX - front.maxX,
        `near rack/front board gutter from perspective ${perspectiveSlot}`,
      ).toBeGreaterThanOrEqual(TABLE_LAYOUT_RULES.captureRackGutter - 0.001);
      expect(
        leftRack.minZ - left.maxZ,
        `left rack/left board gutter from perspective ${perspectiveSlot}`,
      ).toBeGreaterThanOrEqual(TABLE_LAYOUT_RULES.captureRackGutter - 0.001);
      expect(
        farRack.minZ - right.maxZ,
        `far rack/right board gutter from perspective ${perspectiveSlot}`,
      ).toBeGreaterThanOrEqual(TABLE_LAYOUT_RULES.captureRackGutter - 0.001);
      expect(
        front.minZ - leftRack.maxZ,
        `left rack/front board gutter from perspective ${perspectiveSlot}`,
      ).toBeGreaterThanOrEqual(TABLE_LAYOUT_RULES.captureRackGutter - 0.001);
      expect(
        front.minZ - farRack.maxZ,
        `far rack/front board gutter from perspective ${perspectiveSlot}`,
      ).toBeGreaterThanOrEqual(TABLE_LAYOUT_RULES.captureRackGutter - 0.001);
      expect(
        Math.abs(
          (leftRack.minX + leftRack.maxX) / 2 -
            (left.minX + left.maxX) / 2,
        ),
        `left rack centered under left board from perspective ${perspectiveSlot}`,
      ).toBeLessThanOrEqual(0.001);
      expect(
        Math.abs(
          (farRack.minX + farRack.maxX) / 2 -
            (right.minX + right.maxX) / 2,
        ),
        `far rack centered under right board from perspective ${perspectiveSlot}`,
      ).toBeLessThanOrEqual(0.001);
    }
  });

  it("keeps tilted board rims above the tabletop", () => {
    expect(minBoardRimBottomY("board01")).toBeGreaterThan(TABLE_SURFACE_Y);
    expect(minBoardRimBottomY("board12")).toBeGreaterThan(TABLE_SURFACE_Y);
  });

  it("focuses a board with scale and lift instead of switching cameras", () => {
    const base = boardLayoutForFocus("board01", null);
    const focused = boardLayoutForFocus("board01", "board01");
    const receded = boardLayoutForFocus("board01", "board02");

    expect(focused.scale).toBeGreaterThan(base.scale);
    expect(focused.position[1]).toBeGreaterThan(base.position[1]);
    expect(receded.scale).toBeLessThan(base.scale);
  });

  it("keeps every board in frame for the default and focused states", () => {
    for (const [viewportName, aspect] of Object.entries(VIEWPORTS)) {
      for (const focusedBoardId of [null, ...BOARD_IDS]) {
        const corners = projectedCorners(aspect, focusedBoardId);
        const maxAbs = Math.max(
          ...corners.flatMap(({ x, y }) => [Math.abs(x), Math.abs(y)]),
        );

        expect(
          maxAbs,
          `${viewportName} focus=${focusedBoardId ?? "none"}`,
        ).toBeLessThanOrEqual(0.98);
      }
    }
  });

  it("keeps rendered boards and setup accessories in frame together", () => {
    for (const [viewportName, aspect] of Object.entries(VIEWPORTS)) {
      for (const slot of PLAYER_SLOTS) {
        const camera = makeCamera(
          resolveWarTableFrame(aspect, null, slot, {
            includeReserveHand: true,
          }),
          aspect,
        );
        const corners = [
          ...battlefieldRimCorners(
            null,
            slot,
            tableLayoutModeForAspect(aspect),
          ),
          ...tableAccessoryCorners(slot, {
            includeReserveHand: true,
            layoutMode: tableLayoutModeForAspect(aspect),
          }),
        ].map((point) => new THREE.Vector3(...point).project(camera));
        const maxAbs = Math.max(
          ...corners.flatMap(({ x, y }) => [Math.abs(x), Math.abs(y)]),
        );

        expect(
          maxAbs,
          `${viewportName} setup scene for player ${slot}`,
        ).toBeLessThanOrEqual(0.98);
      }
    }
  });
});
