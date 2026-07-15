import type { PlacedTower, PlayerSlot, TowerSpec } from "@/lib/game/types";

const SLOT_STYLES: Record<
  PlayerSlot,
  { fill: string; stroke: string; text: string; label: string }
> = {
  0: { fill: "#1a1a1a", stroke: "#c9a227", text: "#f8e7a3", label: "Black" },
  1: { fill: "#f5f5f5", stroke: "#888", text: "#171717", label: "White" },
  2: { fill: "#6b7280", stroke: "#c9a227", text: "#ffffff", label: "Grey" },
};

function shapeSize(height: TowerSpec["height"], displaySize: "sm" | "md"): number {
  if (displaySize === "sm") {
    return height === 1 ? 20 : height === 2 ? 26 : 32;
  }
  return height === 1 ? 28 : height === 2 ? 36 : 44;
}

function heightLabel(height: TowerSpec["height"]): string {
  return height === 1 ? "small" : height === 2 ? "medium" : "large";
}

function ShapeSilhouette({
  sides,
  size,
  fill,
  stroke,
}: {
  sides: TowerSpec["sides"];
  size: number;
  fill: string;
  stroke: string;
}) {
  if (sides === 3) {
    return (
      <polygon
        points={`${size / 2},2 ${size - 2},${size - 3} 2,${size - 3}`}
        fill={fill}
        stroke={stroke}
        strokeLinejoin="round"
        strokeWidth={2}
      />
    );
  }
  if (sides === 4) {
    return (
      <rect
        x="3"
        y="3"
        width={size - 6}
        height={size - 6}
        fill={fill}
        stroke={stroke}
        strokeWidth={2}
      />
    );
  }
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 3;
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
      strokeWidth={2}
    />
  );
}

type TowerPieceProps = {
  tower: TowerSpec | PlacedTower;
  slot?: PlayerSlot;
  size?: "sm" | "md";
};

export function TowerPiece({ tower, slot, size = "md" }: TowerPieceProps) {
  const ownerSlot =
    "ownerSlot" in tower ? (tower.ownerSlot as PlayerSlot) : slot ?? 0;
  const style = SLOT_STYLES[ownerSlot];
  const canvasSize = size === "sm" ? 36 : 52;
  const silhouetteSize = shapeSize(tower.height, size);
  const offset = (canvasSize - silhouetteSize) / 2;
  const fontSize = size === "sm" ? 11 : 14;

  return (
    <svg
      width={canvasSize}
      height={canvasSize}
      viewBox={`0 0 ${canvasSize} ${canvasSize}`}
      className="mx-auto"
      aria-label={`${style.label} ${heightLabel(tower.height)} ${tower.sides}-sided piece`}
    >
      <g transform={`translate(${offset}, ${offset})`}>
        <ShapeSilhouette
          sides={tower.sides}
          size={silhouetteSize}
          fill={style.fill}
          stroke={style.stroke}
        />
      </g>
      <text
        x={canvasSize / 2}
        y={canvasSize / 2 + fontSize * 0.34}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight={800}
        fill={style.text}
        stroke={ownerSlot === 1 ? "transparent" : "rgba(0,0,0,0.45)"}
        strokeWidth={ownerSlot === 1 ? 0 : 0.75}
        paintOrder="stroke"
      >
        {tower.sides}
      </text>
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
