import { useState } from 'react'
import { captureModes, objectImage, objectTools } from '../constants/ui'
import type { CaptureMode, ToolType } from '../types'

interface MapToolbarProps {
  open: boolean
  selectedTool: ToolType
  captureMode: CaptureMode
  genCount: number
  onToggle: () => void
  onSelectedToolChange: (tool: ToolType) => void
  onCaptureModeChange: (mode: CaptureMode) => void
  onGenCountChange: (value: number) => void
  onGenerate: (type: 'trees' | 'chests' | 'monsters') => void
}

export function MapToolbar(props: MapToolbarProps) {
  const toolIcons: Record<ToolType | CaptureMode, { png: string; fallback: string; title: string }> = {
    select: { png: '/assets/ui/select.png', fallback: '🖱️', title: 'Выбор' },
    eraser: { png: '/assets/ui/eraser.png', fallback: '🧽', title: 'Ластик' },
    rock: { png: objectImage.rock, fallback: '🪨', title: 'Камень' },
    tree: { png: objectImage.tree, fallback: '🌲', title: 'Дерево' },
    river: { png: objectImage.river, fallback: '🌊', title: 'Водоем' },
    monster: { png: objectImage.monster, fallback: '👹', title: 'Монстр' },
    chest: { png: objectImage.chest, fallback: '🎁', title: 'Секрет' },
    camp: { png: objectImage.camp, fallback: '🏕️', title: 'Лагерь' },
    none: { png: '/assets/ui/capture-none.png', fallback: '⛔', title: 'none' },
    normal: { png: '/assets/ui/capture-normal.png', fallback: '◉', title: 'normal' },
    permanent: { png: '/assets/ui/capture-permanent.png', fallback: '◆', title: 'permanent' },
    remove: { png: '/assets/ui/capture-remove.png', fallback: '✖', title: 'remove' },
  }

  function IconGlyph({ id }: { id: ToolType | CaptureMode }) {
    const [failed, setFailed] = useState(false)
    const icon = toolIcons[id]
    if (failed) return <span>{icon.fallback}</span>
    return (
      <img
        src={icon.png}
        alt={icon.title}
        style={{ width: 18, height: 18, objectFit: 'contain', display: 'block' }}
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <>
      <button className="toolbar-fab" onClick={props.onToggle}>
        {props.open ? 'Закрыть панель' : 'Инструменты'}
      </button>
      {props.open ? (
        <section className="toolbar-panel panel">
          <h3>Инструменты карты</h3>
          <div className="row wrap">
            <button
              className={props.selectedTool === 'select' ? 'active' : ''}
              onClick={() => props.onSelectedToolChange('select')}
              title={toolIcons.select.title}
            >
              <IconGlyph id="select" />
            </button>
            {objectTools.map((tool) => (
              <button
                className={props.selectedTool === tool ? 'active' : ''}
                key={tool}
                onClick={() => props.onSelectedToolChange(tool)}
                title={toolIcons[tool].title}
              >
                <IconGlyph id={tool} />
              </button>
            ))}
            <button
              className={props.selectedTool === 'eraser' ? 'active' : ''}
              onClick={() => props.onSelectedToolChange('eraser')}
              title={toolIcons.eraser.title}
            >
              <IconGlyph id="eraser" />
            </button>
          </div>

          <h3>Захват</h3>
          <div className="row wrap">
            {captureModes.map((mode) => (
              <button
                key={mode}
                className={props.captureMode === mode ? 'active' : ''}
                onClick={() => props.onCaptureModeChange(mode)}
                title={toolIcons[mode].title}
              >
                <IconGlyph id={mode} />
              </button>
            ))}
          </div>

          <h3>Генерация</h3>
          <div className="row wrap">
            <input
              type="number"
              min={1}
              max={50}
              value={props.genCount}
              onChange={(e) => props.onGenCountChange(Number(e.target.value) || 1)}
            />
            <button onClick={() => props.onGenerate('trees')} title="Генерировать деревья">
              <IconGlyph id="tree" />
            </button>
            <button onClick={() => props.onGenerate('chests')} title="Генерировать секреты">
              <IconGlyph id="chest" />
            </button>
            <button onClick={() => props.onGenerate('monsters')} title="Генерировать монстров">
              <IconGlyph id="monster" />
            </button>
          </div>
        </section>
      ) : null}
    </>
  )
}
