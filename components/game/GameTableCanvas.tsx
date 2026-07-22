"use client";

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  TABLE_ACCESSORY_SIZES,
  boardRenderOrderForPerspective,
  boardLayoutForFocus,
  captureRackPosition,
  playerHandPosition,
  resolveWarTableFrame,
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

type ActivePointer = {
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
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
  selectedReserveTower?: TowerSpec | null;
  pending?: boolean;
  statusText?: string;
  boardPiecesInteractive?: boolean;
  onReserveDrop?: (
    tower: TowerSpec,
    boardId: BoardId,
    position: Position,
  ) => void;
  onReserveSelect?: (tower: TowerSpec) => void;
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
  onCellTap?: (
    boardId: BoardId,
    position: Position,
    piece: PlacedTower | null,
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

const HEIGHT_STREAK_SEGMENTS = [
  { from: 0.12, to: 0.38, opacity: 0.78 },
  { from: 0.4, to: 0.66, opacity: 0.52 },
  { from: 0.68, to: 0.9, opacity: 0.3 },
] as const;

const BOARD_LABELS: Record<BoardId, string> = {
  board01: "Black / White",
  board02: "Black / Grey",
  board12: "White / Grey",
};

const RESERVE_SHAPE_ORDER: TowerSpec["sides"][] = [3, 4, 6];
const TAP_MOVE_THRESHOLD = 6;

type ReserveHandPiece = {
  tower: TowerSpec;
  sourceIndex: number;
  position: [number, number, number];
  scale: number;
};

function posKey(position: Position): string {
  return `${position.row},${position.col}`;
}

function samePosition(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

function sameTower(a: TowerSpec, b: TowerSpec): boolean {
  return a.height === b.height && a.sides === b.sides;
}

function boardPieceKey(boardId: BoardId, position: Position): string {
  return `board:${boardId}:${position.row}:${position.col}`;
}

function reservePieceKey(
  slot: PlayerSlot,
  tower: TowerSpec,
  sourceIndex: number,
): string {
  return `reserve:${slot}:${towerKey(tower)}:${sourceIndex}`;
}

function heightMarkColor(slot: PlayerSlot): string {
  if (slot === 1) return "#5f5649";
  if (slot === 2) return "#f2eee3";
  return "#f5d875";
}

function reserveHandPieces(reserves: TowerSpec[]): ReserveHandPiece[] {
  return reserves
    .map((tower, sourceIndex) => ({ tower, sourceIndex }))
    .sort((a, b) => {
      const sideDelta =
        RESERVE_SHAPE_ORDER.indexOf(a.tower.sides) -
        RESERVE_SHAPE_ORDER.indexOf(b.tower.sides);
      return sideDelta || a.tower.height - b.tower.height;
    })
    .map(({ tower, sourceIndex }) => {
      const groupIndex = RESERVE_SHAPE_ORDER.indexOf(tower.sides);
      const heightIndex = tower.height - 1;
      const groupCenterX = -1.08 + groupIndex * 1.08;

      return {
        tower,
        sourceIndex,
        position: [
          groupCenterX + (heightIndex - 1) * 0.21,
          0.08 + heightIndex * 0.032,
          -0.31 + heightIndex * 0.37,
        ],
        scale: 0.64 + heightIndex * 0.035,
      };
    });
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
  includeReserveHand,
}: {
  focusedBoardId: BoardId | null;
  perspectiveSlot: PlayerSlot;
  includeReserveHand: boolean;
}) {
  const cameraRef = useRef<THREE.OrthographicCamera>(null);
  const { size } = useThree();

  useLayoutEffect(() => {
    const camera = cameraRef.current;
    if (!camera) return;

    const aspect = Math.max(0.1, size.width / Math.max(1, size.height));
    const frame = resolveWarTableFrame(aspect, focusedBoardId, perspectiveSlot, {
      includeReserveHand,
    });
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
  }, [
    focusedBoardId,
    includeReserveHand,
    perspectiveSlot,
    size.height,
    size.width,
  ]);

  return <DreiOrthographicCamera ref={cameraRef} makeDefault />;
}

function TowerMesh({
  piece,
  slot,
  ghost = false,
  hovered = false,
  selected = false,
  onPointerDown,
  onPointerOver,
  onPointerOut,
}: {
  piece: TowerSpec | PlacedTower;
  slot: PlayerSlot;
  ghost?: boolean;
  hovered?: boolean;
  selected?: boolean;
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerOver?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (event: ThreeEvent<PointerEvent>) => void;
}) {
  const height = 0.24 + piece.height * 0.2;
  const radius = piece.sides === 3 ? 0.23 : piece.sides === 4 ? 0.22 : 0.24;
  const accent = SLOT_ACCENTS[slot];
  const heightMark = heightMarkColor(slot);
  const topColor = slot === 0 ? "#f8f4e8" : "#171310";
  const interactiveAffordance = !ghost && (hovered || selected);
  const faceDistance = radius * Math.cos(Math.PI / piece.sides) + 0.006;
  const streakWidth = Math.max(0.018, radius * 0.1);
  const faceAngles = Array.from(
    { length: piece.sides },
    (_, faceIndex) => (faceIndex + 0.5) * (Math.PI * 2 / piece.sides),
  );

  return (
    <group
      position={[0, interactiveAffordance ? 0.055 : 0, 0]}
      scale={hovered && !selected && !ghost ? 1.07 : 1}
      onPointerDown={onPointerDown}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
    >
      {interactiveAffordance && (
        <mesh position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius * 1.22, radius * 1.43, 32]} />
          <meshBasicMaterial
            color={selected ? "#fff4c8" : "#f2ca58"}
            transparent
            opacity={selected ? 0.82 : 0.58}
            depthWrite={false}
          />
        </mesh>
      )}
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
      {HEIGHT_STREAK_SEGMENTS.slice(0, piece.height).flatMap(
        (segment, segmentIndex) =>
          faceAngles.map((angle, faceIndex) => {
            const segmentHeight = height * (segment.to - segment.from);
            const segmentY = height * ((segment.from + segment.to) / 2);

            return (
              <mesh
                key={`${segmentIndex}-${faceIndex}`}
                position={[
                  Math.sin(angle) * faceDistance,
                  segmentY,
                  Math.cos(angle) * faceDistance,
                ]}
                rotation={[0, angle, 0]}
              >
                <planeGeometry args={[streakWidth, segmentHeight]} />
                <meshBasicMaterial
                  color={heightMark}
                  transparent
                  opacity={ghost ? segment.opacity * 0.5 : segment.opacity}
                  depthWrite={false}
                  side={THREE.DoubleSide}
                />
              </mesh>
            );
          }),
      )}
      <mesh position={[0, height + 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius * 0.62, piece.sides]} />
        <meshStandardMaterial
          color={topColor}
          transparent={ghost}
          opacity={ghost ? 0.5 : 1}
          roughness={0.8}
        />
      </mesh>
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 1.08, radius * 1.16, piece.sides]} />
        <meshBasicMaterial
          color={interactiveAffordance ? "#fff1b7" : accent}
          transparent
          opacity={ghost ? 0.34 : interactiveAffordance ? 0.95 : 0.72}
        />
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
  hoverEnabled,
  onHover,
  onDragMove,
  onDragEnd,
  onCellTap,
}: {
  boardId: BoardId;
  position: Position;
  piece: PlacedTower | null;
  frozen: boolean;
  highlighted: boolean;
  selected: boolean;
  startRow: boolean;
  dragging: boolean;
  hoverEnabled: boolean;
  onHover: (cell: HoveredCell | null) => void;
  onDragMove: (
    event: ThreeEvent<PointerEvent>,
    cell: HoveredCell | null,
  ) => void;
  onDragEnd: (
    event: ThreeEvent<PointerEvent>,
    cell: HoveredCell | null,
  ) => void;
  onCellTap: (
    boardId: BoardId,
    position: Position,
    piece: PlacedTower | null,
  ) => void;
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
          if (!hoverEnabled) return;
          event.stopPropagation();
          onHover({ boardId, position });
        }}
        onPointerMove={(event) => {
          if (!hoverEnabled) return;
          event.stopPropagation();
          onHover({ boardId, position });
          if (dragging) {
            onDragMove(event, { boardId, position });
          }
        }}
        onPointerUp={(event) => {
          event.stopPropagation();
          if (dragging) {
            onHover({ boardId, position });
            onDragEnd(event, { boardId, position });
            return;
          }
          onCellTap(boardId, position, piece);
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
  hoveredPieceKey,
  drag,
  ghostPiece,
  interactive,
  hoverPreviewEnabled,
  boardPiecesInteractive,
  controlSlot,
  focusedBoardId,
  perspectiveSlot,
  onHover,
  onPieceHover,
  onDragMove,
  onDragEnd,
  onCellTap,
  onPieceDragStart,
}: {
  boardId: BoardId;
  boards: Boards;
  frozenBoards: boolean[];
  highlighted: Position[];
  selected: { boardId: BoardId; position: Position } | null;
  hoveredCell: HoveredCell | null;
  hoveredPieceKey: string | null;
  drag: DragIntent | null;
  ghostPiece: DragIntent | null;
  interactive: boolean;
  hoverPreviewEnabled: boolean;
  boardPiecesInteractive: boolean;
  controlSlot: PlayerSlot | null;
  focusedBoardId: BoardId | null;
  perspectiveSlot: PlayerSlot;
  onHover: (cell: HoveredCell | null) => void;
  onPieceHover: (pieceKey: string | null) => void;
  onDragMove: (
    event: ThreeEvent<PointerEvent>,
    cell: HoveredCell | null,
  ) => void;
  onDragEnd: (
    event: ThreeEvent<PointerEvent>,
    cell: HoveredCell | null,
  ) => void;
  onCellTap: (
    boardId: BoardId,
    position: Position,
    piece: PlacedTower | null,
  ) => void;
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
          const currentPieceKey = boardPieceKey(boardId, position);
          const pieceInteractive =
            interactive &&
            boardPiecesInteractive &&
            !frozen &&
            (controlSlot === null || piece?.ownerSlot === controlSlot);
          const isPieceHovered = hoveredPieceKey === currentPieceKey;

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
                hoverEnabled={hoverPreviewEnabled}
                onHover={onHover}
                onDragMove={onDragMove}
                onDragEnd={onDragEnd}
                onCellTap={onCellTap}
              />
              {piece && (
                <group
                  position={cellPosition(position)}
                  scale={layout.pieceScale}
                  userData={{ boardId, position, piece }}
                >
                  <TowerMesh
                    piece={piece}
                    slot={piece.ownerSlot}
                    hovered={pieceInteractive && isPieceHovered}
                    selected={isSelected}
                    onPointerDown={
                      pieceInteractive
                        ? (event) =>
                            onPieceDragStart(event, boardId, position, piece)
                        : undefined
                    }
                    onPointerOver={
                      pieceInteractive && !drag
                        ? (event) => {
                            event.stopPropagation();
                            onPieceHover(currentPieceKey);
                          }
                        : undefined
                    }
                    onPointerOut={
                      pieceInteractive
                        ? (event) => {
                            event.stopPropagation();
                            onPieceHover(null);
                          }
                        : undefined
                    }
                  />
                </group>
              )}
            </group>
          );
        }),
      )}
      {ghostPiece && hoveredCell?.boardId === boardId && (
        <group position={cellPosition(hoveredCell.position)}>
          <TowerMesh
            piece={
              ghostPiece.kind === "reserve" ? ghostPiece.tower : ghostPiece.piece
            }
            slot={
              ghostPiece.kind === "reserve"
                ? ghostPiece.slot
                : ghostPiece.piece.ownerSlot
            }
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
  selectedTower,
  hoveredPieceKey,
  onPieceHover,
  onReserveDragStart,
}: {
  slot: PlayerSlot;
  perspectiveSlot: PlayerSlot;
  reserves: TowerSpec[];
  active: boolean;
  interactive: boolean;
  selectedTower: TowerSpec | null;
  hoveredPieceKey: string | null;
  onPieceHover: (pieceKey: string | null) => void;
  onReserveDragStart: (
    event: ThreeEvent<PointerEvent>,
    tower: TowerSpec,
    slot: PlayerSlot,
  ) => void;
}) {
  const base = playerHandPosition(slot, perspectiveSlot);
  const accent = SLOT_ACCENTS[slot];
  const handPieces = useMemo(() => reserveHandPieces(reserves), [reserves]);

  return (
    <group position={base}>
      <mesh receiveShadow>
        <boxGeometry
          args={[
            TABLE_ACCESSORY_SIZES.reserveHand.width,
            0.08,
            TABLE_ACCESSORY_SIZES.reserveHand.trayDepth,
          ]}
        />
        <meshStandardMaterial
          color={active ? "#2b2111" : "#18120d"}
          emissive={active ? accent : "#000000"}
          emissiveIntensity={active ? 0.1 : 0}
          roughness={0.72}
        />
      </mesh>
      <Text
        position={[0, 0.13, -0.66]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.13}
        color={active ? accent : "#9b8c76"}
        anchorX="center"
        anchorY="middle"
      >
        {active ? "active hand" : "hand"}
      </Text>
      {[-0.54, 0.54].map((x) => (
        <mesh key={x} position={[x, 0.052, 0.05]}>
          <boxGeometry args={[0.025, 0.018, 0.82]} />
          <meshBasicMaterial color="#d9bb62" transparent opacity={0.26} />
        </mesh>
      ))}
      {handPieces.map(({ tower, sourceIndex, position, scale }) => {
        const currentPieceKey = reservePieceKey(slot, tower, sourceIndex);
        const isHovered = hoveredPieceKey === currentPieceKey;
        const isSelected =
          selectedTower !== null && sameTower(selectedTower, tower);

        return (
          <group
            key={`${towerKey(tower)}-${sourceIndex}`}
            position={position}
            scale={scale}
            onPointerDown={
              interactive
                ? (event) => onReserveDragStart(event, tower, slot)
                : undefined
            }
            onPointerOver={
              interactive
                ? (event) => {
                    event.stopPropagation();
                    onPieceHover(currentPieceKey);
                  }
                : undefined
            }
            onPointerOut={
              interactive
                ? (event) => {
                    event.stopPropagation();
                    onPieceHover(null);
                  }
                : undefined
            }
          >
            <mesh position={[0, 0.04, 0]}>
              <cylinderGeometry args={[0.34, 0.34, 0.08, tower.sides]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <TowerMesh
              piece={tower}
              slot={slot}
              hovered={interactive && isHovered}
              selected={isSelected}
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
        <boxGeometry
          args={[
            TABLE_ACCESSORY_SIZES.captureRack.width,
            0.07,
            TABLE_ACCESSORY_SIZES.captureRack.depth,
          ]}
        />
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
  selectedReserveTower = null,
  pending = false,
  statusText = "Talat table",
  boardPiecesInteractive = interactive,
  onReserveDrop,
  onReserveSelect,
  onPieceDrop,
  onPieceSelect,
  onCellTap,
}: GameTableCanvasProps) {
  const [drag, setDrag] = useState<DragIntent | null>(null);
  const [hoveredCell, setHoveredCell] = useState<HoveredCell | null>(null);
  const [hoveredPieceKey, setHoveredPieceKey] = useState<string | null>(null);
  const committedDropRef = useRef(false);
  const activePointerRef = useRef<ActivePointer | null>(null);
  const perspectiveSlot = controlSlot ?? 0;
  const includeReserveHand = controlSlot !== null && setupReserves.length > 0;
  const boardRenderOrder = useMemo(
    () => boardRenderOrderForPerspective(perspectiveSlot),
    [perspectiveSlot],
  );
  const woodTexture = useMemo(() => makeWoodTexture(), []);
  const selectedGhost = useMemo<DragIntent | null>(() => {
    if (selectedReserveTower && controlSlot !== null) {
      return { kind: "reserve", tower: selectedReserveTower, slot: controlSlot };
    }

    if (!selected) return null;

    const piece =
      boards[selected.boardId][selected.position.row][selected.position.col];
    if (!piece) return null;

    return {
      kind: "piece",
      boardId: selected.boardId,
      position: selected.position,
      piece,
    };
  }, [boards, controlSlot, selected, selectedReserveTower]);
  const ghostPiece = drag ?? selectedGhost;
  const hoverPreviewEnabled = interactive && ghostPiece !== null;
  const activeHoveredCell = ghostPiece ? hoveredCell : null;
  const focusedBoardId = selected?.boardId ?? activeHoveredCell?.boardId ?? null;

  const commitDrop = useCallback(
    (cell = hoveredCell) => {
      if (committedDropRef.current) return;

      if (!drag || !cell) {
        setDrag(null);
        setHoveredCell(null);
        return;
      }

      committedDropRef.current = true;
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

  const beginPointerAction = useCallback((event: ThreeEvent<PointerEvent>) => {
    activePointerRef.current = {
      pointerId: event.pointerId,
      startX: event.nativeEvent.clientX,
      startY: event.nativeEvent.clientY,
      moved: false,
    };
  }, []);

  const markPointerMove = useCallback((event: ThreeEvent<PointerEvent>) => {
    const activePointer = activePointerRef.current;
    if (!activePointer || activePointer.pointerId !== event.pointerId) return;

    const deltaX = event.nativeEvent.clientX - activePointer.startX;
    const deltaY = event.nativeEvent.clientY - activePointer.startY;
    if (Math.hypot(deltaX, deltaY) >= TAP_MOVE_THRESHOLD) {
      activePointer.moved = true;
    }
  }, []);

  const endPointerDrag = useCallback(
    (event: ThreeEvent<PointerEvent>, cell: HoveredCell | null) => {
      const wasTap =
        activePointerRef.current?.pointerId === event.pointerId &&
        !activePointerRef.current.moved;
      activePointerRef.current = null;

      if (wasTap) {
        setDrag(null);
        setHoveredCell(null);
        return;
      }

      commitDrop(cell);
    },
    [commitDrop],
  );

  const startCapture = useCallback((event: ThreeEvent<PointerEvent>) => {
    const target = event.target as Element;
    if ("setPointerCapture" in target) {
      target.setPointerCapture(event.pointerId);
    }
  }, []);

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-md bg-[#130d09]"
      style={{
        cursor: drag
          ? "grabbing"
          : hoveredPieceKey
            ? "pointer"
            : interactive
              ? "default"
              : "auto",
      }}
    >
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
          includeReserveHand={includeReserveHand}
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
            if (!drag && !hoverPreviewEnabled) return;
            if (drag) {
              markPointerMove(event);
            }
            setHoveredCell(readCellFromEvent(event));
          }}
          onPointerUp={(event) => {
            if (!drag) return;
            const cell = readCellFromEvent(event);
            endPointerDrag(event, cell);
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
              hoveredPieceKey={hoveredPieceKey}
              hoveredCell={activeHoveredCell}
              drag={drag}
              ghostPiece={ghostPiece}
              interactive={interactive}
              hoverPreviewEnabled={hoverPreviewEnabled}
              boardPiecesInteractive={boardPiecesInteractive}
              controlSlot={controlSlot}
              focusedBoardId={focusedBoardId}
              perspectiveSlot={perspectiveSlot}
              onHover={setHoveredCell}
              onPieceHover={setHoveredPieceKey}
              onDragMove={(event, cell) => {
                markPointerMove(event);
                setHoveredCell(cell);
              }}
              onDragEnd={endPointerDrag}
              onCellTap={(tapBoardId, position, piece) => {
                onCellTap?.(tapBoardId, position, piece);
              }}
              onPieceDragStart={(event, dragBoardId, position, piece) => {
                event.stopPropagation();
                if (!interactive) return;
                startCapture(event);
                beginPointerAction(event);
                committedDropRef.current = false;
                onPieceSelect?.(dragBoardId, position, piece);
                setHoveredPieceKey(null);
                setDrag({
                  kind: "piece",
                  boardId: dragBoardId,
                  position,
                  piece,
                });
              }}
            />
          ))}
          {includeReserveHand && (
            <ReserveHand
              slot={controlSlot ?? perspectiveSlot}
              perspectiveSlot={perspectiveSlot}
              reserves={setupReserves}
              active={interactive}
              interactive={interactive}
              selectedTower={selectedReserveTower}
              hoveredPieceKey={hoveredPieceKey}
              onPieceHover={setHoveredPieceKey}
              onReserveDragStart={(event, tower, slot) => {
                event.stopPropagation();
                startCapture(event);
                beginPointerAction(event);
                committedDropRef.current = false;
                onReserveSelect?.(tower);
                setHoveredPieceKey(null);
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
