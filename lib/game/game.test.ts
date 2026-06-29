import { describe, expect, it } from "vitest";
import { canCapture } from "./capture";
import {
  applySetupMove,
  createPlayStateFromWaiting,
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
