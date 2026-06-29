import { isStartingRow } from "./geometry";
import { towerKey } from "./types";
import type {
  BoardId,
  GameBoardState,
  PlayerSlot,
  Position,
  SetupAction,
  TowerSpec,
} from "./types";
import { boardsForSlot } from "./types";

export function isValidSetupPlacement(
  state: GameBoardState,
  slot: PlayerSlot,
  boardId: BoardId,
  position: Position,
  tower: TowerSpec,
): boolean {
  const allowedBoards = boardsForSlot(slot);
  if (!allowedBoards.includes(boardId)) return false;

  if (!isStartingRow(boardId, slot, position.row)) return false;

  const { row, col } = position;
  if (state.boards[boardId][row][col] !== null) return false;

  const reserve = state.reserves[slot];
  const key = towerKey(tower);
  return reserve.some((t) => towerKey(t) === key);
}

export function applySetupPlacement(
  state: GameBoardState,
  slot: PlayerSlot,
  action: SetupAction,
): GameBoardState {
  if (
    !isValidSetupPlacement(
      state,
      slot,
      action.boardId,
      action.position,
      action.tower,
    )
  ) {
    throw new Error("Invalid setup placement");
  }

  const key = towerKey(action.tower);
  const nextReserves = state.reserves.map((reserve, index) => {
    if (index !== slot) return reserve;
    const copy = [...reserve];
    const removeIndex = copy.findIndex((t) => towerKey(t) === key);
    copy.splice(removeIndex, 1);
    return copy;
  });

  const nextBoards = { ...state.boards };
  const board = nextBoards[action.boardId].map((row) => [...row]);
  board[action.position.row][action.position.col] = {
    ...action.tower,
    ownerSlot: slot,
  };
  nextBoards[action.boardId] = board;

  return {
    boards: nextBoards,
    reserves: nextReserves,
  };
}

export function isSetupComplete(state: GameBoardState): boolean {
  return state.reserves.every((reserve) => reserve.length === 0);
}

export function setupTurnSlot(setupTurnIndex: number): PlayerSlot {
  return (setupTurnIndex % 3) as PlayerSlot;
}
