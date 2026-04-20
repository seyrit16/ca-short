import {useEffect, useMemo, useRef, useState} from 'react'
import type { Game, PlayerKey, Unit } from '../types'
import DeckSection from './DeckSection.tsx'
import { BattleWheel } from './BattleWheel.tsx'
import { SecretChest } from './SecretChest.tsx'
import {RandomDropPopup, type RandomDropPopupRef} from "./RandomDropPopup.tsx";

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

const diceKinds = [4, 5, 6, 8, 10, 12, 20, 100]
const musicTracks = [
    '/assets/music/Battle_OST_1_CHAD.mp3',
    '/assets/music/Battle_OST_2_CHAD.mp3',
    '/assets/music/ambient_CHAD.mp3',
    '/assets/music/CHAD_bgm_chiptune.mp3'
]
const musicVolumeStorageKey = 'ca_music_volume'

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
  const [healAmount, setHealAmount] = useState(5)
  const [percentBase, setPercentBase] = useState(100)
  const [percentValue, setPercentValue] = useState(10)
  const [musicEnabled, setMusicEnabled] = useState(false)
  const [musicMode, setMusicMode] = useState<'ordered' | 'random'>('ordered')
  const [musicIndex, setMusicIndex] = useState(0)
  const [musicVolume, setMusicVolume] = useState(() => {
    const raw = localStorage.getItem(musicVolumeStorageKey)
    const parsed = raw ? Number(raw) : 0.35
    if (!Number.isFinite(parsed)) return 0.35
    return Math.min(1, Math.max(0, parsed))
  })

  const dropPopupRef = useRef<RandomDropPopupRef>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null)

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

  useEffect(() => {
    const audio = new Audio(musicTracks[0])
    audio.preload = 'auto'
    audio.volume = musicVolume
    audioRef.current = audio

    const onEnded = () => {
      setMusicIndex((prev) => {
        if (musicTracks.length <= 1) return prev
        if (musicMode === 'random') {
          const nextChoices = musicTracks
            .map((_, index) => index)
            .filter((index) => index !== prev)
          const randomIndex = Math.floor(Math.random() * nextChoices.length)
          return nextChoices[randomIndex] ?? prev
        }
        return (prev + 1) % musicTracks.length
      })
    }

    audio.addEventListener('ended', onEnded)
    return () => {
      audio.pause()
      audio.removeEventListener('ended', onEnded)
      audioRef.current = null
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = musicVolume
    localStorage.setItem(musicVolumeStorageKey, String(musicVolume))
  }, [musicVolume])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const nextSrc = musicTracks[musicIndex] ?? musicTracks[0]
    if (audio.src.endsWith(nextSrc) === false) {
      audio.src = nextSrc
      audio.load()
    }
    if (!musicEnabled) {
      audio.pause()
      return
    }
    audio.loop = true
    void audio.play().catch(() => {
      setMusicEnabled(false)
    })
  }, [musicEnabled, musicIndex])

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
  const percentResult = useMemo(() => {
    const base = Number(percentBase) || 0
    const percent = Number(percentValue) || 0
    return (base * percent) / 100
  }, [percentBase, percentValue])

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

    const myUnitIcons = myUnits.map((unit) => unitIcon(unit))
    const popupIcons = myUnitIcons.length > 0 ? myUnitIcons : ['/assets/characters/1.png']

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
    if (result === 'Блок') {
      dropPopupRef.current?.show({
        imagePaths: popupIcons,
        messages: ['Блок!'],
      })
      return
    }
    if (result === 'Контратака') {
      dropPopupRef.current?.show({
        imagePaths: popupIcons,
        messages: ['Контратака!'],
      })
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

    const icon: string = entityIcon(defenderId, myUnits, opponentUnits)
    dropPopupRef.current?.show({
      imagePaths: [icon],
      messages: [
        "Чёрт тебя дери, это же больно!",
        "Сукин сын! Ты мне рёбра пересчитал!",
        "Да провались ты в преисподнюю!",
        "Тысяча чертей! Это была моя любимая кольчуга!",
        "Дьявол тебя забери вместе с твоим мечом!",
        "Клянусь адом, ты за это поплатишься!",
        "Кровь и кишки! Это же глубокая рана!",

        "Это... было намеренно. Я проверял твою реакцию.",
        "Хорошо что у меня есть ещё одна почка!",
        "Портной возьмёт с меня вдвойне за эту дыру...",
        "Моя мать и то сильнее бьёт!",
        "Интересный способ знакомства...",
        "Ах, красная — мой любимый цвет одежды.",
        "Записываю в список обид. Он уже длиннее твоего меча.",
        "Больно? Нет-нет... просто слеза от радости.",

        "Господь, прими мою душу... нет, подожди, рано ещё.",
        "Ранен, но не сломлен!",
        "Плоть слаба, но дух мой несокрушим!",
        "За это... ты ответишь кровью.",
        "Я чувствую как жизнь покидает меня... медленно...",

        "Зубы Господни, это задело кость!",
        "Проклятье... мне нужен лекарь.",
        "Неплохой удар. Больше такого не получишь.",
        "Хватит болтать — у меня времени немного.",
        "Царапина. Я видал хуже.",
      ],
    })
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
        onSecretApply={(secretType, stage) => props.onApplySecret(secretType, stage)}
        onSecretOpened={(secretTitle) => props.onSecretOpened(secretTitle)}
      />

      <section className="util-card">
        <h3>Лечение (Drag & Drop)</h3>
        <p className="muted">Перетащите кнопку лечения на карточку персонажа в левой панели.</p>
        <div className="row wrap">
          <button
            type="button"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'copy'
              event.dataTransfer.setData('application/x-ca-heal', JSON.stringify({ mode: 'full' }))
            }}
            title="Полное лечение"
          >
            ❤️ Полное
          </button>
          <input
            type="number"
            min={1}
            value={healAmount}
            onChange={(event) => setHealAmount(Math.max(1, Number(event.target.value) || 1))}
            title="Лечение на число"
          />
          <button
            type="button"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'copy'
              event.dataTransfer.setData('application/x-ca-heal', JSON.stringify({ mode: 'fixed', amount: healAmount }))
            }}
            title="Лечение на число"
          >
            ❤️ +{healAmount}
          </button>
        </div>
      </section>



      <section className="util-card">
        <h3>Калькулятор процентов</h3>
        <div className="row wrap">
          <input
            type="number"
            value={percentBase}
            onChange={(event) => setPercentBase(Number(event.target.value) || 0)}
            title="Число"
            placeholder="Число"
          />
          <input
            type="number"
            value={percentValue}
            onChange={(event) => setPercentValue(Number(event.target.value) || 0)}
            title="Процент"
            placeholder="%"
          />
          <input type="number" value={Number(percentResult.toFixed(2))} readOnly title="Ответ" placeholder="Ответ" />
        </div>
        <RandomDropPopup ref={dropPopupRef} />
      </section>

      <section className="util-card">
        <h3>Музыка</h3>
        <div className="row wrap music-controls">
          <button type="button" onClick={() => setMusicEnabled((prev) => !prev)}>
            {musicEnabled ? 'Пауза' : 'Играть'}
          </button>
          <button
              type="button"
              onClick={() => setMusicMode((prev) => (prev === 'ordered' ? 'random' : 'ordered'))}
              title="Режим переключения треков"
          >
            Режим: {musicMode === 'ordered' ? 'По порядку' : 'Рандом'}
          </button>
          <button
              type="button"
              onClick={() => setMusicIndex((prev) => (prev + 1) % musicTracks.length)}
              title="Следующий трек"
          >
            Следующий
          </button>
        </div>
        <label className="music-volume-row">
          <span>Громкость: {Math.round(musicVolume * 100)}%</span>
          <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={musicVolume}
              onChange={(event) => setMusicVolume(Number(event.target.value))}
          />
        </label>
      </section>

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
