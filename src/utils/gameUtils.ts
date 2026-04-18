import type {
  CaptureType,
  Cell,
  DeckCard,
  DeckState,
  Game,
  GameExtras,
  MoveState,
  ObjectType,
  PlayerKey,
  Position,
  Unit,
} from '../types';

export const GameUtils = {
  GRID_SIZE: 24,
  COLORS: ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#d35400', '#f1c40f'],

  createGame(sessionName: string, maxTurns: number, playerColor: string, numCharacters: number): Game {
    const gameId = `game_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const parsedMaxTurns = Number.isFinite(maxTurns) ? Math.max(1, Math.floor(maxTurns)) : 10;
    const parsedNumCharacters = numCharacters === 5 ? 5 : 4;

    const game: Game = {
      id: gameId,
      name: sessionName,
      maxTurns: parsedMaxTurns,
      currentTurn: 1,
      currentPlayer: 'player1',
      status: 'active',
      createdAt: Date.now(),
      numCharacters: parsedNumCharacters,
      player1: {
        color: playerColor,
        name: 'Игрок 1',
        captures: { normal: 0, permanent: 0 },
        territory: 0,
        capturePoints: 10,
      },
      player2: null,
      board: this.createEmptyBoard(),
      units: [],
      objects: [],
      events: [],
      extras: {
        queueByPlayer: {
          player1: [],
          player2: [],
        },
        resources: {
          player1: { trees: 0, redJokers: 0, blackJokers: 0, heal: 0, buffDebuff: 0, provocation: 0, egoStrike: 0 },
          player2: { trees: 0, redJokers: 0, blackJokers: 0, heal: 0, buffDebuff: 0, provocation: 0, egoStrike: 0 },
        },
        monster: { name: 'Монстр', hp: 30, attack: 8, defense: 8 },
        deck: this.createDeckState(),
        moveState: {
          turnKey: 'player1:1',
          byUnit: {},
        },
      },
    };

    const p1StartPositions: Position[] =
      parsedNumCharacters === 5
        ? [{ x: 2, y: 21 }, { x: 1, y: 22 }, { x: 1, y: 23 }, { x: 0, y: 22 }, { x: 0, y: 23 }]
        : [{ x: 1, y: 22 }, { x: 1, y: 23 }, { x: 0, y: 22 }, { x: 0, y: 23 }];

    p1StartPositions.forEach((pos, idx) => {
      const unit: Unit = {
        id: `p1_unit_${idx}`,
        player: 'player1',
        type: 'character',
        emoji: '🙂',
        icon: '/assets/characters/1.png',
        x: pos.x,
        y: pos.y,
        name: `Персонаж ${idx + 1}`,
        hp: 10,
        maxHp: 10,
        attack: 5,
        defense: 5,
        capture: 3,
        items: { teleport: 0, camp: 0, returnStone: 0 },
        alive: true,
      };
      game.units.push(unit);
      game.board[pos.y][pos.x].capture = { type: 'permanent', player: 'player1' };
    });

    this.calculateTerritory(game);
    game.extras = this.ensureExtras(game);
    return game;
  },

  createEmptyBoard(): Cell[][] {
    const board: Cell[][] = [];
    for (let y = 0; y < this.GRID_SIZE; y++) {
      const row: Cell[] = [];
      for (let x = 0; x < this.GRID_SIZE; x++) {
        row.push({
          x,
          y,
          type: 'plain',
          capture: null,
          object: null,
        });
      }
      board.push(row);
    }
    return board;
  },

  joinGame(game: Game, playerColor: string): Game {
    game.player2 = {
      color: playerColor,
      name: 'Игрок 2',
      captures: { normal: 0, permanent: 0 },
      territory: 0,
      capturePoints: 10,
    };

    const numCharacters = game.numCharacters || 4;
    const p2StartPositions: Position[] =
      numCharacters === 5
        ? [{ x: 21, y: 2 }, { x: 22, y: 1 }, { x: 23, y: 1 }, { x: 22, y: 0 }, { x: 23, y: 0 }]
        : [{ x: 22, y: 1 }, { x: 23, y: 1 }, { x: 22, y: 0 }, { x: 23, y: 0 }];

    p2StartPositions.forEach((pos, idx) => {
      const unit: Unit = {
        id: `p2_unit_${idx}`,
        player: 'player2',
        type: 'character',
        emoji: '🙂',
        icon: '/assets/characters/2.png',
        x: pos.x,
        y: pos.y,
        name: `Персонаж ${idx + 1}`,
        hp: 10,
        maxHp: 10,
        attack: 5,
        defense: 5,
        capture: 3,
        items: { teleport: 0, camp: 0, returnStone: 0 },
        alive: true,
      };
      game.units.push(unit);
      game.board[pos.y][pos.x].capture = { type: 'permanent', player: 'player2' };
    });

    this.calculateTerritory(game);
    game.extras = this.ensureExtras(game);
    return game;
  },

  createDeckState(): DeckState {
    const suits: Array<{ suit: 'hearts' | 'diamonds' | 'clubs' | 'spades'; symbol: string; color: 'red' | 'black' }> = [
      { suit: 'hearts', symbol: '♥', color: 'red' },
      { suit: 'diamonds', symbol: '♦', color: 'red' },
      { suit: 'clubs', symbol: '♣', color: 'black' },
      { suit: 'spades', symbol: '♠', color: 'black' },
    ];
    const ranks = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
    const cards: DeckCard[] = [];

    suits.forEach(({ suit, symbol, color }) => {
      ranks.forEach((rank) => {
        cards.push({
          id: `${rank}_${suit}`,
          label: `${rank}${symbol}`,
          suit,
          color,
        });
      });
    });

    cards.push({ id: 'joker_red', label: 'RJ', suit: 'joker', color: 'red' });
    cards.push({ id: 'joker_black', label: 'BJ', suit: 'joker', color: 'black' });

    const shuffled = [...cards].sort(() => Math.random() - 0.5);
    return { remaining: shuffled, discard: [], current: null, history: [] };
  },

  ensureExtras(game: Game): GameExtras {
    game.units = game.units.map((unit) => ({
      ...unit,
      emoji: unit.emoji ?? '🙂',
      icon: unit.icon ?? (unit.player === 'player2' ? '/assets/characters/2.png' : '/assets/characters/1.png'),
      items: {
        teleport: unit.items?.teleport ?? 0,
        camp: unit.items?.camp ?? 0,
        returnStone: unit.items?.returnStone ?? 0,
      },
    }));

    const base: GameExtras = {
      queueByPlayer: {
        player1: game.units.filter((unit) => unit.player === 'player1').map((unit) => unit.id),
        player2: game.units.filter((unit) => unit.player === 'player2').map((unit) => unit.id),
      },
      resources: {
        player1: { trees: 0, redJokers: 0, blackJokers: 0, heal: 0, buffDebuff: 0, provocation: 0, egoStrike: 0 },
        player2: { trees: 0, redJokers: 0, blackJokers: 0, heal: 0, buffDebuff: 0, provocation: 0, egoStrike: 0 },
      },
      monster: { name: 'Монстр', hp: 30, attack: 8, defense: 8 },
      deck: this.createDeckState(),
      moveState: {
        turnKey: `${game.currentPlayer}:${game.currentTurn}`,
        byUnit: {},
      },
    };

    if (!game.extras) return base;

    const allUnitIds = new Set(game.units.map((unit) => unit.id));
    const unitById = new Map(game.units.map((unit) => [unit.id, unit]));
    const legacyQueue = Array.isArray(game.extras.queue) ? game.extras.queue : [];
    const legacyByPlayer: Record<PlayerKey, string[]> = { player1: [], player2: [] };
    legacyQueue.forEach((unitId) => {
      const unit = unitById.get(unitId);
      if (!unit) return;
      legacyByPlayer[unit.player].push(unit.id);
    });

    function sanitizeQueue(player: PlayerKey, raw: unknown): string[] {
      const existing = Array.isArray(raw) ? raw.filter((unitId): unitId is string => typeof unitId === 'string') : [];
      const filtered = existing.filter((unitId) => allUnitIds.has(unitId) && unitById.get(unitId)?.player === player);
      const expected = base.queueByPlayer?.[player] ?? [];
      expected.forEach((unitId) => {
        if (!filtered.includes(unitId)) filtered.push(unitId);
      });
      return filtered;
    }

    return {
      queueByPlayer: {
        player1: sanitizeQueue('player1', game.extras.queueByPlayer?.player1 ?? legacyByPlayer.player1),
        player2: sanitizeQueue('player2', game.extras.queueByPlayer?.player2 ?? legacyByPlayer.player2),
      },
      resources: {
        player1: { ...base.resources.player1, ...(game.extras.resources?.player1 ?? {}) },
        player2: { ...base.resources.player2, ...(game.extras.resources?.player2 ?? {}) },
      },
      monster: { ...base.monster, ...(game.extras.monster ?? {}) },
      deck: {
        remaining: Array.isArray(game.extras.deck?.remaining) ? game.extras.deck.remaining : base.deck.remaining,
        discard: Array.isArray(game.extras.deck?.discard) ? game.extras.deck.discard : base.deck.discard,
        current: game.extras.deck?.current ?? null,
        history: Array.isArray(game.extras.deck?.history) ? game.extras.deck.history : base.deck.history,
      },
      moveState: this.ensureMoveState(game, game.extras.moveState ?? base.moveState),
    };
  },

  ensureMoveState(game: Game, moveState: MoveState): MoveState {
    const key = `${game.currentPlayer}:${game.currentTurn}`;
    if (moveState.turnKey !== key) {
      return { turnKey: key, byUnit: {} };
    }
    return moveState;
  },

  getCell(game: Game | null, x: number, y: number): Cell | null {
    if (!game || x < 0 || y < 0 || y >= game.board.length || x >= game.board[0].length) {
      return null;
    }
    return game.board[y][x];
  },

  getUnitAt(game: Game | null, x: number, y: number): Unit | null {
    if (!game) return null;
    return game.units.find((unit) => unit.alive && unit.x === x && unit.y === y) ?? null;
  },

  placeObject(game: Game, x: number, y: number, objectType: ObjectType, currentPlayer: PlayerKey): boolean {
    const cell = this.getCell(game, x, y);
    if (!cell || cell.object || this.getUnitAt(game, x, y)) return false;

    if (objectType === 'river') {
      cell.type = 'river';
      cell.object = null;
      return true;
    }

    cell.object = {
      type: objectType,
      placedAt: Date.now(),
      placedBy: currentPlayer,
    };
    return true;
  },

  removeObject(game: Game, x: number, y: number): boolean {
    const cell = this.getCell(game, x, y);
    if (!cell) return false;

    if (cell.object) {
      cell.object = null;
      return true;
    }

    if (cell.type === 'river') {
      cell.type = 'plain';
      return true;
    }

    return false;
  },

  removeCapture(game: Game, x: number, y: number): boolean {
    const cell = this.getCell(game, x, y);
    if (!cell?.capture) return false;

    const owner = game[cell.capture.player];
    if (!owner) return false;
    owner.captures[cell.capture.type] = Math.max(0, owner.captures[cell.capture.type] - 1);
    cell.capture = null;
    this.calculateTerritory(game);
    return true;
  },

  isPassable(game: Game | null, x: number, y: number, movingPlayer?: PlayerKey): boolean {
    const cell = this.getCell(game, x, y);
    if (!cell) return false;
    if (cell.object?.type === 'rock') return false;
    if (cell.object?.type === 'tree' && cell.capture) return false;
    if (
      movingPlayer &&
      cell.capture &&
      cell.capture.type === 'permanent' &&
      cell.capture.player !== movingPlayer
    ) {
      return false;
    }
    if (this.getUnitAt(game, x, y)) return false;
    return true;
  },

  captureCell(game: Game, x: number, y: number, captureType: CaptureType, currentPlayer: PlayerKey): boolean {
    const cell = this.getCell(game, x, y);
    if (!cell) return false;

    if (cell.object && cell.object.type === 'rock') return false;

    const prevCapture = cell.capture;
    const player = game[currentPlayer];
    if (!player) return false;

    if (prevCapture && prevCapture.player !== currentPlayer) {
      const opponent = game[prevCapture.player];
      if (!opponent) return false;
      opponent.captures[prevCapture.type] = Math.max(0, opponent.captures[prevCapture.type] - 1);
    }

    if (!prevCapture || prevCapture.player !== currentPlayer) {
      player.captures[captureType] += 1;
    } else if (prevCapture.type !== captureType) {
      player.captures[prevCapture.type] = Math.max(0, player.captures[prevCapture.type] - 1);
      player.captures[captureType] += 1;
    }

    cell.capture = { type: captureType, player: currentPlayer };
    this.calculateTerritory(game);
    return true;
  },

  calculateTerritory(game: Game): void {
    let p1Territory = 0;
    let p2Territory = 0;

    for (let y = 0; y < game.board.length; y++) {
      for (let x = 0; x < game.board[y].length; x++) {
        const capture = game.board[y][x].capture;
        if (!capture) continue;
        if (capture.player === 'player1') p1Territory += 1;
        if (capture.player === 'player2') p2Territory += 1;
      }
    }

    game.player1.territory = p1Territory;
    if (game.player2) game.player2.territory = p2Territory;
  },

  canPlaceGeneratedObject(game: Game, x: number, y: number, type: 'trees' | 'chests' | 'monsters'): boolean {
    const cell = this.getCell(game, x, y);
    if (!cell) return false;
    if (cell.type === 'river' || cell.object || cell.capture || this.getUnitAt(game, x, y)) return false;

    const placedType = type === 'trees' ? 'tree' : type === 'chests' ? 'chest' : 'monster';
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const neighbor = this.getCell(game, x + dx, y + dy);
        if (!neighbor?.object) continue;
        const neighborType = neighbor.object.type;
        const mixedMonster =
          (placedType === 'monster' && (neighborType === 'tree' || neighborType === 'chest')) ||
          ((placedType === 'tree' || placedType === 'chest') && neighborType === 'monster');
        if (mixedMonster) return false;
      }
    }
    return true;
  },

  generateObjects(game: Game, type: 'trees' | 'chests' | 'monsters', count: number) {
    const placed: Array<{ x: number; y: number; type: ObjectType }> = [];
    let attempts = 0;
    const maxAttempts = Math.max(100, count * 100);

    while (placed.length < count && attempts < maxAttempts) {
      attempts += 1;
      const x = Math.floor(Math.random() * this.GRID_SIZE);
      const y = Math.floor(Math.random() * this.GRID_SIZE);
      if (!this.canPlaceGeneratedObject(game, x, y, type)) continue;

      const objectType: ObjectType = type === 'trees' ? 'tree' : type === 'chests' ? 'chest' : 'monster';
      const cell = game.board[y][x];
      cell.object = {
        type: objectType,
        placedAt: Date.now(),
        placedBy: 'system',
      };
      placed.push({ x, y, type: objectType });
    }

    return placed;
  },
};
