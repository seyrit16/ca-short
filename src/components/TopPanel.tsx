import { GameUtils } from '../utils/gameUtils'

interface TopPanelProps {
  sessionName: string
  maxTurns: number
  numCharacters: number
  color: string
  notice: string
  error: string
  onSessionNameChange: (value: string) => void
  onMaxTurnsChange: (value: number) => void
  onNumCharactersChange: (value: number) => void
  onColorChange: (value: string) => void
  onCreateGame: () => void
  onRefreshGames: () => void
}

export function TopPanel(props: TopPanelProps) {
  return (
    <section className="panel top-panel">
      <h1>Chess Adventures</h1>
      <div className="form-grid">
        <input
          value={props.sessionName}
          onChange={(e) => props.onSessionNameChange(e.target.value)}
          placeholder="Название игры"
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
        <select value={props.color} onChange={(e) => props.onColorChange(e.target.value)}>
          {GameUtils.COLORS.map((value) => (
            <option value={value} key={value}>
              {value}
            </option>
          ))}
        </select>
        <button onClick={props.onCreateGame}>Создать игру</button>
        <button onClick={props.onRefreshGames}>Обновить список</button>
      </div>
      {props.notice ? <p className="notice success">{props.notice}</p> : null}
      {props.error ? <p className="notice error">{props.error}</p> : null}
    </section>
  )
}
