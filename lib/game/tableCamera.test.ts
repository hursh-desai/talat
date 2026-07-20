import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { startingRow } from "./geometry";
import { opponentsOnBoard } from "./types";
import type { BoardId, PlayerSlot } from "./types";
import {
  BASE_BOARD_LAYOUT,
  BOARD_RIM_SIZE,
  CELL_WORLD_SIZE,
  boardRenderOrderForPerspective,
  battlefieldRimCorners,
  boardLayoutForFocus,
  resolveWarTableFrame,
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
  const camera = makeCamera(
    resolveWarTableFrame(aspect, focusedBoardId),
    aspect,
  );
  return battlefieldRimCorners(focusedBoardId).map((point) =>
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
    expect(BASE_BOARD_LAYOUT.board12.position[2]).toBeLessThan(
      BASE_BOARD_LAYOUT.board01.position[2],
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
      expect(right.position[2], `far board for ${slot}`).toBeLessThan(
        left.position[2],
      );
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
});
