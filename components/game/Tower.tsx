import type { PlacedTower, PlayerSlot, TowerSpec } from "@/lib/game/types";

const SLOT_STYLES: Record<
  PlayerSlot,
  { fill: string; stroke: string; label: string }
> = {
  0: { fill: "#1a1a1a", stroke: "#c9a227", label: "Black" },
  1: { fill: "#f5f5f5", stroke: "#888", label: "White" },
  2: { fill: "#6b7280", stroke: "#c9a227", label: "Grey" },
};

function heightPx(height: TowerSpec["height"]): number {
  return height === 1 ? 14 : height === 2 ? 20 : 26;
}

function ShapeIcon({ sides, size }: { sides: TowerSpec["sides"]; size: number }) {
  if (sides === 3) {
    return (
      <polygon
        points={`${size / 2},2 ${size - 2},${size - 2} 2,${size - 2}`}
        fill="currentColor"
      />
    );
  }
  if (sides === 4) {
    return (
      <rect x="2" y="2" width={size - 4} height={size - 4} fill="currentColor" />
    );
  }
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 2;
  const points = Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(" ");
  return <polygon points={points} fill="currentColor" />;
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
  const h = heightPx(tower.height);
  const iconSize = size === "sm" ? 12 : 16;
  const width = size === "sm" ? 28 : 36;

  return (
    <svg
      width={width}
      height={h + iconSize + 4}
      viewBox={`0 0 ${width} ${h + iconSize + 4}`}
      className="mx-auto"
      aria-label={`${style.label} ${tower.height === 1 ? "small" : tower.height === 2 ? "medium" : "large"} tower`}
    >
      <rect
        x={(width - 18) / 2}
        y={0}
        width={18}
        height={h}
        rx={2}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={1.5}
      />
      <g
        transform={`translate(${(width - iconSize) / 2}, ${h + 2})`}
        style={{ color: style.stroke }}
      >
        <ShapeIcon sides={tower.sides} size={iconSize} />
      </g>
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
  const s = tower.sides === 3 ? "△" : tower.sides === 4 ? "□" : "⬡";
  return `${h}${s}`;
}
