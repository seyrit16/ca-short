export type CellType = 'plain' | 'river';
export type CaptureType = 'normal' | 'permanent';
export type PlayerKey = 'player1' | 'player2';
export type ObjectType = 'rock' | 'tree' | 'river' | 'monster' | 'chest' | 'camp';
export type ToolType = 'select' | ObjectType | 'eraser';
export type CaptureMode = 'none' | CaptureType | 'remove';

export interface Capture {
  type: CaptureType;
  player: PlayerKey;
}

export interface CellObject {
  type: ObjectType;
  placedAt: number;
  placedBy: PlayerKey | 'system';
}

export interface Cell {
  x: number;
  y: number;
  type: CellType;
  capture: Capture | null;
  object: CellObject | null;
}

export interface Position {
  x: number;
  y: number;
}

export interface Unit extends Position {
  id: string;
  player: PlayerKey;
  type: 'character';
  emoji?: string;
  icon?: string;
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  capture: number;
  items?: {
    teleport: number;
    camp: number;
    returnStone: number;
  };
  alive: boolean;
}

export interface Player {
  color: string;
  name: string;
  captures: {
    normal: number;
    permanent: number;
  };
  territory: number;
  capturePoints: number;
}

export interface GameEvent {
  type: string;
  message: string;
  player: PlayerKey;
  timestamp: number;
}

export interface Game {
  id: string;
  name: string;
  maxTurns: number;
  currentTurn: number;
  currentPlayer: PlayerKey;
  status: 'active' | 'ended';
  createdAt: number;
  numCharacters: number;
  player1: Player;
  player2: Player | null;
  board: Cell[][];
  units: Unit[];
  objects: CellObject[];
  events: GameEvent[];
  extras?: GameExtras;
  updatedAt?: number;
  winner?: PlayerKey | 'tie';
}

export interface GameSummary {
  id: string;
  name: string;
  currentTurn: number;
  maxTurns: number;
  playerCount: number;
  player1Color?: string;
  player2Color?: string;
  status: 'active' | 'ended';
}

export interface PlayerResourceState {
  trees: number;
  redJokers: number;
  blackJokers: number;
  heal: number;
  buffDebuff: number;
  provocation: number;
  egoStrike: number;
}

export interface MonsterState {
  name: string;
  hp: number;
  attack: number;
  defense: number;
}

export interface GameExtras {
  queue?: string[];
  queueByPlayer?: Record<PlayerKey, string[]>;
  resources: Record<PlayerKey, PlayerResourceState>;
  monster: MonsterState;
  deck: DeckState;
  moveState: MoveState;
}

export interface DeckCard {
  id: string;
  label: string;
  type?: 'joker';
  color?: 'red' | 'black' | 'gold';
  name?: string;
  suit?: string | {
    sym: string;
    name: string;
    color: 'red' | 'black';
    bar: string;
  };
  rank?: {
    s: string;
    name: string;
  };
}

export interface DeckState {
  remaining: DeckCard[];
  discard: DeckCard[];
  current: DeckCard | null;
  history: DeckCard[];
}

export interface UnitMoveState {
  start: Position;
  captured: Position[];
}

export interface MoveState {
  turnKey: string;
  byUnit: Record<string, UnitMoveState>;
}
