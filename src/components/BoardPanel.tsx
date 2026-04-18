import { useRef } from 'react'
import type { CSSProperties, MouseEvent } from 'react'
import { objectImage } from '../constants/ui'
import type { Game, Position } from '../types'

interface BoardPanelProps {
  game: Game
  selectedUnitId: string | null
  pathCells: Position[]
  zoom: number
  onCellClick: (x: number, y: number) => void
  onUnitTeleport: (unitId: string, x: number, y: number) => void
  onOutsideMapClick: () => void
  onZoomIn: () => void
  onZoomOut: () => void
}

export function BoardPanel(props: BoardPanelProps) {
  const dragRef = useRef<{ active: boolean; x: number; y: number; left: number; top: number }>({
    active: false,
    x: 0,
    y: 0,
    left: 0,
    top: 0,
  })

  function onMouseDown(event: MouseEvent<HTMLDivElement>): void {
    const target = event.currentTarget
    if (event.target === target) {
      props.onOutsideMapClick()
      return
    }
    dragRef.current = {
      active: true,
      x: event.clientX,
      y: event.clientY,
      left: target.scrollLeft,
      top: target.scrollTop,
    }
    target.classList.add('dragging')
  }

  function onMouseMove(event: MouseEvent<HTMLDivElement>): void {
    const target = event.currentTarget
    if (!dragRef.current.active) return
    const dx = event.clientX - dragRef.current.x
    const dy = event.clientY - dragRef.current.y
    target.scrollLeft = dragRef.current.left - dx
    target.scrollTop = dragRef.current.top - dy
  }

  function onMouseUp(event: MouseEvent<HTMLDivElement>): void {
    dragRef.current.active = false
    event.currentTarget.classList.remove('dragging')
  }

  return (
    <section className="board-shell">
      <div className="map-drag-wrapper" onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
        <div
          className="map map-fit"
          style={{ ['--map-zoom' as string]: String(props.zoom) } as CSSProperties}
        >
          {props.game.board.map((row) =>
            row.map((cell) => {
              const unit = props.game.units.find((entry) => entry.alive && entry.x === cell.x && entry.y === cell.y)
              const pathIndex = props.pathCells.findIndex((pos) => pos.x === cell.x && pos.y === cell.y)
              const selectedClass = unit?.id === props.selectedUnitId ? 'selected' : ''
              const riverClass = cell.type === 'river' ? 'river' : ''
              const captureColor =
                cell.capture?.player === 'player1'
                  ? props.game.player1.color
                  : cell.capture?.player === 'player2'
                    ? (props.game.player2?.color ?? '#2980b9')
                    : null
              const captureStyle: CSSProperties | undefined =
                captureColor && cell.capture?.type === 'permanent' ? { boxShadow: `inset 0 0 0 2px ${captureColor}` } : undefined
              const normalCaptureDotStyle: CSSProperties | undefined =
                cell.capture?.type === 'normal' && captureColor ? { backgroundColor: captureColor } : undefined

              return (
                <button
                  key={`${cell.x}-${cell.y}`}
                  className={`cell ${selectedClass} ${riverClass}`}
                  style={captureStyle}
                  onClick={() => props.onCellClick(cell.x, cell.y)}
                  onDragOver={(event) => {
                    if (event.dataTransfer.types.includes('application/x-ca-teleport-unit')) {
                      event.preventDefault()
                    }
                  }}
                  onDrop={(event) => {
                    const unitId = event.dataTransfer.getData('application/x-ca-teleport-unit')
                    if (!unitId) return
                    event.preventDefault()
                    props.onUnitTeleport(unitId, cell.x, cell.y)
                  }}
                  type="button"
                >
                  {cell.object ? <img src={objectImage[cell.object.type]} alt={cell.object.type} className="tile-img" /> : null}
                  {unit ? (
                    <img
                      src={unitIcon(unit.player, unit.icon)}
                      alt={unit.name}
                      className="tile-img unit"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('application/x-ca-teleport-unit', unit.id)
                      }}
                    />
                  ) : null}
                  {cell.capture?.type === 'normal' ? <span className="capture-normal-dot" style={normalCaptureDotStyle} /> : null}
                  {pathIndex >= 0 ? <span className="path-number">{pathIndex + 1}</span> : null}
                </button>
              )
            }),
          )}
        </div>
      </div>

      <div className="board-zoom-controls">
        <button type="button" title="Уменьшить карту" onClick={props.onZoomOut}>−</button>
        <span className="board-zoom-value">{Math.round(props.zoom * 100)}%</span>
        <button type="button" title="Увеличить карту" onClick={props.onZoomIn}>+</button>
      </div>
    </section>
  )
}
  function unitIcon(player: 'player1' | 'player2', icon?: string): string {
    if (icon) return icon
    return player === 'player2' ? '/assets/characters/2.png' : '/assets/characters/1.png'
  }
