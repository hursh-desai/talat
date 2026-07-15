import { describe, expect, it } from "vitest";
import { canCapture } from "./capture";
import {
  applyPlayMove,
  applySetupMove,
  createPlayStateFromWaiting,
  type PlayState,
} from "./applyMove";
import { isBoardFrozen } from "./frozen";
import { isValidMove, getValidMovesForPiece } from "./movement";
import { createEmptyBoard } from "./types";
import { determineWinner } from "./scoring";
import { startingRow } from "./geometry";

describe("capture rules", () => {
  it("allows large to capture medium", () => {
    expect(canCapture({ height: 3, sides: 4 }, { height: 2, sides: 6 })).toBe(
      true,
    );
  });

  it("rejects large capturing small", () => {
    expect(canCapture({ height: 3, sides: 4 }, { height: 1, sides: 3 })).toBe(
      false,
    );
  });

  it("uses sides when heights match", () => {
    expect(canCapture({ height: 2, sides: 6 }, { height: 2, sides: 3 })).toBe(
      true,
    );
    expect(canCapture({ height: 2, sides: 4 }, { height: 2, sides: 4 })).toBe(
      false,
    );
  });

  it("allows David-and-Goliath exception", () => {
    expect(canCapture({ height: 1, sides: 3 }, { height: 3, sides: 6 })).toBe(
      true,
    );
  });
});

describe("movement", () => {
  it("moves forward and diagonally", () => {
    const board = createEmptyBoard();
    board[0][2] = { height: 2, sides: 4, ownerSlot: 0 };
    const moves = getValidMovesForPiece(board, "board01", { row: 0, col: 2 });
    expect(moves).toEqual(
      expect.arrayContaining([
        { row: 1, col: 1 },
        { row: 1, col: 2 },
        { row: 1, col: 3 },
      ]),
    );
  });

  it("allows capture onto occupied cell", () => {
    const board = createEmptyBoard();
    board[0][2] = { height: 3, sides: 4, ownerSlot: 0 };
    board[1][2] = { height: 2, sides: 3, ownerSlot: 1 };
    expect(isValidMove(board, "board01", { row: 0, col: 2 }, { row: 1, col: 2 })).toBe(
      true,
    );
  });

  it("allows sideways captures but not sideways empty moves", () => {
    const board = createEmptyBoard();
    board[2][2] = { height: 2, sides: 6, ownerSlot: 0 };
    board[2][1] = { height: 2, sides: 4, ownerSlot: 1 };

    expect(isValidMove(board, "board01", { row: 2, col: 2 }, { row: 2, col: 1 })).toBe(
      true,
    );
    expect(isValidMove(board, "board01", { row: 2, col: 2 }, { row: 2, col: 3 })).toBe(
      false,
    );
  });

  it("only allows sideways captures on the opponent starting row", () => {
    const board = createEmptyBoard();
    board[4][2] = { height: 2, sides: 6, ownerSlot: 0 };
    board[4][1] = { height: 2, sides: 4, ownerSlot: 1 };

    expect(isValidMove(board, "board01", { row: 4, col: 2 }, { row: 4, col: 1 })).toBe(
      true,
    );
    expect(isValidMove(board, "board01", { row: 4, col: 2 }, { row: 4, col: 3 })).toBe(
      false,
    );
  });
});

describe("setup and play flow", () => {
  it("alternates setup turns", () => {
    let state = createPlayStateFromWaiting();
    expect(state.currentTurnSlot).toBe(0);

    const firstTower = state.boardState.reserves[0][0];
    state = applySetupMove(state, 0, {
      kind: "setup",
      boardId: "board01",
      position: { row: startingRow("board01", 0), col: 0 },
      tower: firstTower,
    });

    expect(state.setupTurnIndex).toBe(1);
    expect(state.currentTurnSlot).toBe(1);
  });
});

describe("frozen boards", () => {
  it("detects board with no possible captures as frozen", () => {
    const board = createEmptyBoard();
    board[0][0] = { height: 1, sides: 3, ownerSlot: 0 };
    board[4][4] = { height: 1, sides: 3, ownerSlot: 1 };
    expect(isBoardFrozen(board, "board01")).toBe(true);
  });

  it("detects adjacent capturable pieces as not frozen", () => {
    const board = createEmptyBoard();
    board[2][2] = { height: 3, sides: 4, ownerSlot: 0 };
    board[3][2] = { height: 2, sides: 3, ownerSlot: 1 };
    expect(isBoardFrozen(board, "board01")).toBe(false);
  });

  it("keeps a board active when a future capture can be reached", () => {
    const board = createEmptyBoard();
    board[0][2] = { height: 3, sides: 4, ownerSlot: 0 };
    board[4][2] = { height: 2, sides: 3, ownerSlot: 1 };
    expect(isBoardFrozen(board, "board01")).toBe(false);
  });
});

describe("authoritative play validation", () => {
  function playingState(): PlayState {
    return {
      ...createPlayStateFromWaiting(),
      phase: "play",
      status: "playing",
      currentTurnSlot: 0,
      frozenBoards: [false, false, false],
    };
  }

  it("rejects moving an opponent tower", () => {
    const state = playingState();
    state.boardState.boards.board01[4][2] = {
      height: 2,
      sides: 4,
      ownerSlot: 1,
    };

    expect(() =>
      applyPlayMove(state, 0, {
        kind: "move",
        boardId: "board01",
        from: { row: 4, col: 2 },
        to: { row: 3, col: 2 },
      }),
    ).toThrow("Invalid move");
  });

  it("rejects moving on a board outside the player's fronts", () => {
    const state = playingState();
    state.boardState.boards.board12[0][2] = {
      height: 2,
      sides: 4,
      ownerSlot: 0,
    };

    expect(() =>
      applyPlayMove(state, 0, {
        kind: "move",
        boardId: "board12",
        from: { row: 0, col: 2 },
        to: { row: 1, col: 2 },
      }),
    ).toThrow("You cannot move on that board");
  });
});

describe("scoring tie-breaker", () => {
  it("breaks ties using highest capture rank", () => {
    const winner = determineWinner([10, 10, 5], [36, 23, 0]);
    expect(winner).toBe(0);
  });

  it("returns null on full tie", () => {
    const winner = determineWinner([10, 10, 5], [23, 23, 0]);
    expect(winner).toBe(null);
  });
});
