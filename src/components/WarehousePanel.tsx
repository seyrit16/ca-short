import { useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { createPortal } from 'react-dom'
import type { PlayerKey, PlayerResourceState } from '../types'

type ResourceKey = 'trees' | 'redJokers' | 'blackJokers' | 'heal' | 'buffDebuff' | 'provocation' | 'egoStrike'
type WarehouseDropAction = 'trees-camp' | 'red-joker-revive' | 'heal-full'

export const WAREHOUSE_DROP_MIME = 'application/x-ca-warehouse-resource'

interface WarehousePanelProps {
  statsPlayer: PlayerKey
  statsPlayerName: string
  resources?: PlayerResourceState
  onResourceChange: (player: PlayerKey, key: ResourceKey, delta: number) => void
}

interface ResourceConfig {
  key: ResourceKey
  title: string
  shortLabel: string
  dragAction?: WarehouseDropAction
  minAmountToDrag?: number
}

const resourceConfigs: ResourceConfig[] = [
  { key: 'trees', title: 'Дерево', shortLabel: 'L', dragAction: 'trees-camp', minAmountToDrag: 6 },
  { key: 'redJokers', title: 'Красный джокер', shortLabel: 'RJ', dragAction: 'red-joker-revive', minAmountToDrag: 1 },
  { key: 'blackJokers', title: 'Черный джокер', shortLabel: 'BJ' },
  { key: 'heal', title: 'Лечение', shortLabel: 'H', dragAction: 'heal-full', minAmountToDrag: 1 },
  { key: 'buffDebuff', title: 'Бафф/дебафф', shortLabel: 'B/D' },
  { key: 'provocation', title: 'Провокация', shortLabel: 'P' },
  { key: 'egoStrike', title: 'Эго-удар', shortLabel: 'E' },
]

function ResourceBadge({ resource}: { resource: ResourceKey; shortLabel: string }) {
  return (
    <span className="warehouse-resource-badge">
      <span className="warehouse-resource-icon" aria-hidden="true">
        {resource === 'trees' ? (
            <img
                src="/assets/tree.png"
                alt=""
                className="warehouse-resource-png"
                draggable={false}
            />
        ) : null}
        {resource === 'redJokers' ? (
            <img
                src="/assets/RJoker.png"
                alt=""
                className="warehouse-resource-png"
                draggable={false}
            />
        ) : null}
        {resource === 'blackJokers' ? (
            <img
                src="/assets/BJoker.png"
                alt=""
                className="warehouse-resource-png"
                draggable={false}
            />
        ) : null}
        {resource === 'heal' ? (
            <img
                src="/assets/heal.png"
                alt=""
                className="warehouse-resource-png"
                draggable={false}
            />
        ) : null}
        {resource === 'buffDebuff' ? (
            <img
                src="/assets/baffdebaff.png"
                alt=""
                className="warehouse-resource-png"
                draggable={false}
            />
        ) : null}
        {resource === 'provocation' ? (
          <svg viewBox="0 0 24 24">
            <path d="M12 4 4 9l8 5 8-5z" />
            <path d="M12 14v6" />
          </svg>
        ) : null}
        {resource === 'egoStrike' ? (
            <img
                src="/assets/ego.png"
                alt=""
                className="warehouse-resource-png"
                draggable={false}
            />
        ) : null}
      </span>
      {/*<span>{shortLabel}</span>*/}
    </span>
  )
}

export function WarehousePanel(props: WarehousePanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 })
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const popupRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isOpen) return

    const updatePosition = () => {
      const button = buttonRef.current
      if (!button) return
      const rect = button.getBoundingClientRect()
      const popupWidth = 300
      const gap = 10
      let left = rect.right + gap
      if (left + popupWidth > window.innerWidth - 8) {
        left = Math.max(8, rect.left - popupWidth - gap)
      }
      const top = Math.min(Math.max(8, rect.top), Math.max(8, window.innerHeight - 420))
      setPopupPosition({ top, left })
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      const clickedInsidePopup = popupRef.current?.contains(target) ?? false
      const clickedButton = buttonRef.current?.contains(target) ?? false
      if (!clickedInsidePopup && !clickedButton) setIsOpen(false)
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [isOpen])

  function handleDragStart(
    event: DragEvent<HTMLButtonElement>,
    action: WarehouseDropAction | undefined,
    canDrag: boolean,
  ): void {
    if (!action || !canDrag) {
      event.preventDefault()
      return
    }
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData(WAREHOUSE_DROP_MIME, JSON.stringify({ action }))
  }

  return (
    <div className="warehouse-anchor">
      <button
        ref={buttonRef}
        type="button"
        className={`warehouse-toggle-btn ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        title="Открыть склад"
      >
        <svg viewBox="0 0 24 24" className="warehouse-toggle-icon" aria-hidden="true">
          <path d="M3 10.5 12 4l9 6.5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
          <path d="M5 10h14" />
          <path d="M9 14h6" />
          <path d="M10 20v-4h4v4" />
        </svg>
      </button>

      {isOpen
        ? createPortal(
            <section
              ref={popupRef}
              className="warehouse-popup panel"
              title="Перетащите ресурсы на карточку персонажа"
              style={{ top: `${popupPosition.top}px`, left: `${popupPosition.left}px` }}
            >
              <div className="warehouse-popup-title">{props.statsPlayerName}: склад</div>
              <div className="warehouse-list">
                {resourceConfigs.map((resource) => {
                  const value = props.resources?.[resource.key] ?? 0
                  const canDrag = resource.dragAction
                    ? value >= (resource.minAmountToDrag ?? 1)
                    : false

                  return (
                    <div key={resource.key} className="warehouse-resource-row">
                      <button
                        type="button"
                        className={`warehouse-resource-main ${canDrag ? 'draggable' : ''}`}
                        draggable={canDrag}
                        onDragStart={(event) => handleDragStart(event, resource.dragAction, canDrag)}
                        title={resource.dragAction ? 'Перетащите на персонажа' : resource.title}
                      >
                        <ResourceBadge resource={resource.key} shortLabel={resource.shortLabel} />
                        {/*<span className="warehouse-resource-name">{resource.title}</span>*/}
                        <strong className="warehouse-resource-count">{value}</strong>
                      </button>
                      <button
                        type="button"
                        className="sbtn"
                        onClick={() => props.onResourceChange(props.statsPlayer, resource.key, 1)}
                        title={`Добавить ${resource.title}`}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className="sbtn"
                        onClick={() => props.onResourceChange(props.statsPlayer, resource.key, -1)}
                        title={`Убавить ${resource.title}`}
                      >
                        -
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>,
            document.body,
          )
        : null}
    </div>
  )
}
