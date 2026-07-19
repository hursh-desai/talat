"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FastForward,
  LogIn,
  Plus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { savePlayerSessionByCode } from "@/lib/playerStorage";
import { TowerPiece } from "@/components/game/Tower";
import type { TowerSpec } from "@/lib/game/types";
import { cn } from "@/lib/utils";

const GUIDE_STEPS = [
  {
    title: "The table has three fronts",
    kicker: "Orientation",
    body:
      "You share a board with each opponent. Every turn improves one front while the other two fronts stay tense.",
    prompt: "Watch which board is lit before you act.",
  },
  {
    title: "Place your nine pieces",
    kicker: "Setup",
    body:
      "Pick a piece from your hand, then choose a lit starting-row space. Shape shows sides; line weight shows size.",
    prompt: "One starting space will stay empty.",
  },
  {
    title: "Move from the glow",
    kicker: "Your turn",
    body:
      "The game lights up movable pieces first. After you choose one, it lights every legal destination.",
    prompt: "If nothing is glowing, it is not your turn.",
  },
  {
    title: "Captures are explained",
    kicker: "Scoring",
    body:
      "Captures depend on size and sides. When a capture is legal, the table shows why before the move is sent.",
    prompt: "Win through captures and breakthroughs.",
  },
] as const;

const towerSamples: TowerSpec[] = [
  { height: 1, sides: 3 },
  { height: 2, sides: 4 },
  { height: 3, sides: 6 },
];

export default function HomePage() {
  const router = useRouter();
  const createGame = useMutation(api.games.createGame);
  const joinGame = useMutation(api.games.joinGame);
  const [displayName, setDisplayName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState<"create" | "join" | null>(null);
  const [flow, setFlow] = useState<"learn" | "play">("learn");
  const [guideIndex, setGuideIndex] = useState(0);

  const name = displayName.trim();
  const code = joinCode.trim().toUpperCase();
  const currentGuide = GUIDE_STEPS[guideIndex];
  const canCreate = name.length > 0 && loading === null;
  const canJoin = name.length > 0 && code.length > 0 && loading === null;
  const formHint = useMemo(() => {
    if (!name) return "Enter a display name to unlock table actions.";
    if (!code) return "Create a new table, or enter a code to join one.";
    return `Ready to join table ${code}.`;
  }, [code, name]);

  async function handleCreate() {
    if (!name) {
      toast.error("Enter a display name");
      return;
    }
    setLoading("create");
    try {
      const result = await createGame({ displayName: name });
      savePlayerSessionByCode(
        result.code,
        result.gameId,
        result.playerToken,
        result.slot,
      );
      router.push(`/game/${result.code}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create game");
    } finally {
      setLoading(null);
    }
  }

  async function handleJoin() {
    if (!name) {
      toast.error("Enter a display name");
      return;
    }
    if (!code) {
      toast.error("Enter a game code");
      return;
    }
    setLoading("join");
    try {
      const result = await joinGame({ code, displayName: name });
      savePlayerSessionByCode(
        code,
        result.gameId,
        result.playerToken,
        result.slot,
      );
      router.push(`/game/${code}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to join game");
    } finally {
      setLoading(null);
    }
  }

  function goNextGuide() {
    if (guideIndex === GUIDE_STEPS.length - 1) {
      setFlow("play");
      return;
    }
    setGuideIndex((index) => index + 1);
  }

  return (
    <div className="flex flex-1 flex-col px-3 py-4 sm:px-5 sm:py-7">
      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_360px] lg:items-stretch">
        <section className="min-h-[560px] overflow-hidden rounded-md border border-[#315d58]/40 bg-[#101513] shadow-[0_28px_70px_rgba(0,0,0,0.34)]">
          <div className="flex h-full flex-col">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-5">
              <div>
                <p className="text-xs uppercase text-[#72c7bb]">Talat</p>
                <h1 className="text-2xl font-semibold text-white sm:text-3xl">
                  Learn the table, then play
                </h1>
              </div>
              <Button
                type="button"
                variant="outline"
                className="border-white/15 bg-black/20 text-white hover:border-[#72c7bb]/60"
                onClick={() => setFlow("play")}
              >
                <FastForward />
                Skip tutorial
              </Button>
            </div>

            {flow === "learn" ? (
              <div className="grid flex-1 gap-0 lg:grid-cols-[220px_minmax(0,1fr)]">
                <nav className="border-b border-white/10 bg-black/16 p-3 lg:border-b-0 lg:border-r">
                  <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                    {GUIDE_STEPS.map((step, index) => {
                      const active = index === guideIndex;
                      const complete = index < guideIndex;

                      return (
                        <button
                          key={step.title}
                          type="button"
                          onClick={() => setGuideIndex(index)}
                          className={cn(
                            "flex min-h-14 items-center gap-3 rounded-md border px-3 py-2 text-left transition",
                            active
                              ? "border-[#72c7bb] bg-[#72c7bb]/12 text-white"
                              : "border-white/10 bg-white/[0.03] text-white/58 hover:border-white/25 hover:text-white",
                          )}
                        >
                          <span
                            className={cn(
                              "grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs",
                              complete
                                ? "border-[#72c7bb] bg-[#72c7bb] text-black"
                                : active
                                  ? "border-[#72c7bb] text-[#72c7bb]"
                                  : "border-white/15 text-white/45",
                            )}
                          >
                            {complete ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : (
                              index + 1
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-xs uppercase text-white/38">
                              {step.kicker}
                            </span>
                            <span className="block text-sm font-medium">
                              {step.title}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </nav>

                <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_260px]">
                  <GuideBoard step={guideIndex} />

                  <div className="flex flex-col justify-between gap-5">
                    <div>
                      <p className="text-sm font-medium text-[#72c7bb]">
                        Step {guideIndex + 1} of {GUIDE_STEPS.length}
                      </p>
                      <h2 className="mt-2 text-xl font-semibold text-white">
                        {currentGuide.title}
                      </h2>
                      <p className="mt-3 text-sm leading-6 text-white/68">
                        {currentGuide.body}
                      </p>
                      <div className="mt-4 rounded-md border border-[#c94747]/30 bg-[#2a1414]/45 px-3 py-2 text-sm text-[#ffd0d0]">
                        {currentGuide.prompt}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="border-white/15 bg-black/20 text-white"
                        disabled={guideIndex === 0}
                        onClick={() => setGuideIndex((index) => index - 1)}
                      >
                        <ChevronLeft />
                        Back
                      </Button>
                      <Button
                        type="button"
                        className="bg-[#72c7bb] text-black hover:bg-[#91dbd1]"
                        onClick={goNextGuide}
                      >
                        {guideIndex === GUIDE_STEPS.length - 1
                          ? "Play now"
                          : "Next"}
                        <ChevronRight />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid flex-1 gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="flex min-h-[420px] flex-col justify-between rounded-md border border-white/10 bg-black/20 p-4">
                  <div>
                    <p className="text-sm font-medium text-[#72c7bb]">
                      Ready room
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">
                      Create a table or join one
                    </h2>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-white/62">
                      The game keeps guiding you after this: the lobby tells you
                      who is missing, setup lights valid spaces, and live turns
                      explain legal moves before they are sent.
                    </p>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    <Signal label="1. Name" active={name.length > 0} />
                    <Signal label="2. Table" active />
                    <Signal label="3. Guided turns" active />
                  </div>

                  <GuideBoard step={2} compact />
                </div>

                <PlayPanel
                  displayName={displayName}
                  joinCode={joinCode}
                  loading={loading}
                  formHint={formHint}
                  canCreate={canCreate}
                  canJoin={canJoin}
                  onDisplayNameChange={setDisplayName}
                  onJoinCodeChange={(value) => setJoinCode(value.toUpperCase())}
                  onCreate={handleCreate}
                  onJoin={handleJoin}
                />
              </div>
            )}
          </div>
        </section>

        <aside className="rounded-md border border-white/10 bg-[#171614] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.26)] lg:min-h-[560px]">
          <div className="flex items-center gap-2 text-[#f0cf6a]">
            <Users className="h-4 w-4" />
            <h2 className="font-semibold">What happens next</h2>
          </div>
          <div className="mt-4 space-y-3">
            <Direction
              title="Tutorial is optional"
              text="Read the four steps or skip straight to the ready room."
            />
            <Direction
              title="Lobby gives status"
              text="Hosts see whether the table is full and when solo beta is available."
            />
            <Direction
              title="The board gives feedback"
              text="Glowing pieces, lit destinations, and capture notes show the next legal action."
            />
          </div>
        </aside>
      </main>
    </div>
  );
}

function PlayPanel({
  displayName,
  joinCode,
  loading,
  formHint,
  canCreate,
  canJoin,
  onDisplayNameChange,
  onJoinCodeChange,
  onCreate,
  onJoin,
}: {
  displayName: string;
  joinCode: string;
  loading: "create" | "join" | null;
  formHint: string;
  canCreate: boolean;
  canJoin: boolean;
  onDisplayNameChange: (value: string) => void;
  onJoinCodeChange: (value: string) => void;
  onCreate: () => void;
  onJoin: () => void;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-[#111513] p-4">
      <div>
        <h2 className="text-base font-semibold text-white">Play online</h2>
        <p className="mt-1 text-sm text-white/50">{formHint}</p>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <label className="mb-1 block text-sm text-white/70">
            Display name
          </label>
          <Input
            value={displayName}
            onChange={(e) => onDisplayNameChange(e.target.value)}
            placeholder="Your name"
            className="border-white/20 bg-black/40"
            maxLength={24}
          />
        </div>

        <Button
          className="w-full bg-[#72c7bb] text-black hover:bg-[#91dbd1]"
          disabled={!canCreate}
          onClick={onCreate}
        >
          <Plus />
          {loading === "create" ? "Creating..." : "Create new game"}
        </Button>

        <div className="relative py-1">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-white/10" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-[#111513] px-2 text-white/40">or join</span>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm text-white/70">Game code</label>
          <Input
            value={joinCode}
            onChange={(e) => onJoinCodeChange(e.target.value)}
            placeholder="ABC123"
            className="border-white/20 bg-black/40 font-mono uppercase"
            maxLength={6}
          />
        </div>

        <Button
          variant="outline"
          className="w-full border-[#f0cf6a]/50 bg-[#f0cf6a]/8 text-[#f8e5aa] hover:bg-[#f0cf6a]/14"
          disabled={!canJoin}
          onClick={onJoin}
        >
          <LogIn />
          {loading === "join" ? "Joining..." : "Join game"}
        </Button>
      </div>
    </div>
  );
}

function GuideBoard({
  step,
  compact = false,
}: {
  step: number;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col justify-center rounded-md border border-white/10 bg-[#1d211e] p-3",
        compact ? "mt-6" : "min-h-[360px]",
      )}
    >
      <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-white/45">
        <BoardName label="Black / White" active={step === 0 || step === 2} />
        <BoardName label="White / Grey" active={step === 0 || step === 3} />
        <BoardName label="Black / Grey" active={step === 0 || step === 1} />
      </div>

      <div className="mx-auto mt-4 grid w-full max-w-[360px] grid-cols-5 gap-1 rounded-md border border-black/50 bg-[#17100b] p-2 shadow-[0_18px_36px_rgba(0,0,0,0.34)]">
        {Array.from({ length: 25 }, (_, index) => {
          const row = Math.floor(index / 5);
          const col = index % 5;
          const isStart = row === 0 || row === 4;
          const hasHero =
            (step === 1 && row === 4 && col === 2) ||
            (step !== 1 && row === 2 && col === 2);
          const hasEnemy = step === 3 && row === 2 && col === 3;
          const highlighted =
            (step === 1 && row === 4) ||
            (step === 2 && row === 2 && col === 2) ||
            (step === 2 && row === 1 && col >= 1 && col <= 3) ||
            (step === 3 && row === 2 && col === 3);

          return (
            <div
              key={`${row}-${col}`}
              className={cn(
                "grid aspect-square min-h-10 place-items-center rounded-sm border",
                isStart
                  ? "border-[#b5763c]/55 bg-[#efe8dc]"
                  : "border-[#b5763c]/45 bg-[#d8d2c7]",
                highlighted &&
                  "border-[#72c7bb] bg-[#8bded3] ring-2 ring-[#72c7bb]/50",
              )}
            >
              {hasHero && (
                <TowerPiece
                  tower={step === 3 ? towerSamples[1] : towerSamples[0]}
                  slot={0}
                  size={compact ? "sm" : "md"}
                  physical
                />
              )}
              {hasEnemy && (
                <TowerPiece
                  tower={towerSamples[0]}
                  slot={1}
                  size={compact ? "sm" : "md"}
                  physical
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-center gap-2 text-xs text-white/52">
        <span className="h-2 w-2 rounded-full bg-[#72c7bb]" />
        Lit cells are the next legal thing to consider.
      </div>
    </div>
  );
}

function BoardName({ label, active }: { label: string; active: boolean }) {
  return (
    <div
      className={cn(
        "rounded border px-2 py-1",
        active
          ? "border-[#72c7bb]/50 bg-[#72c7bb]/12 text-[#b8fff6]"
          : "border-white/10 bg-black/20",
      )}
    >
      {label}
    </div>
  );
}

function Signal({ label, active }: { label: string; active: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
        active
          ? "border-[#72c7bb]/50 bg-[#72c7bb]/10 text-[#c6fff8]"
          : "border-white/10 bg-white/[0.03] text-white/45",
      )}
    >
      <CheckCircle2 className="h-4 w-4" />
      {label}
    </div>
  );
}

function Direction({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 p-3">
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="mt-1 text-sm leading-5 text-white/55">{text}</p>
    </div>
  );
}
