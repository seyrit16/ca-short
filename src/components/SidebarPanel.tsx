import { captureModes, objectLabel, objectTools } from '../constants/ui'
import type { CaptureMode, Game, GameSummary, PlayerKey, ToolType } from '../types'

interface SidebarPanelProps {
  games: GameSummary[]
  game: Game | null
  selectedTool: ToolType
  captureMode: CaptureMode
  genCount: number
  onJoin: (gameName: string, asPlayer: PlayerKey) => void
  onSelectedToolChange: (tool: ToolType) => void
  onCaptureModeChange: (mode: CaptureMode) => void
  onGenCountChange: (value: number) => void
  onGenerate: (type: 'trees' | 'chests' | 'monsters') => void
  onEndTurn: () => void
  onSave: () => void
  onDelete: () => void
}

export function SidebarPanel(props: SidebarPanelProps) {
  return (
    <aside className="panel sidebar">
      <h2>Сохраненные сессии</h2>
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

      {props.game ? (
        <>
          <h2>Инструменты</h2>
          <div className="row wrap">
            <button
              className={props.selectedTool === 'select' ? 'active' : ''}
              onClick={() => props.onSelectedToolChange('select')}
            >
              Выбор
            </button>
            {objectTools.map((tool) => (
              <button
                className={props.selectedTool === tool ? 'active' : ''}
                key={tool}
                onClick={() => props.onSelectedToolChange(tool)}
              >
                {objectLabel[tool]}
              </button>
            ))}
            <button
              className={props.selectedTool === 'eraser' ? 'active' : ''}
              onClick={() => props.onSelectedToolChange('eraser')}
            >
              Ластик
            </button>
          </div>

          <h2>Режим захвата</h2>
          <div className="row wrap">
            {captureModes.map((mode) => (
              <button
                className={props.captureMode === mode ? 'active' : ''}
                key={mode}
                onClick={() => props.onCaptureModeChange(mode)}
              >
                {mode}
              </button>
            ))}
          </div>

          <h2>Генерация</h2>
          <div className="row">
            <input
              type="number"
              min={1}
              max={50}
              value={props.genCount}
              onChange={(e) => props.onGenCountChange(Number(e.target.value) || 1)}
            />
          </div>
          <div className="row wrap">
            <button onClick={() => props.onGenerate('trees')}>Деревья</button>
            <button onClick={() => props.onGenerate('chests')}>Секреты</button>
            <button onClick={() => props.onGenerate('monsters')}>Монстры</button>
          </div>

          <h2>Управление</h2>
          <div className="row wrap">
            <button onClick={props.onEndTurn}>Завершить ход</button>
            <button onClick={props.onSave}>Сохранить</button>
            <button className="danger" onClick={props.onDelete}>
              Удалить игру
            </button>
          </div>
        </>
      ) : null}
    </aside>
  )
}
