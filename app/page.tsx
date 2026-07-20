"use client";

import { useRouter } from "next/navigation";
import { CircleAlert } from "lucide-react";
import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  loadPlayerSessionByCode,
  savePlayerSessionByCode,
} from "@/lib/playerStorage";
import { RulesTutorial } from "@/components/game/RulesTutorial";

type JoinNotice = {
  kind: "already_started";
  code: string;
} | null;

export default function HomePage() {
  const router = useRouter();
  const createGame = useMutation(api.games.createGame);
  const joinGame = useMutation(api.games.joinGame);
  const [displayName, setDisplayName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState<"create" | "join" | null>(null);
  const [joinNotice, setJoinNotice] = useState<JoinNotice>(null);

  async function handleCreate() {
    const name = displayName.trim();
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
    const name = displayName.trim();
    const code = joinCode.trim().toUpperCase();
    setJoinNotice(null);

    if (!code) {
      toast.error("Enter a game code");
      return;
    }

    if (loadPlayerSessionByCode(code)) {
      router.push(`/game/${code}`);
      return;
    }

    if (!name) {
      toast.error("Enter a display name");
      return;
    }

    setLoading("join");
    try {
      const result = await joinGame({ code, displayName: name });
      if (result.status === "already_started") {
        setJoinNotice({ kind: "already_started", code });
        return;
      }

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

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-[#c9a227] sm:text-5xl">
          Talat
        </h1>
        <p className="mt-2 text-lg text-white/60">The Power of Three</p>
        <p className="mt-1 text-sm text-white/40">
          A strategic board game for three players
        </p>
      </div>

      <Card className="w-full max-w-md border-[#c9a227]/30 bg-black/60">
        <CardHeader>
          <CardTitle className="text-white">Play online</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-white/70">
              Display name
            </label>
            <Input
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setJoinNotice(null);
              }}
              placeholder="Your name"
              className="border-white/20 bg-black/40"
              maxLength={24}
            />
          </div>

          <Button
            className="w-full bg-[#c9a227] text-black hover:bg-[#d4b23a]"
            disabled={loading !== null}
            onClick={handleCreate}
          >
            {loading === "create" ? "Creating…" : "Create new game"}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-[#111] px-2 text-white/40">or join</span>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm text-white/70">
              Game code
            </label>
            <Input
              value={joinCode}
              onChange={(e) => {
                setJoinCode(e.target.value.toUpperCase());
                setJoinNotice(null);
              }}
              placeholder="ABC123"
              className="border-white/20 bg-black/40 font-mono uppercase"
              maxLength={6}
            />
          </div>

          {joinNotice?.kind === "already_started" && (
            <div
              role="alert"
              className="flex gap-2 rounded-md border border-[#d9bb62]/40 bg-[#d9bb62]/10 p-3 text-sm text-white"
            >
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#f3d777]" />
              <div>
                <p className="font-medium text-[#f3d777]">
                  Game {joinNotice.code} is already in play
                </p>
                <p className="mt-1 text-white/65">
                  New players can only join before the host starts the game.
                  Ask for a fresh code to take a seat.
                </p>
              </div>
            </div>
          )}

          <Button
            variant="outline"
            className="w-full border-[#c9a227]/50"
            disabled={loading !== null}
            onClick={handleJoin}
          >
            {loading === "join" ? "Joining…" : "Join game"}
          </Button>
        </CardContent>
      </Card>

      <RulesTutorial />
    </div>
  );
}
