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
  const ownerSlot =
    "ownerSlot" in tower ? (tower.ownerSlot as PlayerSlot) : slot ?? 0;
  const style = SLOT_STYLES[ownerSlot];
  const canvasSize = size === "sm" ? 36 : size === "lg" ? 64 : 52;
  const shapeStrokeWidth = strokeWidth(tower.height, size);
  const shadowY = canvasSize - 5;

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
      <ShapeSilhouette
        sides={tower.sides}
        size={canvasSize}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={shapeStrokeWidth}
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
