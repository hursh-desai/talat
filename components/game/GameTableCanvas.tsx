"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, type ThreeEvent, useThree } from "@react-three/fiber";
import {
  OrthographicCamera as DreiOrthographicCamera,
  Text,
} from "@react-three/drei";
import * as THREE from "three";
import type {
  BoardId,
  Boards,
  PlacedTower,
  PlayerSlot,
  Position,
  TowerSpec,
} from "@/lib/game/types";
import {
  BOARD_INDEX,
  BOARD_RIM_SIZE,
  CELL_WORLD_SIZE,
  boardRenderOrderForPerspective,
  boardLayoutForFocus,
  resolveWarTableFrame,
  type Vector3Tuple,
} from "@/lib/game/tableCamera";
import { playersOnBoard, towerKey } from "@/lib/game/types";
import { startingRow } from "@/lib/game/geometry";

type DragIntent =
  | { kind: "reserve"; tower: TowerSpec; slot: PlayerSlot }
  | {
      kind: "piece";
      boardId: BoardId;
      position: Position;
      piece: PlacedTower;
    };

type HoveredCell = {
  boardId: BoardId;
  position: Position;
};

type GameTableCanvasProps = {
  boards: Boards;
  frozenBoards: boolean[];
  interactive?: boolean;
  setupReserves?: TowerSpec[];
  controlSlot?: PlayerSlot | null;
  activeSlot?: PlayerSlot | null;
  scores?: number[];
  capturedBySlot?: PlacedTower[][];
  highlightByBoard?: Partial<Record<BoardId, Position[]>>;
  selected?: { boardId: BoardId; position: Position } | null;
  pending?: boolean;
  statusText?: string;
  onReserveDrop?: (
    tower: TowerSpec,
    boardId: BoardId,
    position: Position,
  ) => void;
  onPieceDrop?: (
    boardId: BoardId,
    from: Position,
    to: Position,
    piece: PlacedTower,
  ) => void;
  onPieceSelect?: (
    boardId: BoardId,
    position: Position,
    piece: PlacedTower,
  ) => void;
};

const SLOT_COLORS: Record<PlayerSlot, string> = {
  0: "#171512",
  1: "#f2eee3",
  2: "#8f9294",
};

const SLOT_ACCENTS: Record<PlayerSlot, string> = {
  0: "#d9bb62",
  1: "#ddd6c8",
  2: "#b8c4cc",
};

type PlayerTableStation = "near" | "left" | "far";

const PLAYER_HAND_POSITIONS: Record<PlayerTableStation, Vector3Tuple> = {
  near: [0.02, 0.02, 3.42],
  left: [-2.78, 0.06, -0.52],
  far: [2.0, 0.08, -2.04],
};

const CAPTURE_RACK_POSITIONS: Record<PlayerTableStation, Vector3Tuple> = {
  near: [2.5, 0.05, 2.34],
  left: [-2.92, 0.08, 0.06],
  far: [2.28, 0.1, -1.52],
};

const BOARD_LABELS: Record<BoardId, string> = {
  board01: "Black / White",
  board02: "Black / Grey",
  board12: "White / Grey",
};

function posKey(position: Position): string {
  return `${position.row},${position.col}`;
}

function samePosition(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

function clockwiseNext(slot: PlayerSlot): PlayerSlot {
  return ((slot + 1) % 3) as PlayerSlot;
}

function tableStationForSlot(
  slot: PlayerSlot,
  perspectiveSlot: PlayerSlot,
): PlayerTableStation {
  if (slot === perspectiveSlot) return "near";
  if (slot === clockwiseNext(perspectiveSlot)) return "left";
  return "far";
}

function playerHandPosition(
  slot: PlayerSlot,
  perspectiveSlot: PlayerSlot,
): Vector3Tuple {
  return PLAYER_HAND_POSITIONS[tableStationForSlot(slot, perspectiveSlot)];
}

function captureRackPosition(
  slot: PlayerSlot,
  perspectiveSlot: PlayerSlot,
): Vector3Tuple {
  return CAPTURE_RACK_POSITIONS[tableStationForSlot(slot, perspectiveSlot)];
}

function cellPosition(position: Position): [number, number, number] {
  return [
    (position.col - 2) * CELL_WORLD_SIZE,
    0.12,
    (position.row - 2) * CELL_WORLD_SIZE,
  ];
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

function CameraRig({
  focusedBoardId,
  perspectiveSlot,
}: {
  focusedBoardId: BoardId | null;
  perspectiveSlot: PlayerSlot;
}) {
  const cameraRef = useRef<THREE.OrthographicCamera>(null);
  const { size } = useThree();

  useLayoutEffect(() => {
    const camera = cameraRef.current;
    if (!camera) return;

    const aspect = Math.max(0.1, size.width / Math.max(1, size.height));
    const frame = resolveWarTableFrame(aspect, focusedBoardId, perspectiveSlot);
    const viewHeight = frame.viewWidth / aspect;

    camera.up.set(...frame.up);
    camera.position.set(...frame.position);
    camera.left = -frame.viewWidth / 2;
    camera.right = frame.viewWidth / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.near = 0.1;
    camera.far = 100;
    camera.lookAt(...frame.target);
    camera.updateProjectionMatrix();
  }, [focusedBoardId, perspectiveSlot, size.height, size.width]);

  return <DreiOrthographicCamera ref={cameraRef} makeDefault />;
}

function TowerMesh({
  piece,
  slot,
  ghost = false,
  onPointerDown,
}: {
  piece: TowerSpec | PlacedTower;
  slot: PlayerSlot;
  ghost?: boolean;
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const height = 0.24 + piece.height * 0.2;
  const radius = piece.sides === 3 ? 0.23 : piece.sides === 4 ? 0.22 : 0.24;
  const accent = SLOT_ACCENTS[slot];

  return (
    <group onPointerDown={onPointerDown}>
      <mesh castShadow receiveShadow position={[0, height / 2, 0]}>
        <cylinderGeometry
          args={[radius, radius, height, piece.sides, 1, false]}
        />
        <meshStandardMaterial
          color={SLOT_COLORS[slot]}
          transparent={ghost}
          opacity={ghost ? 0.44 : 1}
          roughness={0.58}
          metalness={0.02}
        />
      </mesh>
      <mesh position={[0, height + 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius * 0.62, piece.sides]} />
        <meshStandardMaterial
          color="#171310"
          transparent={ghost}
          opacity={ghost ? 0.5 : 1}
          roughness={0.8}
        />
      </mesh>
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 1.08, radius * 1.16, piece.sides]} />
        <meshBasicMaterial color={accent} transparent opacity={ghost ? 0.34 : 0.72} />
      </mesh>
    </group>
  );
}

function CellDropTarget({
  boardId,
  position,
  piece,
  frozen,
  highlighted,
  selected,
  startRow,
  dragging,
  onHover,
  onPointerUp,
}: {
  boardId: BoardId;
  position: Position;
  piece: PlacedTower | null;
  frozen: boolean;
  highlighted: boolean;
  selected: boolean;
  startRow: boolean;
  dragging: boolean;
  onHover: (cell: HoveredCell | null) => void;
  onPointerUp: () => void;
}) {
  const color = frozen
    ? "#9da3aa"
    : selected
      ? "#fff5dc"
      : highlighted
        ? "#e5bd54"
        : startRow
          ? "#efe7da"
          : "#ded6ca";

  return (
    <group position={cellPosition(position)}>
      <mesh receiveShadow userData={{ boardId, position, piece }}>
        <boxGeometry args={[CELL_WORLD_SIZE * 0.94, 0.035, CELL_WORLD_SIZE * 0.94]} />
        <meshStandardMaterial
          color={color}
          emissive={highlighted || selected ? "#5f3e08" : "#000000"}
          emissiveIntensity={highlighted || selected ? 0.25 : 0}
          roughness={0.62}
        />
      </mesh>
      <mesh
        position={[0, 0.05, 0]}
        userData={{ boardId, position, piece }}
        onPointerOver={(event) => {
          if (!dragging) return;
          event.stopPropagation();
          onHover({ boardId, position });
        }}
        onPointerMove={(event) => {
          if (!dragging) return;
          event.stopPropagation();
          onHover({ boardId, position });
        }}
        onPointerUp={(event) => {
          event.stopPropagation();
          onHover({ boardId, position });
          onPointerUp();
        }}
      >
        <boxGeometry args={[CELL_WORLD_SIZE * 1.18, 0.024, CELL_WORLD_SIZE * 1.18]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function BoardMesh({
  boardId,
  boards,
  frozenBoards,
  highlighted,
  selected,
  hoveredCell,
  drag,
  interactive,
  focusedBoardId,
  perspectiveSlot,
  onHover,
  onPointerUp,
  onPieceDragStart,
}: {
  boardId: BoardId;
  boards: Boards;
  frozenBoards: boolean[];
  highlighted: Position[];
  selected: { boardId: BoardId; position: Position } | null;
  hoveredCell: HoveredCell | null;
  drag: DragIntent | null;
  interactive: boolean;
  focusedBoardId: BoardId | null;
  perspectiveSlot: PlayerSlot;
  onHover: (cell: HoveredCell | null) => void;
  onPointerUp: () => void;
  onPieceDragStart: (
    event: ThreeEvent<PointerEvent>,
    boardId: BoardId,
    position: Position,
    piece: PlacedTower,
  ) => void;
}) {
  const layout = boardLayoutForFocus(boardId, focusedBoardId, perspectiveSlot);
  const board = boards[boardId];
  const frozen = frozenBoards[BOARD_INDEX[boardId]];
  const highlightSet = useMemo(
    () => new Set(highlighted.map(posKey)),
    [highlighted],
  );
  const [playerA, playerB] = playersOnBoard(boardId);

  return (
    <group
      position={layout.position}
      rotation={[layout.rotationX, layout.rotationY, 0]}
      scale={[layout.scale, 1, layout.scale]}
    >
      <mesh receiveShadow position={[0, 0.02, 0]}>
        <boxGeometry args={[BOARD_RIM_SIZE, 0.08, BOARD_RIM_SIZE]} />
        <meshStandardMaterial
          color={frozen ? "#2a3338" : "#15100d"}
          roughness={0.7}
          metalness={0.04}
        />
      </mesh>
      <Text
        position={[0, 0.16, layout.labelPositionZ]}
        rotation={[-Math.PI / 2, 0, layout.labelRotationZ]}
        fontSize={0.16}
        color={frozen ? "#b8c4cc" : "#d9bb62"}
        anchorX="center"
        anchorY="middle"
      >
        {frozen ? `${BOARD_LABELS[boardId]} frozen` : BOARD_LABELS[boardId]}
      </Text>
      {board.map((row, rowIndex) =>
        row.map((piece, colIndex) => {
          const position = { row: rowIndex, col: colIndex };
          const isHighlighted = highlightSet.has(posKey(position));
          const isSelected =
            selected?.boardId === boardId &&
            samePosition(selected.position, position);
          const isStart =
            rowIndex === startingRow(boardId, playerA) ||
            rowIndex === startingRow(boardId, playerB);
          const isHovered =
            hoveredCell?.boardId === boardId &&
            samePosition(hoveredCell.position, position);

          return (
            <group key={`${rowIndex}-${colIndex}`}>
              <CellDropTarget
                boardId={boardId}
                position={position}
                piece={piece}
                frozen={frozen}
                highlighted={isHighlighted || isHovered}
                selected={isSelected}
                startRow={isStart}
                dragging={drag !== null}
                onHover={onHover}
                onPointerUp={onPointerUp}
              />
              {piece && (
                <group
                  position={cellPosition(position)}
                  scale={layout.pieceScale}
                >
                  <TowerMesh
                    piece={piece}
                    slot={piece.ownerSlot}
                    onPointerDown={
                      interactive
                        ? (event) =>
                            onPieceDragStart(event, boardId, position, piece)
                        : undefined
                    }
                  />
                </group>
              )}
            </group>
          );
        }),
      )}
      {drag && hoveredCell?.boardId === boardId && (
        <group position={cellPosition(hoveredCell.position)}>
          <TowerMesh
            piece={drag.kind === "reserve" ? drag.tower : drag.piece}
            slot={drag.kind === "reserve" ? drag.slot : drag.piece.ownerSlot}
            ghost
          />
        </group>
      )}
    </group>
  );
}

function ReserveHand({
  slot,
  perspectiveSlot,
  reserves,
  active,
  interactive,
  onReserveDragStart,
}: {
  slot: PlayerSlot;
  perspectiveSlot: PlayerSlot;
  reserves: TowerSpec[];
  active: boolean;
  interactive: boolean;
  onReserveDragStart: (
    event: ThreeEvent<PointerEvent>,
    tower: TowerSpec,
    slot: PlayerSlot,
  ) => void;
}) {
  const base = playerHandPosition(slot, perspectiveSlot);
  const accent = SLOT_ACCENTS[slot];

  return (
    <group position={base}>
      <mesh receiveShadow>
        <boxGeometry args={[2.7, 0.08, 0.72]} />
        <meshStandardMaterial
          color={active ? "#2b2111" : "#18120d"}
          emissive={active ? accent : "#000000"}
          emissiveIntensity={active ? 0.1 : 0}
          roughness={0.72}
        />
      </mesh>
      <Text
        position={[0, 0.13, -0.46]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.13}
        color={active ? accent : "#9b8c76"}
        anchorX="center"
        anchorY="middle"
      >
        {active ? "active hand" : "hand"}
      </Text>
      {reserves.map((tower, index) => {
        const x = -1.04 + (index % 5) * 0.52;
        const z = index < 5 ? -0.1 : 0.25;
        return (
          <group
            key={`${towerKey(tower)}-${index}`}
            position={[x, 0.08, z]}
            scale={0.7}
          >
            <TowerMesh
              piece={tower}
              slot={slot}
              onPointerDown={
                interactive
                  ? (event) => onReserveDragStart(event, tower, slot)
                  : undefined
              }
            />
          </group>
        );
      })}
    </group>
  );
}

function CaptureRack({
  slot,
  perspectiveSlot,
  score,
  captures,
  active,
}: {
  slot: PlayerSlot;
  perspectiveSlot: PlayerSlot;
  score: number;
  captures: PlacedTower[];
  active: boolean;
}) {
  const [x, y, z] = captureRackPosition(slot, perspectiveSlot);
  const accent = SLOT_ACCENTS[slot];

  return (
    <group position={[x, y, z]}>
      <mesh receiveShadow>
        <boxGeometry args={[1.18, 0.07, 0.42]} />
        <meshStandardMaterial
          color={active ? "#241c10" : "#15120f"}
          emissive={active ? accent : "#000000"}
          emissiveIntensity={active ? 0.1 : 0}
          roughness={0.76}
        />
      </mesh>
      <Text
        position={[-0.36, 0.12, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.16}
        color={accent}
        anchorX="center"
        anchorY="middle"
      >
        {score}
      </Text>
      <Text
        position={[0.22, 0.12, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.085}
        color="#d8cab0"
        anchorX="center"
        anchorY="middle"
      >
        {captures.length} captured
      </Text>
      {captures.slice(0, 4).map((piece, index) => (
        <group
          key={`${towerKey(piece)}-${index}`}
          position={[0.48 - index * 0.1, 0.1 + index * 0.04, 0.12]}
          scale={0.24}
        >
          <TowerMesh piece={piece} slot={piece.ownerSlot} />
        </group>
      ))}
    </group>
  );
}

function readCellFromEvent(
  event: ThreeEvent<PointerEvent>,
): HoveredCell | null {
  for (const intersection of event.intersections) {
    let object: THREE.Object3D | null = intersection.object;
    while (object) {
      const { boardId, position } = object.userData as {
        boardId?: BoardId;
        position?: Position;
      };
      if (boardId && position) return { boardId, position };
      object = object.parent;
    }
  }

  return null;
}

export function GameTableCanvas({
  boards,
  frozenBoards,
  interactive = false,
  setupReserves = [],
  controlSlot = null,
  activeSlot = null,
  scores = [0, 0, 0],
  capturedBySlot = [[], [], []],
  highlightByBoard = {},
  selected,
  pending = false,
  statusText = "Talat table",
  onReserveDrop,
  onPieceDrop,
  onPieceSelect,
}: GameTableCanvasProps) {
  const [drag, setDrag] = useState<DragIntent | null>(null);
  const [hoveredCell, setHoveredCell] = useState<HoveredCell | null>(null);
  const focusedBoardId = selected?.boardId ?? hoveredCell?.boardId ?? null;
  const perspectiveSlot = controlSlot ?? 0;
  const boardRenderOrder = useMemo(
    () => boardRenderOrderForPerspective(perspectiveSlot),
    [perspectiveSlot],
  );
  const woodTexture = useMemo(() => makeWoodTexture(), []);

  const commitDrop = useCallback(
    (cell = hoveredCell) => {
      if (!drag || !cell) {
        setDrag(null);
        setHoveredCell(null);
        return;
      }

      if (drag.kind === "reserve") {
        onReserveDrop?.(drag.tower, cell.boardId, cell.position);
      } else {
        onPieceDrop?.(cell.boardId, drag.position, cell.position, drag.piece);
      }

      setDrag(null);
      setHoveredCell(null);
    },
    [drag, hoveredCell, onPieceDrop, onReserveDrop],
  );

  const startCapture = useCallback((event: ThreeEvent<PointerEvent>) => {
    const target = event.target as Element;
    if ("setPointerCapture" in target) {
      target.setPointerCapture(event.pointerId);
    }
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-md bg-[#130d09]">
      <p className="sr-only" aria-live="polite">
        {statusText}
      </p>
      <Canvas
        orthographic
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
      >
        <CameraRig
          focusedBoardId={focusedBoardId}
          perspectiveSlot={perspectiveSlot}
        />
        <color attach="background" args={["#b57942"]} />
        <hemisphereLight args={["#fff0d1", "#2b170e", 1.9]} />
        <directionalLight
          position={[-2.8, 5.4, 3.8]}
          intensity={2.6}
          castShadow
        />
        <pointLight position={[3.8, 2.2, 2.5]} intensity={20} distance={12} />
        <group
          onPointerMove={(event) => {
            if (!drag) return;
            setHoveredCell(readCellFromEvent(event));
          }}
          onPointerUp={(event) => {
            if (!drag) return;
            const cell = readCellFromEvent(event);
            commitDrop(cell);
          }}
        >
          <mesh receiveShadow position={[0, -0.12, 0]}>
            <boxGeometry args={[160, 0.16, 160]} />
            <meshStandardMaterial map={woodTexture} roughness={0.72} />
          </mesh>
          <mesh position={[0, 0.02, 0]} receiveShadow>
            <ringGeometry args={[4.65, 4.82, 96]} />
            <meshBasicMaterial
              color={
                activeSlot === null ? "#5c4922" : SLOT_ACCENTS[activeSlot]
              }
              transparent
              opacity={pending ? 0.42 : 0.24}
            />
          </mesh>
          {boardRenderOrder.map((boardId) => (
            <BoardMesh
              key={boardId}
              boardId={boardId}
              boards={boards}
              frozenBoards={frozenBoards}
              highlighted={highlightByBoard[boardId] ?? []}
              selected={selected ?? null}
              hoveredCell={hoveredCell}
              drag={drag}
              interactive={interactive}
              focusedBoardId={focusedBoardId}
              perspectiveSlot={perspectiveSlot}
              onHover={setHoveredCell}
              onPointerUp={commitDrop}
              onPieceDragStart={(event, dragBoardId, position, piece) => {
                event.stopPropagation();
                if (!interactive) return;
                startCapture(event);
                onPieceSelect?.(dragBoardId, position, piece);
                setDrag({
                  kind: "piece",
                  boardId: dragBoardId,
                  position,
                  piece,
                });
              }}
            />
          ))}
          {controlSlot !== null && setupReserves.length > 0 && (
            <ReserveHand
              slot={controlSlot}
              perspectiveSlot={perspectiveSlot}
              reserves={setupReserves}
              active={interactive}
              interactive={interactive}
              onReserveDragStart={(event, tower, slot) => {
                event.stopPropagation();
                startCapture(event);
                setDrag({ kind: "reserve", tower, slot });
              }}
            />
          )}
          {([0, 1, 2] as PlayerSlot[]).map((slot) => (
            <CaptureRack
              key={slot}
              slot={slot}
              perspectiveSlot={perspectiveSlot}
              score={scores[slot] ?? 0}
              captures={capturedBySlot[slot] ?? []}
              active={activeSlot === slot}
            />
          ))}
        </group>
      </Canvas>
    </div>
  );
}
