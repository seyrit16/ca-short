import { useEffect, useMemo, useState } from 'react'
import type { Game, PlayerKey, Unit } from '../types'
import DeckSection from './DeckSection.tsx'
import { BattleWheel } from './BattleWheel.tsx'
import { SecretChest } from './SecretChest.tsx'

interface RightUtilityPanelProps {
  game: Game
  currentPlayer: PlayerKey
  onMonsterChange: (field: 'name' | 'hp' | 'attack' | 'defense', value: string | number) => void
  onApplyMonsterDamage: (amount: number, mode: 'normal' | 'crit' | 'vulnerable') => void
  onApplyCombatAttack: (payload: {
    attackerId: string | 'monster'
    defenderId: string | 'monster'
    mode: 'normal' | 'crit' | 'vulnerable'
    critPercent: number
  }) => void
  onApplySecret: (secret: string, stage: 1 | 2 | 3) => void
  onDeckDraw: () => void
  onDeckReset: () => void
  onDiceRolled: (results: number[], total: number, sides: number) => void
  onWheelSpun: (result: string) => void
  onSecretOpened: (result: string) => void
}

type CombatMode = 'normal' | 'crit' | 'vulnerable'

const diceKinds = [4, 6, 8, 10, 12, 20, 100]

function randomCritPercent(): number {
  return Math.floor(Math.random() * 100) + 1
}

function unitIcon(unit: Unit): string {
  if (unit.icon) return unit.icon
  return unit.player === 'player2' ? '/assets/characters/2.png' : '/assets/characters/1.png'
}

function dieColorClass(sides: number): string {
  return `die-color-${sides}`
}

export function RightUtilityPanel(props: RightUtilityPanelProps) {
  const [dicePool, setDicePool] = useState<number[]>([])
  const [diceRolls, setDiceRolls] = useState<Array<{ sides: number; value: number }>>([])

  const [combatMode, setCombatMode] = useState<CombatMode | null>(null)
  const [combatTitle, setCombatTitle] = useState('')
  const [attackerId, setAttackerId] = useState<string | 'monster'>('monster')
  const [defenderId, setDefenderId] = useState<string | 'monster'>('monster')
  const [critPercent, setCritPercent] = useState(50)
  const [critRollVisual, setCritRollVisual] = useState(50)
  const [critRollTick, setCritRollTick] = useState(0)

  const extras = props.game.extras
  const monster = extras?.monster ?? { name: 'Монстр', hp: 0, attack: 0, defense: 0 }

  const myUnits = useMemo(
    () => props.game.units.filter((unit) => unit.player === props.currentPlayer && unit.alive),
    [props.game.units, props.currentPlayer],
  )

  const opponentKey: PlayerKey = props.currentPlayer === 'player1' ? 'player2' : 'player1'
  const opponentUnits = useMemo(
    () => props.game.units.filter((unit) => unit.player === opponentKey && unit.alive),
    [props.game.units, opponentKey],
  )

  const attackerOptions: Array<string | 'monster'> = [...myUnits.map((unit) => unit.id), 'monster']

  function defenderOptionsFor(attacker: string | 'monster'): Array<string | 'monster'> {
    if (attacker === 'monster') {
      return myUnits.map((unit) => unit.id)
    }
    return [...opponentUnits.map((unit) => unit.id), 'monster']
  }

  const defenderOptions = defenderOptionsFor(attackerId)

  useEffect(() => {
    if (!defenderOptions.includes(defenderId)) {
      setDefenderId((defenderOptions[0] ?? 'monster') as string | 'monster')
    }
  }, [attackerId, defenderId, defenderOptions])

  const diceTotal = useMemo(() => diceRolls.reduce((acc, item) => acc + item.value, 0), [diceRolls])

  const attackerStats = getEntityStats(attackerId, myUnits, opponentUnits, monster)
  const defenderStats = getEntityStats(defenderId, myUnits, opponentUnits, monster)

  const computedAttack = useMemo(() => {
    if (!combatMode || !attackerStats || !defenderStats) {
      return null
    }

    const baseDamage = Math.max(0, attackerStats.attack)
    const totalDamage = combatMode === 'crit' ? Math.round(baseDamage * (1 + critPercent / 100)) : baseDamage

    if (combatMode === 'vulnerable') {
      const hpLoss = Math.min(defenderStats.hp, totalDamage)
      return {
        totalDamage,
        defenseLoss: 0,
        hpLoss,
        nextDefense: defenderStats.defense,
        nextHp: Math.max(0, defenderStats.hp - hpLoss),
      }
    }

    const defenseLoss = Math.min(defenderStats.defense, totalDamage)
    const hpLoss = Math.min(defenderStats.hp, totalDamage - defenseLoss)
    return {
      totalDamage,
      defenseLoss,
      hpLoss,
      nextDefense: Math.max(0, defenderStats.defense - defenseLoss),
      nextHp: Math.max(0, defenderStats.hp - hpLoss),
    }
  }, [combatMode, attackerStats, defenderStats, critPercent])

  function addDieToPool(sides: number): void {
    setDicePool((prev) => [...prev, sides])
  }

  function removeDieFromPool(index: number): void {
    setDicePool((prev) => prev.filter((_, idx) => idx !== index))
  }

  function rollDicePool(): void {
    if (dicePool.length === 0) return

    const rolls = dicePool.map((sides) => ({ sides, value: Math.floor(Math.random() * sides) + 1 }))
    setDiceRolls(rolls)
    const total = rolls.reduce((acc, item) => acc + item.value, 0)
    props.onDiceRolled(
      rolls.map((item) => item.value),
      total,
      0,
    )
  }

  function openCombatPopup(mode: CombatMode, title: string): void {
    setCombatMode(mode)
    setCombatTitle(title)

    const defaultAttacker = myUnits[0]?.id ?? 'monster'
    const targets = defenderOptionsFor(defaultAttacker)
    const nextCrit = randomCritPercent()
    setAttackerId(defaultAttacker)
    setDefenderId((targets[0] ?? 'monster') as string | 'monster')
    setCritPercent(nextCrit)
    setCritRollVisual(nextCrit)
    setCritRollTick(0)
  }

  function closeCombatPopup(): void {
    setCombatMode(null)
  }

  function rollCritDie(): void {
    const nextCrit = randomCritPercent()
    setCritPercent(nextCrit)
    setCritRollVisual(nextCrit)
    setCritRollTick((value) => value + 1)
  }

  function handleWheelResult(result: string): void {
    props.onWheelSpun(result)

    if (result === 'Атака прошла') {
      openCombatPopup('normal', result)
      return
    }
    if (result === 'Крит. урон') {
      openCombatPopup('crit', result)
      return
    }
    if (result === 'Удар в уязвимую зону') {
      openCombatPopup('vulnerable', result)
      return
    }
  }

  function applyCombat(): void {
    if (!combatMode || !attackerStats || !defenderStats) return
    props.onApplyCombatAttack({
      attackerId,
      defenderId,
      mode: combatMode,
      critPercent,
    })
    closeCombatPopup()
  }

  return (
    <aside className="panel game-right">
      <h2>Утилиты</h2>

      <DeckSection
        deck={props.game.extras?.deck ?? {
          current: null,
          remaining: [],
          history: [],
          discard: [],
        }}
        onDeckDraw={props.onDeckDraw}
        onDeckReset={props.onDeckReset}
      />



      <section className="util-card">
        <h3>Кубики</h3>

        <div className="dice-types-row">
          {diceKinds.map((sides) => (
            <button
              key={sides}
              onClick={() => addDieToPool(sides)}
              title={`Добавить d${sides}`}
              className={`die-kind-btn ${dieColorClass(sides)}`}
            >
              d{sides}
            </button>
          ))}
        </div>

        <div className="row wrap">
          <button onClick={rollDicePool} disabled={dicePool.length === 0}>
            Бросить
          </button>
          <button onClick={() => setDicePool([])} disabled={dicePool.length === 0}>
            Очистить пул
          </button>
        </div>

        <div className="dice-pool-row">
          {dicePool.length === 0 ? <span className="muted">Пул пуст</span> : null}
          {dicePool.map((sides, index) => (
            <button
              key={`${sides}-${index}`}
              className={`die-chip ${dieColorClass(sides)}`}
              onClick={() => removeDieFromPool(index)}
              title="Убрать кубик"
            >
              d{sides}
            </button>
          ))}
        </div>

        <div className="dice-results">
          {diceRolls.map((item, index) => (
            <span key={`${item.sides}-${item.value}-${index}`} className={`die ${dieColorClass(item.sides)}`}>
              {item.value}
            </span>
          ))}
          {diceRolls.length > 0 && <strong>Σ {diceTotal}</strong>}
        </div>
      </section>

      <section className="util-card">
        <h3>Монстр</h3>
        <div className="monster-top">
          <img src="/assets/monster.png" alt="monster" className="monster-icon" />
          <strong>{monster.name}</strong>
        </div>

        <div className="stats-grid monster-stats">
          <div className="stat-box">
            <span className="stat-sym" style={{ color: 'red' }}>♥</span>
            <span className="stat-lbl">HP</span>
            <div className="stat-row">
              <input type="number"
                     style={{ fontWeight: 'bold' }} value={monster.hp} onChange={(e) => props.onMonsterChange('hp', Number(e.target.value))} />
            </div>
          </div>
          <div className="stat-box">
            <span className="stat-sym" style={{ color: 'green' }}>♣</span>
            <span className="stat-lbl">Атака</span>
            <div className="stat-row">
              <input
                  type="number"
                  value={monster.attack}
                  style={{ fontWeight: 'bold' }}
                  onChange={(e) => props.onMonsterChange('attack', Number(e.target.value))}
              />
            </div>
          </div>
          <div className="stat-box">
            <span className="stat-sym" style={{ color: 'purple' }}>♠</span>
            <span className="stat-lbl">Защита</span>
            <div className="stat-row">
              <input
                  type="number"
                  value={monster.defense}
                  style={{ fontWeight: 'bold'}}
                  onChange={(e) => props.onMonsterChange('defense', Number(e.target.value))}
              />
            </div>
          </div>
        </div>
      </section>

      <BattleWheel onSpinResult={(result) => handleWheelResult(result)} />

      {combatMode ? (
        <div className="combat-modal-backdrop" onClick={closeCombatPopup}>
          <section className="panel combat-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{combatTitle}</h3>

            <div className="combat-pick-group">
              <div className="mini-heading">Кто бьёт</div>
              <div className="combat-icon-row">
                {attackerOptions.map((id) => {
                  const stats = getEntityStats(id, myUnits, opponentUnits, monster)
                  const icon = entityIcon(id, myUnits, opponentUnits)
                  if (!stats) return null
                  return (
                    <button
                      key={`atk-${id}`}
                      className={`combat-icon-card ${id === attackerId ? 'active' : ''}`}
                      onClick={() => setAttackerId(id)}
                      type="button"
                    >
                      <img src={icon} alt={stats.name} className="combat-icon" />
                      <div className="combat-icon-name">{stats.name}</div>
                      <small className="combat-icon-stats">
                        ♥ {stats.hp} | ♣ {stats.attack} | ♠ {stats.defense}
                      </small>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="combat-pick-group">
              <div className="mini-heading">Кого бьют</div>
              <div className="combat-icon-row">
                {defenderOptions.map((id) => {
                  const stats = getEntityStats(id, myUnits, opponentUnits, monster)
                  const icon = entityIcon(id, myUnits, opponentUnits)
                  if (!stats) return null
                  return (
                    <button
                      key={`def-${id}`}
                      className={`combat-icon-card ${id === defenderId ? 'active' : ''}`}
                      onClick={() => setDefenderId(id)}
                      type="button"
                    >
                      <img src={icon} alt={stats.name} className="combat-icon" />
                      <div className="combat-icon-name">{stats.name}</div>
                      <small className="combat-icon-stats">
                        ♥ {stats.hp} | ♣ {stats.attack} | ♠ {stats.defense}
                      </small>
                    </button>
                  )
                })}
              </div>
            </div>

            {combatMode === 'crit' ? (
              <div className="crit-roll-area">
                <button onClick={rollCritDie} type="button">
                  Бросить крит-кубик
                </button>
                <div key={critRollTick} className="crit-die" title="Шанс критического урона">
                  {critRollVisual}%
                </div>
              </div>
            ) : null}

            {computedAttack ? (
              <div className="util-card combat-preview">
                <div>Урон: {computedAttack.totalDamage}</div>
                <div>В защиту: -{computedAttack.defenseLoss}</div>
                <div>В HP: -{computedAttack.hpLoss}</div>
                <div>Итог DEF: {computedAttack.nextDefense}</div>
                <div>Итог HP: {computedAttack.nextHp}</div>
              </div>
            ) : null}

            <div className="row wrap combat-modal-actions">
              <button onClick={applyCombat} disabled={!computedAttack}>
                Атаковать
              </button>
              <button onClick={closeCombatPopup}>Отмена</button>
            </div>
          </section>
        </div>
      ) : null}

      <SecretChest
        onSecretApply={(secretType, stage) => {
          props.onApplySecret(secretType, stage)
          props.onSecretOpened(secretType)
        }}
      />

      <p className="muted">Активный игрок: {props.currentPlayer}</p>
    </aside>
  )
}

function entityIcon(id: string | 'monster', myUnits: Unit[], enemyUnits: Unit[]): string {
  if (id === 'monster') return '/assets/monster.png'
  const unit = [...myUnits, ...enemyUnits].find((entry) => entry.id === id)
  if (!unit) return '/assets/characters/1.png'
  return unitIcon(unit)
}

function getEntityStats(
  id: string | 'monster',
  myUnits: Unit[],
  enemyUnits: Unit[],
  monster: { name: string; hp: number; attack: number; defense: number },
): { name: string; hp: number; attack: number; defense: number } | null {
  if (id === 'monster') {
    return { name: monster.name, hp: monster.hp, attack: monster.attack, defense: monster.defense }
  }

  const unit = [...myUnits, ...enemyUnits].find((entry) => entry.id === id)
  if (!unit) return null
  return { name: unit.name, hp: unit.hp, attack: unit.attack, defense: unit.defense }
}
