"use client";

import { useMemo, useState } from "react";
import { Flag, Footprints, Swords, Trophy } from "lucide-react";
import { TowerPiece } from "./Tower";
import type { TowerSpec } from "@/lib/game/types";
import { cn } from "@/lib/utils";

const TABS = [
  {
    id: "place",
    label: "Place",
    icon: Flag,
    headline: "Choose a front for each piece.",
    body:
      "During setup, pick a piece, then click a highlighted starting-row space on one of your two boards. You have nine pieces and ten starting spaces, so one space stays empty.",
  },
  {
    id: "move",
    label: "Move",
    icon: Footprints,
    headline: "Move one piece, on one board.",
    body:
      "On your turn, click one of your highlighted pieces. Empty moves go one square forward or diagonally forward. The app then highlights every legal destination.",
  },
  {
    id: "capture",
    label: "Capture",
    icon: Swords,
    headline: "Capture only when the matchup works.",
    body:
      "A capture can go forward, diagonally forward, or sideways onto an adjacent enemy piece. The game explains each legal capture before you commit it.",
  },
  {
    id: "score",
    label: "Score",
    icon: Trophy,
    headline: "Win by captures and breakthroughs.",
    body:
      "Captured pieces are worth 5 points. Your pieces on an opponent's starting row are worth 3 points. The game ends after two boards can never produce another capture.",
  },
] as const;

type TutorialTab = (typeof TABS)[number]["id"];

const towerSamples: TowerSpec[] = [
  { height: 1, sides: 3 },
  { height: 2, sides: 4 },
  { height: 3, sides: 6 },
];

export function RulesTutorial() {
  const [active, setActive] = useState<TutorialTab>("place");
  const current = useMemo(
    () => TABS.find((tab) => tab.id === active) ?? TABS[0],
    [active],
  );
  const Icon = current.icon;

  return (
    <section className="mx-auto mt-10 w-full max-w-5xl rounded-lg border border-white/10 bg-[#151817] p-4 sm:p-5">
      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-white">
              Learn Talat in one minute
            </h2>
            <p className="mt-1 text-sm text-white/55">
              You are fighting two opponents at once. Every turn helps one front
              and leaves the other front waiting.
            </p>
          </div>

          <FrontMap />

          <div className="grid grid-cols-2 gap-2">
            {TABS.map((tab) => {
              const TabIcon = tab.icon;
              const selected = tab.id === active;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActive(tab.id)}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                    selected
                      ? "border-[#c9a227] bg-[#c9a227] text-black"
                      : "border-white/10 bg-black/25 text-white/65 hover:border-[#c9a227]/50 hover:text-white",
                  )}
                >
                  <TabIcon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
          <TutorialBoard mode={active} />

          <div className="space-y-4">
            <div className="rounded-lg border border-white/10 bg-black/20 p-4">
              <div className="flex items-center gap-2 text-[#c9a227]">
                <Icon className="h-5 w-5" />
                <h3 className="font-semibold">{current.headline}</h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-white/70">
                {current.body}
              </p>
            </div>

            {active === "capture" ? <CaptureMatchups /> : <TowerSet />}
          </div>
        </div>
      </div>
    </section>
  );
}

function FrontMap() {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="grid grid-cols-3 items-center gap-2 text-center text-xs text-white/55">
        <div />
        <PlayerPip label="White" tone="light" />
        <div />
        <BoardPill label="Black / White" />
        <div className="text-[#c9a227]">3 boards</div>
        <BoardPill label="White / Grey" />
        <PlayerPip label="Black" tone="dark" />
        <BoardPill label="Black / Grey" />
        <PlayerPip label="Grey" tone="grey" />
      </div>
    </div>
  );
}

function PlayerPip({
  label,
  tone,
}: {
  label: string;
  tone: "dark" | "light" | "grey";
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className={cn(
          "h-5 w-5 rounded-full border",
          tone === "dark" && "border-[#c9a227] bg-[#111]",
          tone === "light" && "border-white/60 bg-white",
          tone === "grey" && "border-[#c9a227]/70 bg-slate-500",
        )}
      />
      <span>{label}</span>
    </div>
  );
}

function BoardPill({ label }: { label: string }) {
  return (
    <div className="rounded border border-[#c9a227]/30 bg-[#c9a227]/10 px-2 py-2 text-[11px] text-white/70">
      {label}
    </div>
  );
}

function TowerSet() {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-4">
      <p className="text-xs uppercase text-white/40">Your nine pieces</p>
      <div className="mt-3 grid grid-cols-3 gap-3">
        {towerSamples.map((tower) => (
          <div
            key={`${tower.height}-${tower.sides}`}
            className="flex flex-col items-center rounded-md border border-white/10 bg-white/[0.03] p-2"
          >
            <TowerPiece tower={tower} slot={0} size="sm" />
            <span className="mt-2 text-xs text-white/55">
              {tower.height === 1
                ? "Small"
                : tower.height === 2
                  ? "Medium"
                  : "Large"}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-white/45">
        Shape shows sides. Line weight shows size.
      </p>
    </div>
  );
}

function CaptureMatchups() {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-4">
      <p className="text-xs uppercase text-white/40">Capture shortcuts</p>
      <div className="mt-3 space-y-2 text-sm text-white/70">
        <RuleLine label="Size" text="Large beats Medium. Medium beats Small." />
        <RuleLine label="Sides" text="At equal size, more sides wins." />
        <RuleLine label="Twist" text="Small 3-sided beats Large 6-sided." />
      </div>
    </div>
  );
}

function RuleLine({ label, text }: { label: string; text: string }) {
  return (
    <div className="grid grid-cols-[70px_minmax(0,1fr)] gap-3 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
      <span className="text-[#c9a227]">{label}</span>
      <span>{text}</span>
    </div>
  );
}

function TutorialBoard({ mode }: { mode: TutorialTab }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-5 gap-0.5 rounded-lg border border-[#c9a227]/30 bg-black/35 p-1">
        {Array.from({ length: 25 }, (_, index) => {
          const row = Math.floor(index / 5);
          const col = index % 5;
          const start = row === 0 || row === 4;
          const piece =
            (mode === "place" && row === 0 && col === 2) ||
            (mode !== "place" && row === 2 && col === 2);
          const enemy = mode === "capture" && row === 2 && col === 3;
          const highlight =
            (mode === "place" && row === 0) ||
            (mode === "move" && row === 3 && col >= 1 && col <= 3) ||
            (mode === "capture" && row === 2 && col === 3) ||
            (mode === "score" && row === 4);

          return (
            <div
              key={`${row}-${col}`}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-sm border",
                start ? "bg-white/10" : "bg-white/5",
                highlight
                  ? "border-[#c9a227] bg-[#c9a227]/20"
                  : "border-white/10",
              )}
            >
              {piece && (
                <TowerPiece
                  tower={mode === "capture" ? towerSamples[1] : towerSamples[0]}
                  slot={0}
                  size="sm"
                />
              )}
              {enemy && <TowerPiece tower={towerSamples[0]} slot={1} size="sm" />}
            </div>
          );
        })}
      </div>
      <p className="text-center text-xs text-white/45">
        Gold cells are the cells the app asks you to consider.
      </p>
    </div>
  );
}
