import { useId } from "react";
import type { PlacedTower, PlayerSlot, TowerSpec } from "@/lib/game/types";

const SLOT_STYLES: Record<
  PlayerSlot,
  { fill: string; stroke: string; label: string }
> = {
  0: { fill: "#1a1a1a", stroke: "#c9a227", label: "Black" },
  1: { fill: "#f5f5f5", stroke: "#888", label: "White" },
  2: { fill: "#6b7280", stroke: "#c9a227", label: "Grey" },
};

function strokeWidth(
  height: TowerSpec["height"],
  displaySize: "sm" | "md" | "lg",
): number {
  const widths = height === 1 ? 2.5 : height === 2 ? 5 : 8;
  if (displaySize === "sm") return widths * 0.72;
  if (displaySize === "lg") return widths * 1.08;
  return widths;
}

function heightLabel(height: TowerSpec["height"]): string {
  return height === 1 ? "small" : height === 2 ? "medium" : "large";
}

function streakColor(slot: PlayerSlot): string {
  if (slot === 1) return "#3a3124";
  return "#f0cf67";
}

function ShapeSilhouette({
  sides,
  size,
  fill,
  stroke,
  strokeWidth,
}: {
  sides: TowerSpec["sides"];
  size: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
}) {
  const inset = strokeWidth / 2 + 2;
  if (sides === 3) {
    return (
      <polygon
        points={`${size / 2},${inset} ${size - inset},${size - inset} ${inset},${size - inset}`}
        fill={fill}
        stroke={stroke}
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    );
  }
  if (sides === 4) {
    return (
      <rect
        x={inset}
        y={inset}
        width={size - inset * 2}
        height={size - inset * 2}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  }
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - inset;
  const points = Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(" ");
  return (
    <polygon
      points={points}
      fill={fill}
      stroke={stroke}
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
    />
  );
}

function HeightStreaks({
  clipPathId,
  color,
  height,
  size,
}: {
  clipPathId: string;
  color: string;
  height: TowerSpec["height"];
  size: number;
}) {
  const streaks = [
    { fromY: 0.84, toY: 0.61, opacity: 0.78 },
    { fromY: 0.63, toY: 0.4, opacity: 0.52 },
    { fromY: 0.42, toY: 0.2, opacity: 0.3 },
  ].slice(0, height);
  const strokeWidth = Math.max(1.5, size * 0.055);
  const laneOffsets = [-0.16, 0.16];

  return (
    <g clipPath={`url(#${clipPathId})`} aria-hidden="true">
      {streaks.flatMap((streak, streakIndex) =>
        laneOffsets.map((offset, laneIndex) => {
          const x = size * (0.5 + offset);
          const fromY = size * streak.fromY;
          const toY = size * streak.toY;
          const lean = size * (offset < 0 ? -0.026 : 0.026);

          return (
            <path
              key={`${streakIndex}-${laneIndex}`}
              d={`M ${x} ${fromY} C ${x + lean} ${fromY - size * 0.06} ${
                x + lean
              } ${toY + size * 0.06} ${x + lean * 1.6} ${toY}`}
              fill="none"
              stroke={color}
              strokeLinecap="round"
              strokeWidth={strokeWidth}
              opacity={streak.opacity}
            />
          );
        }),
      )}
    </g>
  );
}

type TowerPieceProps = {
  tower: TowerSpec | PlacedTower;
  slot?: PlayerSlot;
  size?: "sm" | "md" | "lg";
  physical?: boolean;
};

export function TowerPiece({
  tower,
  slot,
  size = "md",
  physical = false,
}: TowerPieceProps) {
  const clipPathSeed = useId().replace(/:/g, "");
  const clipPathId = `${clipPathSeed}-tower-shape`;
  const ownerSlot =
    "ownerSlot" in tower ? (tower.ownerSlot as PlayerSlot) : slot ?? 0;
  const style = SLOT_STYLES[ownerSlot];
  const canvasSize = size === "sm" ? 36 : size === "lg" ? 64 : 52;
  const shapeStrokeWidth = strokeWidth(tower.height, size);
  const shadowY = canvasSize - 5;
  const topInset = Math.max(6, canvasSize * 0.2);
  const topSize = canvasSize - topInset * 2;
  const showContrastTop = ownerSlot === 0;

  return (
    <svg
      width={canvasSize}
      height={canvasSize}
      viewBox={`0 0 ${canvasSize} ${canvasSize}`}
      className={physical ? "mx-auto drop-shadow-[0_8px_5px_rgba(0,0,0,0.38)]" : "mx-auto"}
      aria-label={`${style.label} ${heightLabel(tower.height)} ${tower.sides}-sided piece`}
    >
      {physical && (
        <ellipse
          cx={canvasSize / 2}
          cy={shadowY}
          rx={canvasSize * 0.28}
          ry={canvasSize * 0.08}
          fill="rgba(0,0,0,0.34)"
        />
      )}
      {physical && (
        <g transform={`translate(0 ${Math.max(2, shapeStrokeWidth * 0.32)})`}>
          <ShapeSilhouette
            sides={tower.sides}
            size={canvasSize}
            fill="#0d0b08"
            stroke="#0d0b08"
            strokeWidth={shapeStrokeWidth}
          />
        </g>
      )}
      <clipPath id={clipPathId}>
        <ShapeSilhouette
          sides={tower.sides}
          size={canvasSize}
          fill="white"
          stroke="none"
          strokeWidth={shapeStrokeWidth}
        />
      </clipPath>
      <ShapeSilhouette
        sides={tower.sides}
        size={canvasSize}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={shapeStrokeWidth}
      />
      {showContrastTop && topSize > 0 && (
        <g transform={`translate(${topInset} ${topInset})`}>
          <ShapeSilhouette
            sides={tower.sides}
            size={topSize}
            fill="#f8f4e8"
            stroke="#f8f4e8"
            strokeWidth={Math.max(1, shapeStrokeWidth * 0.28)}
          />
        </g>
      )}
      <HeightStreaks
        clipPathId={clipPathId}
        color={streakColor(ownerSlot)}
        height={tower.height}
        size={canvasSize}
      />
    </svg>
  );
}

export function slotColor(slot: PlayerSlot): string {
  return SLOT_STYLES[slot].fill;
}

export function slotLabel(slot: PlayerSlot): string {
  return SLOT_STYLES[slot].label;
}

export function towerLabel(tower: TowerSpec): string {
  const h = tower.height === 1 ? "S" : tower.height === 2 ? "M" : "L";
  return `${h}${tower.sides}`;
}
