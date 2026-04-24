import React, { useRef, useState } from 'react'
import { RandomDropPopup } from './RandomDropPopup'
import type { RandomDropPopupRef } from './RandomDropPopup'

type SecretType = 'buff' | 'debuff' | 'buffdebuff' | 'teleport' | 'heal' | 'poison' | 'camp' | 'provocation' | 'egoStrike'
type Stage = 1 | 2 | 3

interface SecretDef {
  type: SecretType
  icon: string
  title: string
  color: string
  desc: string
}

interface WeightedSecret {
  type: SecretType
  chance: number
}

const SECRET_MAP: Record<SecretType, SecretDef> = {
  buff: {
    type: 'buff',
    icon: '⬆️',
    title: 'Бафф',
    color: '#7abd50',
    desc: 'Тяните карту характеристик и передайте ее персонажу, который получил секрет.',
  },
  debuff: {
    type: 'debuff',
    icon: '⬇️',
    title: 'Дебафф',
    color: '#c05050',
    desc: 'Тяните карту характеристик и уменьшите соответствующую характеристику выбранного персонажа.',
  },
  buffdebuff: {
    type: 'buffdebuff',
    icon: '🔃',
    title: 'Бафф + Дебафф',
    color: '#daa520',
    desc: 'Тяните 2 карты: первая увеличивает, вторая уменьшает характеристики.',
  },
  teleport: {
    type: 'teleport',
    icon: '🌀',
    title: 'Телепорт',
    color: '#7ab0ff',
    desc: 'Добавьте предмет телепорта в склад текущего игрока.',
  },
  heal: {
    type: 'heal',
    icon: '❤️',
    title: 'Лечение',
    color: '#5a9a5a',
    desc: 'Добавьте предмет лечения в склад текущего игрока.',
  },
  poison: {
    type: 'poison',
    icon: '☠️',
    title: 'Яд',
    color: '#aa2828',
    desc: "Персонаж достал из сундука колбу. Выпил, оказалось это моча. Бросьте D6 - это моральный урон который" +
        " он" +
        " получил (сначала снимается защита)",
  },
  camp: {
    type: 'camp',
    icon: '🔥',
    title: 'Лагерь',
    color: '#ff9800',
    desc: 'Добавьте предмет лагеря в склад текущего игрока.',
  },
  provocation: {
    type: 'provocation',
    icon: '🎭',
    title: 'Провокация',
    color: '#f3ba4d',
    desc: 'Наложите статус «Провокация» на выбранного союзника.',
  },
  egoStrike: {
    type: 'egoStrike',
    icon: '🗡️',
    title: 'Эго-удар',
    color: '#c267d3',
    desc: 'Наложите статус «Эгоист» на выбранного союзника.',
  },
}

const STAGE_1_TABLE: WeightedSecret[] = [
  { type: 'buff', chance: 30 },
  { type: 'debuff', chance: 15 },
  { type: 'buffdebuff', chance: 10 },
  { type: 'teleport', chance: 5 },
  { type: 'heal', chance: 20 },
  { type: 'poison', chance: 15 },
  { type: 'camp', chance: 5 },
]

const STAGE_2_3_TABLE: WeightedSecret[] = [
  { type: 'buff', chance: 25 },
  { type: 'debuff', chance: 10 },
  { type: 'buffdebuff', chance: 10 },
  { type: 'teleport', chance: 5 },
  { type: 'heal', chance: 15 },
  { type: 'poison', chance: 10 },
  { type: 'camp', chance: 5 },
  { type: 'provocation', chance: 10 },
  { type: 'egoStrike', chance: 10 },
]

interface SecretChestProps {
  onSecretApply?: (secretType: SecretType, stage: Stage) => void
  onSecretOpened?: (secretTitle: string) => void
}

function pickWeightedSecret(stage: Stage): SecretDef {
  const table = stage === 1 ? STAGE_1_TABLE : STAGE_2_3_TABLE
  const total = table.reduce((sum, item) => sum + item.chance, 0)
  const roll = Math.random() * total
  let acc = 0
  for (const item of table) {
    acc += item.chance
    if (roll <= acc) return SECRET_MAP[item.type]
  }
  return SECRET_MAP[table[table.length - 1].type]
}

function isStockSecret(type: SecretType): boolean {
  return type === 'heal' || type === 'buffdebuff' || type === 'provocation' || type === 'egoStrike'
}

function isDragItemSecret(type: SecretType): boolean {
  return type === 'camp' || type === 'teleport'
}

export const SecretChest: React.FC<SecretChestProps> = ({ onSecretApply, onSecretOpened }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [currentSecret, setCurrentSecret] = useState<SecretDef | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [stage, setStage] = useState<Stage>(1)
  const [isSecretApplied, setIsSecretApplied] = useState(false)
  const dropRef = useRef<RandomDropPopupRef>(null)

  const openChest = () => {
    if (isAnimating) return

    setIsAnimating(true)
    setIsOpen(true)

    const secret = pickWeightedSecret(stage)
    setCurrentSecret(secret)
    setIsSecretApplied(false)
    onSecretOpened?.(secret.title)

    // dropRef.current?.show({
    //   imagePaths: ['/assets/characters/bat.png', "/assets/characters/1.png"],
    //   messages: ['Крит!', 'Успех!'],
    //   coords: { top: 12, right: 950 },
    //   autoCloseMs: 5000,
    // })

    setTimeout(() => {
      setIsAnimating(false)
    }, 100)
  }

  const closeSecret = () => {
    setIsOpen(false)
    setTimeout(() => {
      setCurrentSecret(null)
      setIsSecretApplied(false)
    }, 100)
  }

  function handleAddToStock(): void {
    if (!currentSecret || isSecretApplied) return
    onSecretApply?.(currentSecret.type, stage)
    setIsSecretApplied(true)
  }

  return (
    <section className="util-card">
      <h3>Сундук с секретом</h3>

      <div className="secret-stage-row">
        <span className="muted">Этап:</span>
        <div className="secret-stage-buttons">
          {[1, 2, 3].map((value) => (
            <button
              key={value}
              type="button"
              className={stage === value ? 'active' : ''}
              onClick={() => setStage(value as Stage)}
              title={`Этап ${value}`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className="chest-area">
        <div className={`chest-stage ${isOpen ? 'open' : ''}`} id="chestStage">
          <div className={`secret-card ${isOpen ? 'launch' : ''}`}>
            {currentSecret ? (
              <>
                <div className="secret-card-head">
                  <div className="secret-icon" style={{ color: currentSecret.color }}>
                    {currentSecret.icon}
                  </div>
                  <div className="secret-title" style={{ color: currentSecret.color }}>
                    {currentSecret.title}
                  </div>
                </div>
                <div className="secret-desc">{currentSecret.desc}</div>
                <div className="secret-actions">
                  {isStockSecret(currentSecret.type) ? (
                    <button type="button" className="secret-action-btn" onClick={handleAddToStock} disabled={isSecretApplied}>
                      {isSecretApplied ? 'Добавлено' : 'Добавить на склад'}
                    </button>
                  ) : null}
                  {isDragItemSecret(currentSecret.type) ? (
                    <button
                      type="button"
                      className="secret-action-btn"
                      draggable
                      title="Перетащите на карточку персонажа"
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'copy'
                        event.dataTransfer.setData(
                          'application/x-ca-secret-item',
                          JSON.stringify({ item: currentSecret.type === 'camp' ? 'camp' : 'teleport' }),
                        )
                      }}
                    >
                      Перетащить на персонажа
                    </button>
                  ) : null}
                </div>
                <button className="secret-close" onClick={closeSecret}>
                  Закрыть
                </button>
              </>
            ) : null}
          </div>

          <div className="chest-container" onClick={openChest}>
            <div className={`chest ${isOpen ? 'open' : ''}`}>
              <div className="chest-lid"></div>
              <div className="chest-base"></div>
              <div className="chest-lock"></div>
              <div className="chest-spark"></div>
            </div>
            <div className="chest-label">Открыть сундук</div>
          </div>
        </div>
      </div>
      <RandomDropPopup ref={dropRef} />
    </section>
  )
}
