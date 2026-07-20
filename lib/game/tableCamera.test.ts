import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  BATTLEFIELD_CENTER,
  CAMERA_PRESETS,
  PLAYER_CAMERA_ANGLES,
  battlefieldRimCorners,
  cameraAngleForSlot,
  resolveCameraFrame,
  type CameraAngle,
  type CameraFrame,
} from "./tableCamera";

const CAMERA_ANGLES = Object.keys(CAMERA_PRESETS) as CameraAngle[];

const VIEWPORTS = {
  screenshot: 1724 / 1088,
  wideDesktop: 16 / 9,
  square: 1,
  tallMobile: 390 / 844,
};

function makeCamera(frame: CameraFrame, aspect: number): THREE.Camera {
  let camera: THREE.Camera;

  if (frame.kind === "perspective") {
    camera = new THREE.PerspectiveCamera(frame.fov, aspect, 0.1, 100);
  } else {
    const viewHeight = frame.viewWidth / aspect;
    camera = new THREE.OrthographicCamera(
      -frame.viewWidth / 2,
      frame.viewWidth / 2,
      viewHeight / 2,
      -viewHeight / 2,
      0.1,
      100,
    );
    camera.up.set(...frame.up);
  }

  camera.position.set(...frame.position);
  camera.lookAt(...frame.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  return camera;
}

function projectedCorners(angle: CameraAngle, aspect: number): THREE.Vector3[] {
  const camera = makeCamera(resolveCameraFrame(angle, aspect), aspect);
  return battlefieldRimCorners().map((point) =>
    new THREE.Vector3(...point).project(camera),
  );
}

describe("table camera model", () => {
  it("offers three player perspectives and one bird's-eye map", () => {
    expect(CAMERA_ANGLES).toEqual(["black", "white", "grey", "map"]);
    expect(cameraAngleForSlot(0)).toBe("black");
    expect(cameraAngleForSlot(1)).toBe("white");
    expect(cameraAngleForSlot(2)).toBe("grey");
    expect(new Set(Object.values(PLAYER_CAMERA_ANGLES)).size).toBe(3);
    expect(CAMERA_PRESETS.map.kind).toBe("orthographic");
  });

  it("places each player camera on a different side of the table", () => {
    const black = CAMERA_PRESETS.black.desktop.position;
    const white = CAMERA_PRESETS.white.desktop.position;
    const grey = CAMERA_PRESETS.grey.desktop.position;

    expect(black[0]).toBeLessThan(BATTLEFIELD_CENTER[0]);
    expect(white[2]).toBeLessThan(BATTLEFIELD_CENTER[2]);
    expect(grey[0]).toBeGreaterThan(BATTLEFIELD_CENTER[0]);
  });

  it("keeps the whole three-board battlefield in frame for every camera", () => {
    for (const [viewportName, aspect] of Object.entries(VIEWPORTS)) {
      for (const angle of CAMERA_ANGLES) {
        const corners = projectedCorners(angle, aspect);
        const maxAbs = Math.max(
          ...corners.flatMap(({ x, y }) => [Math.abs(x), Math.abs(y)]),
        );

        expect(maxAbs, `${angle} ${viewportName}`).toBeLessThanOrEqual(0.98);
      }
    }
  });
});
