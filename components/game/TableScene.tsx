"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type {
  BoardId,
  Boards,
  PlacedTower,
  PlayerSlot,
  Position,
} from "@/lib/game/types";
import { playersOnBoard } from "@/lib/game/types";
import { startingRow } from "@/lib/game/geometry";

type TableSceneProps = {
  boards: Boards;
  frozenBoards: boolean[];
  interactive?: boolean;
  cameraAngle?: CameraAngle;
  highlightByBoard?: Partial<Record<BoardId, Position[]>>;
  selected?: { boardId: BoardId; position: Position } | null;
  onCellClick?: (
    boardId: BoardId,
    position: Position,
    piece: PlacedTower | null,
  ) => void;
};

export type CameraAngle = "original" | "table" | "overhead";

const BOARD_ORDER: BoardId[] = ["board01", "board02", "board12"];
const BOARD_INDEX: Record<BoardId, number> = {
  board01: 0,
  board02: 1,
  board12: 2,
};
const CELL_SIZE = 0.64;
const BOARD_SIZE = CELL_SIZE * 5;

const BOARD_LAYOUT: Record<
  BoardId,
  { position: [number, number, number]; rotationY: number }
> = {
  board01: { position: [-2.28, 0, -1.5], rotationY: -0.3 },
  board02: { position: [0, 0, 2.18], rotationY: 0 },
  board12: { position: [2.28, 0, -1.5], rotationY: 0.3 },
};

const SLOT_COLORS: Record<PlayerSlot, THREE.ColorRepresentation> = {
  0: "#171512",
  1: "#f2eee3",
  2: "#b7b1a7",
};

const CAMERA_PRESETS: Record<
  CameraAngle,
  | {
      kind: "perspective";
      desktop: { fov: number; position: [number, number, number] };
      narrow: { fov: number; position: [number, number, number] };
      target: [number, number, number];
    }
  | {
      kind: "orthographic";
      desktop: { viewWidth: number; position: [number, number, number] };
      narrow: { viewWidth: number; position: [number, number, number] };
      target: [number, number, number];
      up: [number, number, number];
    }
> = {
  original: {
    kind: "perspective",
    desktop: { fov: 42, position: [0, 3.25, 8.05] },
    narrow: { fov: 56, position: [0, 3.05, 8.65] },
    target: [0, 0.06, 0.05],
  },
  table: {
    kind: "orthographic",
    desktop: { viewWidth: 8.9, position: [0, 6.4, 4.9] },
    narrow: { viewWidth: 8.65, position: [0, 6.6, 5.2] },
    target: [0, 0, 0.28],
    up: [0, 1, 0],
  },
  overhead: {
    kind: "orthographic",
    desktop: { viewWidth: 8.3, position: [0, 9.2, 0.01] },
    narrow: { viewWidth: 8.15, position: [0, 9.2, 0.01] },
    target: [0, 0, 0],
    up: [0, 0, -1],
  },
};

function posKey(position: Position): string {
  return `${position.row},${position.col}`;
}

function makeWoodTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  const gradient = ctx.createLinearGradient(0, 0, 512, 96);
  gradient.addColorStop(0, "#6f4225");
  gradient.addColorStop(0.24, "#b57942");
  gradient.addColorStop(0.52, "#8e552f");
  gradient.addColorStop(0.76, "#c18a54");
  gradient.addColorStop(1, "#70411f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);

  for (let y = 0; y < 512; y += 36) {
    ctx.fillStyle = "rgba(50, 24, 11, 0.16)";
    ctx.fillRect(0, y, 512, 2);
  }
  for (let i = 0; i < 180; i++) {
    const y = (i * 37) % 512;
    const x = (i * 73) % 512;
    ctx.strokeStyle = `rgba(255, 225, 170, ${0.05 + (i % 5) * 0.012})`;
    ctx.beginPath();
    ctx.moveTo(x - 80, y);
    ctx.bezierCurveTo(x + 30, y - 14, x + 120, y + 14, x + 240, y);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.2, 1.5);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makePiece(piece: PlacedTower): THREE.Group {
  const group = new THREE.Group();
  const height = 0.24 + piece.height * 0.2;
  const radius = piece.sides === 3 ? 0.23 : piece.sides === 4 ? 0.22 : 0.24;
  const sideMaterial = new THREE.MeshStandardMaterial({
    color: SLOT_COLORS[piece.ownerSlot],
    roughness: 0.58,
    metalness: 0.02,
  });
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: piece.ownerSlot === 1 ? "#6f6b63" : "#d8b665",
    linewidth: 1,
  });

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, piece.sides, 1, false),
    sideMaterial,
  );
  body.position.y = height / 2;
  body.rotation.y = piece.sides === 3 ? Math.PI / 6 : 0;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const topInset = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.62, piece.sides),
    new THREE.MeshStandardMaterial({
      color: "#171310",
      roughness: 0.8,
      metalness: 0,
    }),
  );
  topInset.rotation.x = -Math.PI / 2;
  topInset.rotation.z = piece.sides === 3 ? -Math.PI / 6 : 0;
  topInset.position.y = height + 0.006;
  group.add(topInset);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(body.geometry),
    edgeMaterial,
  );
  edges.position.copy(body.position);
  edges.rotation.copy(body.rotation);
  group.add(edges);

  return group;
}

function addBoard(
  scene: THREE.Scene,
  args: {
    boardId: BoardId;
    boards: Boards;
    frozenBoards: boolean[];
    highlightSet: Set<string>;
    selectedKey: string | null;
    clickTargets: THREE.Object3D[];
    materials: {
      rim: THREE.Material;
      cell: THREE.Material;
      startCell: THREE.Material;
      highlight: THREE.Material;
      selected: THREE.Material;
      frozen: THREE.Material;
    };
  },
): void {
  const { boardId, boards, frozenBoards, highlightSet, selectedKey, materials } =
    args;
  const group = new THREE.Group();
  const layout = BOARD_LAYOUT[boardId];
  group.position.set(...layout.position);
  group.rotation.y = layout.rotationY;
  group.userData.boardId = boardId;

  const rim = new THREE.Mesh(
    new THREE.BoxGeometry(BOARD_SIZE + 0.42, 0.08, BOARD_SIZE + 0.42),
    materials.rim,
  );
  rim.position.y = 0.02;
  rim.receiveShadow = true;
  group.add(rim);

  const [playerA, playerB] = playersOnBoard(boardId);
  const board = boards[boardId];
  const frozen = frozenBoards[BOARD_INDEX[boardId]];

  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const key = `${row},${col}`;
      const position = { row, col };
      const isStart =
        row === startingRow(boardId, playerA) ||
        row === startingRow(boardId, playerB);
      const isHighlighted = highlightSet.has(key);
      const isSelected = selectedKey === key;

      const cell = new THREE.Mesh(
        new THREE.BoxGeometry(CELL_SIZE * 0.94, 0.035, CELL_SIZE * 0.94),
        frozen
          ? materials.frozen
          : isSelected
            ? materials.selected
            : isHighlighted
              ? materials.highlight
              : isStart
                ? materials.startCell
                : materials.cell,
      );
      cell.position.set(
        (col - 2) * CELL_SIZE,
        0.085,
        (row - 2) * CELL_SIZE,
      );
      cell.receiveShadow = true;
      cell.userData = {
        boardId,
        position,
        piece: board[row][col],
      };
      args.clickTargets.push(cell);
      group.add(cell);

      const piece = board[row][col];
      if (piece) {
        const pieceObject = makePiece(piece);
        pieceObject.position.set(cell.position.x, 0.12, cell.position.z);
        pieceObject.userData = { boardId, position, piece };
        args.clickTargets.push(pieceObject);
        group.add(pieceObject);
      }
    }
  }

  scene.add(group);
}

export function TableScene({
  boards,
  frozenBoards,
  interactive = false,
  cameraAngle = "original",
  highlightByBoard = {},
  selected,
  onCellClick,
}: TableSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const onCellClickRef = useRef(onCellClick);

  useEffect(() => {
    onCellClickRef.current = onCellClick;
  }, [onCellClick]);

  useEffect(() => {
    const mountElement = mountRef.current;
    if (!mountElement) return;
    const container: HTMLDivElement = mountElement;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#130d09");

    const initialPreset = CAMERA_PRESETS[cameraAngle];
    const camera =
      initialPreset.kind === "orthographic"
        ? new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
        : new THREE.PerspectiveCamera(38, 1, 0.1, 100);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const clickTargets: THREE.Object3D[] = [];

    const materials = {
      rim: new THREE.MeshStandardMaterial({
        color: "#15100d",
        roughness: 0.7,
        metalness: 0.04,
      }),
      cell: new THREE.MeshStandardMaterial({
        color: "#ded6ca",
        roughness: 0.62,
        metalness: 0,
      }),
      startCell: new THREE.MeshStandardMaterial({
        color: "#efe7da",
        roughness: 0.62,
        metalness: 0,
      }),
      highlight: new THREE.MeshStandardMaterial({
        color: "#e5bd54",
        emissive: "#5f3e08",
        emissiveIntensity: 0.24,
        roughness: 0.5,
        metalness: 0,
      }),
      selected: new THREE.MeshStandardMaterial({
        color: "#fff5dc",
        emissive: "#b48a2d",
        emissiveIntensity: 0.18,
        roughness: 0.5,
        metalness: 0,
      }),
      frozen: new THREE.MeshStandardMaterial({
        color: "#999b9d",
        roughness: 0.72,
        metalness: 0,
      }),
    };

    const woodTexture = makeWoodTexture();
    const table = new THREE.Mesh(
      new THREE.BoxGeometry(12.6, 0.16, 11.4),
      new THREE.MeshStandardMaterial({
        map: woodTexture,
        roughness: 0.72,
        metalness: 0,
      }),
    );
    table.position.y = -0.12;
    table.receiveShadow = true;
    scene.add(table);

    const horizon = new THREE.Mesh(
      new THREE.BoxGeometry(12.6, 2.2, 0.12),
      new THREE.MeshStandardMaterial({
        color: "#211309",
        roughness: 0.86,
        metalness: 0,
      }),
    );
    horizon.position.set(0, 0.98, -5.72);
    horizon.receiveShadow = true;
    scene.add(horizon);

    scene.add(new THREE.HemisphereLight("#fff0d1", "#2b170e", 1.9));

    const keyLight = new THREE.DirectionalLight("#ffe4b4", 2.6);
    keyLight.position.set(-2.8, 5.4, 3.8);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    scene.add(keyLight);

    const fillLight = new THREE.PointLight("#c98b55", 20, 12);
    fillLight.position.set(3.8, 2.2, 2.5);
    scene.add(fillLight);

    for (const boardId of BOARD_ORDER) {
      addBoard(scene, {
        boardId,
        boards,
        frozenBoards,
        highlightSet: new Set((highlightByBoard[boardId] ?? []).map(posKey)),
        selectedKey:
          selected?.boardId === boardId ? posKey(selected.position) : null,
        clickTargets,
        materials,
      });
    }

    function resize() {
      const width = Math.max(320, Math.round(container.clientWidth));
      const height = Math.max(320, Math.round(container.clientHeight));
      const aspect = width / height;
      const isNarrow = aspect < 0.9;
      const preset = CAMERA_PRESETS[cameraAngle];

      const up: [number, number, number] =
        preset.kind === "orthographic" ? preset.up : [0, 1, 0];

      camera.up.set(...up);
      if (camera instanceof THREE.PerspectiveCamera) {
        if (preset.kind !== "perspective") return;
        const nextCamera = isNarrow ? preset.narrow : preset.desktop;
        camera.position.set(...nextCamera.position);
        camera.aspect = aspect;
        camera.fov = nextCamera.fov;
      } else {
        if (preset.kind !== "orthographic") return;
        const nextCamera = isNarrow ? preset.narrow : preset.desktop;
        camera.position.set(...nextCamera.position);
        const viewWidth = nextCamera.viewWidth;
        const viewHeight = viewWidth / aspect;
        camera.left = -viewWidth / 2;
        camera.right = viewWidth / 2;
        camera.top = viewHeight / 2;
        camera.bottom = -viewHeight / 2;
      }
      camera.lookAt(...preset.target);
      renderer.setSize(width, height, false);
      camera.updateProjectionMatrix();
    }

    function handlePointerMove(event: PointerEvent) {
      if (!interactive) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      container.style.cursor =
        raycaster.intersectObjects(clickTargets, true).length > 0
          ? "pointer"
          : "default";
    }

    function handlePointerDown(event: PointerEvent) {
      if (!interactive) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const [hit] = raycaster.intersectObjects(clickTargets, true);
      const target = hit?.object;
      if (!target) return;

      let current: THREE.Object3D | null = target;
      while (current && !current.userData.boardId) current = current.parent;
      if (!current) return;

      const boardId = current.userData.boardId as BoardId;
      const position = current.userData.position as Position;
      const piece = current.userData.piece as PlacedTower | null;
      onCellClickRef.current?.(boardId, position, piece);
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);

    let frame = 0;
    function animate() {
      frame = window.requestAnimationFrame(animate);
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      container.style.cursor = "default";
      renderer.dispose();
      woodTexture.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          object.geometry.dispose();
          const materialsToDispose = Array.isArray(object.material)
            ? object.material
            : [object.material];
          for (const material of materialsToDispose) material.dispose();
        }
      });
      renderer.domElement.remove();
    };
  }, [
    boards,
    cameraAngle,
    frozenBoards,
    highlightByBoard,
    interactive,
    selected,
  ]);

  return (
    <div
      ref={mountRef}
      className="h-full w-full overflow-hidden rounded-md"
      data-testid="table-scene"
    />
  );
}
