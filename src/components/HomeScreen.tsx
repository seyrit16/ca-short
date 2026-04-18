import { GameUtils } from '../utils/gameUtils'
import type { GameSummary, PlayerKey } from '../types'

interface HomeScreenProps {
  sessionName: string
  player1Name: string
  player2Name: string
  maxTurns: number
  numCharacters: number
  color: string
  games: GameSummary[]
  notice: string
  error: string
  onSessionNameChange: (value: string) => void
  onPlayer1NameChange: (value: string) => void
  onPlayer2NameChange: (value: string) => void
  onMaxTurnsChange: (value: number) => void
  onNumCharactersChange: (value: number) => void
  onColorChange: (value: string) => void
  onCreateGame: () => void
  onJoin: (gameName: string, asPlayer: PlayerKey) => void
  onRefreshGames: () => void
}

const colorLabels: Record<string, string> = {
  '#c0392b': 'Красный',
  '#2980b9': 'Синий',
  '#27ae60': 'Зеленый',
  '#8e44ad': 'Фиолетовый',
  '#d35400': 'Оранжевый',
  '#f1c40f': 'Желтый',
}

export function HomeScreen(props: HomeScreenProps) {
  return (
    <section className="home-screen panel">
      <h1>Chess Adventures</h1>
      <p className="home-subtitle">Создание и подключение только на этой стартовой странице</p>
      <div className="form-grid">
        <input
          value={props.sessionName}
          onChange={(e) => props.onSessionNameChange(e.target.value)}
          placeholder="Название игры"
        />
        <input
          value={props.player1Name}
          onChange={(e) => props.onPlayer1NameChange(e.target.value)}
          placeholder="Ник игрока 1"
          maxLength={30}
        />
        <input
          value={props.player2Name}
          onChange={(e) => props.onPlayer2NameChange(e.target.value)}
          placeholder="Ник игрока 2"
          maxLength={30}
        />
        <input
          type="number"
          min={1}
          max={200}
          value={props.maxTurns}
          onChange={(e) => props.onMaxTurnsChange(Number(e.target.value) || 1)}
          placeholder="Ходы"
        />
        <select value={props.numCharacters} onChange={(e) => props.onNumCharactersChange(Number(e.target.value))}>
          <option value={4}>4 персонажа</option>
          <option value={5}>5 персонажей</option>
        </select>
        <div className="home-color-field">
          <select value={props.color} onChange={(e) => props.onColorChange(e.target.value)} title="Цвет игрока 1">
            {GameUtils.COLORS.map((value) => (
              <option value={value} key={value}>
                {colorLabels[value] ?? value}
              </option>
            ))}
          </select>
          <span className="home-color-dot" style={{ backgroundColor: props.color }} title="Текущий цвет" />
        </div>
        <button onClick={props.onCreateGame}>Создать игру</button>
        <button onClick={props.onRefreshGames}>Обновить список</button>
      </div>
      {props.notice ? <p className="notice success">{props.notice}</p> : null}
      {props.error ? <p className="notice error">{props.error}</p> : null}

      <h2>Активные игры</h2>
      <div className="games-list">
        {props.games.map((entry) => (
          <div className="game-item" key={entry.id}>
            <div className="game-title">{entry.name}</div>
            <div className="game-meta">
              Ход {entry.currentTurn}/{entry.maxTurns} | Игроков: {entry.playerCount}
            </div>
            <div className="row">
              <button onClick={() => props.onJoin(entry.name, 'player1')}>Игрок 1</button>
              <button onClick={() => props.onJoin(entry.name, 'player2')}>Игрок 2</button>
            </div>
          </div>
        ))}
        {props.games.length === 0 ? <p className="muted">Пока нет сохраненных игр</p> : null}
      </div>
    </section>
  )
}
