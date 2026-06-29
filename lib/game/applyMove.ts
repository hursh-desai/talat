import { computeFrozenBoards } from "./frozen";
import { getValidMovesForPiece, applyMoveToBoard } from "./movement";
import { determineWinner, highestCaptureRank, scoreForSlot } from "./scoring";
import {
  applySetupPlacement,
  isSetupComplete,
  isValidSetupPlacement,
  setupTurnSlot,
} from "./setup";
import type {
  BoardId,
  GameBoardState,
  LastMove,
  MoveAction,
  PlacedTower,
  PlayerSlot,
  SetupAction,
} from "./types";
import { boardsForSlot, createInitialBoardState } from "./types";
import { startingRow } from "./geometry";

export type PlayState = {
  boardState: GameBoardState;
  phase: "setup" | "play";
  currentTurnSlot: PlayerSlot;
  setupTurnIndex: number;
  frozenBoards: boolean[];
  scores: number[];
  capturedBySlot: PlacedTower[][];
  highestCaptureRankBySlot: number[];
  lastMove: LastMove | null;
  winnerSlot: PlayerSlot | null;
  status: "setup" | "playing" | "finished";
};

const BOARD_IDS: BoardId[] = ["board01", "board02", "board12"];

export function createPlayStateFromWaiting(): PlayState {
  return {
    boardState: createInitialBoardState(),
    phase: "setup",
    currentTurnSlot: 0,
    setupTurnIndex: 0,
    frozenBoards: [false, false, false],
    scores: [0, 0, 0],
    capturedBySlot: [[], [], []],
    highestCaptureRankBySlot: [0, 0, 0],
    lastMove: null,
    winnerSlot: null,
    status: "setup",
  };
}

export function applySetupMove(
  state: PlayState,
  slot: PlayerSlot,
  action: SetupAction,
): PlayState {
  if (state.status !== "setup") {
    throw new Error("Not in setup phase");
  }
  if (setupTurnSlot(state.setupTurnIndex) !== slot) {
    throw new Error("Not your turn");
  }

  const nextBoardState = applySetupPlacement(state.boardState, slot, action);
  const nextSetupIndex = state.setupTurnIndex + 1;

  const lastMove: LastMove = {
    kind: "setup",
    boardId: action.boardId,
    position: action.position,
    tower: action.tower,
    slot,
  };

  if (!isSetupComplete(nextBoardState)) {
    return {
      ...state,
      boardState: nextBoardState,
      setupTurnIndex: nextSetupIndex,
      currentTurnSlot: setupTurnSlot(nextSetupIndex),
      lastMove,
    };
  }

  return {
    ...state,
    boardState: nextBoardState,
    setupTurnIndex: nextSetupIndex,
    phase: "play",
    status: "playing",
    currentTurnSlot: slot,
    frozenBoards: computeFrozenBoards(nextBoardState.boards),
    lastMove,
  };
}

export function applyPlayMove(
  state: PlayState,
  slot: PlayerSlot,
  action: MoveAction,
): PlayState {
  if (state.status !== "playing") {
    throw new Error("Not in play phase");
  }
  if (state.currentTurnSlot !== slot) {
    throw new Error("Not your turn");
  }

  const boardIndex = BOARD_IDS.indexOf(action.boardId);
  if (state.frozenBoards[boardIndex]) {
    throw new Error("Board is frozen");
  }

  const board = state.boardState.boards[action.boardId];
  const { board: nextBoard, captured } = applyMoveToBoard(board, action);

  const nextBoardState: GameBoardState = {
    ...state.boardState,
    boards: {
      ...state.boardState.boards,
      [action.boardId]: nextBoard,
    },
  };

  const capturedBySlot = state.capturedBySlot.map((list) => [...list]);
  const highestCaptureRankBySlot = [...state.highestCaptureRankBySlot];

  if (captured) {
    capturedBySlot[slot].push(captured);
    highestCaptureRankBySlot[slot] = highestCaptureRank(capturedBySlot[slot]);
  }

  const frozenBoards = computeFrozenBoards(nextBoardState.boards);
  const scores = ([0, 1, 2] as PlayerSlot[]).map((s) =>
    scoreForSlot(nextBoardState, s, capturedBySlot[s]).total,
  );

  const frozenCount = frozenBoards.filter(Boolean).length;
  const isFinished = frozenCount >= 2;

  const winnerSlot = isFinished
    ? determineWinner(scores, highestCaptureRankBySlot)
    : null;

  const nextTurn = ((slot + 1) % 3) as PlayerSlot;

  return {
    ...state,
    boardState: nextBoardState,
    frozenBoards,
    capturedBySlot,
    highestCaptureRankBySlot,
    scores,
    currentTurnSlot: isFinished ? slot : nextTurn,
    lastMove: {
      kind: "move",
      boardId: action.boardId,
      from: action.from,
      to: action.to,
      slot,
      captured,
    },
    winnerSlot,
    status: isFinished ? "finished" : "playing",
    phase: "play",
  };
}

export function getValidSetupActions(
  state: PlayState,
  slot: PlayerSlot,
): SetupAction[] {
  if (state.status !== "setup") return [];
  if (setupTurnSlot(state.setupTurnIndex) !== slot) return [];

  const actions: SetupAction[] = [];

  for (const boardId of boardsForSlot(slot)) {
    const row = startingRow(boardId, slot);
    for (let col = 0; col < 5; col++) {
      for (const tower of state.boardState.reserves[slot]) {
        const position = { row, col };
        if (
          isValidSetupPlacement(
            state.boardState,
            slot,
            boardId,
            position,
            tower,
          )
        ) {
          actions.push({ kind: "setup", boardId, position, tower });
        }
      }
    }
  }

  return actions;
}

export function getValidPlayActions(
  state: PlayState,
  slot: PlayerSlot,
): MoveAction[] {
  if (state.status !== "playing") return [];
  if (state.currentTurnSlot !== slot) return [];

  const actions: MoveAction[] = [];

  for (let i = 0; i < BOARD_IDS.length; i++) {
    if (state.frozenBoards[i]) continue;
    const boardId = BOARD_IDS[i];
    const board = state.boardState.boards[boardId];

    for (let row = 0; row < board.length; row++) {
      for (let col = 0; col < board[row].length; col++) {
        const piece = board[row][col];
        if (!piece || piece.ownerSlot !== slot) continue;

        const destinations = getValidMovesForPiece(board, boardId, { row, col });
        for (const to of destinations) {
          actions.push({
            kind: "move",
            boardId,
            from: { row, col },
            to,
          });
        }
      }
    }
  }

  return actions;
}

export function playStateFromStored(stored: unknown): PlayState {
  const s = stored as PlayState;
  return {
    ...s,
    currentTurnSlot: s.currentTurnSlot as PlayerSlot,
    winnerSlot: s.winnerSlot as PlayerSlot | null,
  };
}
