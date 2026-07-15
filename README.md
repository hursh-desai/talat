# Talat — The Power of Three

Online multiplayer implementation of **Talat**, the strategic three-player board game by Bruce Whitehill (HUCH! & friends, 2011).

Built with **Next.js** (Vercel) and **Convex** for real-time multiplayer sync.

## Features

- 3-player online games via shareable invite links
- Anonymous play with display names (no sign-in required)
- Full rules engine: setup, movement, capture hierarchy, frozen boards, scoring
- Real-time board updates across all players
- Rulebook-aware future freeze detection with board-local reachability search
- Event feed and replay snapshots backed by Convex game events
- Capture hints that explain why a selected matchup is legal
- Same-seat rematch for finished games
- In-app rules tutorial for deployment, movement, captures, and scoring
- Dark/gold UI inspired by the rulebook

## Quick start

### Prerequisites

- Node.js 18+
- npm

### Local development

1. Install dependencies:

```bash
npm install
```

2. Start Convex (in one terminal):

```bash
npx convex dev
```

This creates/updates `.env.local` with `NEXT_PUBLIC_CONVEX_URL`.

3. Start Next.js (in another terminal):

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000)

### How to play online

1. **Player 1** creates a game and shares the invite link
2. **Players 2 & 3** open the link (or enter the 6-character code on the home page)
3. Host clicks **Start game** when all 3 seats are filled
4. **Setup:** take turns placing your 9 towers on starting rows
5. **Play:** move one tower per turn on any non-frozen board
6. Use the event feed to review previous positions while waiting
7. Game ends when **2 of 3 boards are frozen** — highest score wins

## Game rules (summary)

### Towers

Each player has 9 unique towers combining:
- **Heights:** Small, Medium, Large
- **Shapes:** Triangle (3), Square (4), Hexagon (6)

### Movement

- Move one space **forward** or **forward-diagonal** toward the opponent's side
- No backward or horizontal moves (except sideways captures on the opponent's starting line)
- Cannot jump over other towers

### Capturing

- **Size:** Large → Medium, Medium → Small (exactly one level)
- **Same height:** more sides beats fewer (Hexagon > Square > Triangle)
- **David & Goliath:** Small Triangle captures Large Hexagon
- Capturing is optional

### Scoring

- **5 points** per captured tower
- **3 points** per tower on the opponent's starting line at game end
- Tie-breaker: highest-rank capture wins; full tie = draw

### Frozen boards

A board freezes when no captures are theoretically possible. The game ends when 2 of 3 boards freeze.

## Project structure

```
app/                  Next.js App Router pages
components/game/      Board UI, towers, lobby, scoreboard
convex/               Convex schema, mutations, queries
lib/game/             Pure TypeScript rules engine (+ Vitest tests)
lib/playerStorage.ts  localStorage session for anonymous players
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npx convex dev` | Start Convex dev backend |
| `npm run build` | Production build |
| `npm test` | Run rules engine unit tests |
| `npx convex deploy` | Deploy Convex to production |

## Deployment

### Convex (production backend)

```bash
npx convex login
npx convex deploy
```

Copy the production `NEXT_PUBLIC_CONVEX_URL` from the Convex dashboard.

### Vercel (frontend)

1. Push to GitHub and import the repo in Vercel
2. Set environment variable: `NEXT_PUBLIC_CONVEX_URL` = your Convex production URL
3. Deploy

## Testing

```bash
npm test
```

Unit tests cover capture rules, movement, setup flow, future-reachability frozen-board detection, server-authoritative move validation, and tie-breaker scoring.

## License

This is an unofficial fan implementation for educational purposes. Talat is © Bruce Whitehill / Hutter Trade GmbH + Co KG.
