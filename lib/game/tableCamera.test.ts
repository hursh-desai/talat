import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { BoardId } from "./types";
import {
  BASE_BOARD_LAYOUT,
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

describe("war table camera model", () => {
  it("uses one persistent triangular war-table layout", () => {
    expect(BASE_BOARD_LAYOUT.board02.position[2]).toBeGreaterThan(
      BASE_BOARD_LAYOUT.board01.position[2],
    );
    expect(BASE_BOARD_LAYOUT.board02.position[2]).toBeGreaterThan(
      BASE_BOARD_LAYOUT.board12.position[2],
    );
    expect(BASE_BOARD_LAYOUT.board02.scale).toBeGreaterThan(
      BASE_BOARD_LAYOUT.board01.scale,
    );
    expect(BASE_BOARD_LAYOUT.board02.scale).toBeGreaterThan(
      BASE_BOARD_LAYOUT.board12.scale,
    );
    expect(BASE_BOARD_LAYOUT.board01.rotationY).toBeLessThan(0);
    expect(BASE_BOARD_LAYOUT.board12.rotationY).toBeGreaterThan(0);
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
