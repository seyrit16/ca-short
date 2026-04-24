import { useCallback, useEffect, useRef, useState } from 'react'
import { API } from './api/gameApi'
import { BoardPanel } from './components/BoardPanel'
import { HomeScreen } from './components/HomeScreen'
import { LeftGamePanel } from './components/LeftGamePanel'
import { MapToolbar } from './components/MapToolbar'
import { RightUtilityPanel } from './components/RightUtilityPanel'
import { objectTools } from './constants/ui'
import type { CaptureMode, DeckCard, Game, GameSummary, ObjectType, PlayerKey, Position, ToolType } from './types'
import { GameUtils } from './utils/gameUtils'
import './styles/theme.css'
import './styles/layout.css'
import './styles/panels.css'
import './styles/board.css'
import './styles/deckSection.css'
import './styles/battleWheel.css'
import './styles/secretChest.css'
import {RandomDropPopup, type RandomDropPopupRef} from "./components";
import {BattlePanel} from "./components/BattlePanel.tsx";

const musicTracks = [
  '/assets/music/CHAD_bgm_chiptune.mp3',
  '/assets/music/ambient_CHAD.mp3',
  '/assets/music/Battle_OST_1_CHAD.mp3',
  '/assets/music/Battle_OST_2_CHAD.mp3',
    '/assets/music/T3_Monster-Fight_OST.mp3'
]

const battleMusicTracks = [
  '/assets/music/T3_Monster-Fight_OST.mp3',
  '/assets/music/Battle_OST_1_CHAD.mp3',
  '/assets/music/Battle_OST_2_CHAD.mp3',
]
const musicVolumeStorageKey = 'ca_music_volume'

type ViewMode = 'home' | 'game'
const sessionKey = 'ca_active_session'

function cloneGame(game: Game): Game {
  return JSON.parse(JSON.stringify(game)) as Game
}

function App() {
  const SAVE_DEBOUNCE_MS = 180
  const [viewMode, setViewMode] = useState<ViewMode>('home')
  const [games, setGames] = useState<GameSummary[]>([])
  const [game, setGame] = useState<Game | null>(null)
  const [currentPlayer, setCurrentPlayer] = useState<PlayerKey>('player1')
  const [statsPlayer, setStatsPlayer] = useState<PlayerKey>('player1')
  const [sessionName, setSessionName] = useState('')
  const [player1Name, setPlayer1Name] = useState('Игрок 1')
  const [player2Name, setPlayer2Name] = useState('Игрок 2')
  const [maxTurns, setMaxTurns] = useState(20)
  const [numCharacters, setNumCharacters] = useState(4)
  const [color, setColor] = useState(GameUtils.COLORS[0])
  const [selectedTool, setSelectedTool] = useState<ToolType>('select')
  const [captureMode, setCaptureMode] = useState<CaptureMode>('none')
  const [mapZoom, setMapZoom] = useState(1)
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null)
  const [pathCells, setPathCells] = useState<Position[]>([])
  const [genCount, setGenCount] = useState(5)
  const [toolbarOpen, setToolbarOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [topNotice, setTopNotice] = useState('')
  const [lastSeenEventTs, setLastSeenEventTs] = useState(0)
  const gameRef = useRef<Game | null>(null)
  const pendingMutationsRef = useRef<Array<(draft: Game) => boolean>>([])
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFlushingSaveRef = useRef(false)
  const [isBoard, setIsBoard] = useState(true)
  const dropMessageRef = useRef<RandomDropPopupRef>(null)

  // Music state
  const [musicEnabled, setMusicEnabled] = useState(false)
  const [musicMode, setMusicMode] = useState<'ordered' | 'random'>('ordered')
  const [musicIndex, setMusicIndex] = useState(0)
  const [activeTracks, setActiveTracks] = useState<string[]>(musicTracks)
  const activeTracksRef = useRef<string[]>(musicTracks)
  useEffect(() => { activeTracksRef.current = activeTracks }, [activeTracks])
  const [musicDropdownOpen, setMusicDropdownOpen] = useState(false)
  const [musicVolume, setMusicVolume] = useState(() => {
    const raw = localStorage.getItem(musicVolumeStorageKey)
    const parsed = raw ? Number(raw) : 0.35
    if (!Number.isFinite(parsed)) return 0.35
    return Math.min(1, Math.max(0, parsed))
  })
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const musicModeRef = useRef(musicMode)
  const musicVolumeRef = useRef(musicVolume)

  // Keep refs in sync with state
  useEffect(() => { musicModeRef.current = musicMode }, [musicMode])
  useEffect(() => { musicVolumeRef.current = musicVolume }, [musicVolume])

  useEffect(() => {
    void loadGames()
    void restoreSession()
  }, [])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  useEffect(() => {
    gameRef.current = game
  }, [game])

  useEffect(() => {
    if (viewMode !== 'game' || !game) return

    const gameName = game.name
    const wsLogPrefix = `[WS][${gameName}]`
    let socket: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let reconnectAttempt = 0
    let isDisposed = false

    const connect = () => {
      if (isDisposed) return
      const wsUrl = API.wsUrl(gameName)
      console.info(`${wsLogPrefix} CONNECTING`, { wsUrl, reconnectAttempt })
      socket = new WebSocket(wsUrl)

      socket.onopen = () => {
        console.info(`${wsLogPrefix} OPEN`)
        reconnectAttempt = 0
      }

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as {
            type?: string
            gameName?: string
            game?: Game
          }

          if (payload.type === 'game:deleted' && payload.gameName === gameName) {
            setViewMode('home')
            clearSession()
            showError(`Игра "${gameName}" удалена`)
            return
          }

          if (payload.type !== 'game:update' || payload.gameName !== gameName || !payload.game) return
          payload.game.extras = GameUtils.ensureExtras(payload.game)

          setGame((prev) => {
            if (!prev) return payload.game as Game
            if (pendingMutationsRef.current.length === 0) return payload.game as Game
            const prevUpdated = prev.updatedAt ?? 0
            const nextUpdated = payload.game?.updatedAt ?? 0
            if (nextUpdated > prevUpdated) return payload.game as Game
            return prev
          })
        } catch {
          // no-op
        }
      }

      socket.onclose = () => {
        console.info(`${wsLogPrefix} CLOSE`, { reconnectAttempt })
        if (isDisposed) return
        reconnectAttempt = Math.min(reconnectAttempt + 1, 10)
        const delay = Math.min(3000, reconnectAttempt * 300)
        console.info(`${wsLogPrefix} RECONNECT_SCHEDULED`, { delay, reconnectAttempt })
        reconnectTimer = setTimeout(connect, delay)
      }

      socket.onerror = (event) => {
        console.error(`${wsLogPrefix} ERROR`, event)
      }
    }

    connect()

    return () => {
      isDisposed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (socket) {
        socket.onclose = null
        socket.close()
      }
    }
  }, [viewMode, game?.name])

  useEffect(() => {
    if (!game) return
    const events = game.events ?? []
    const incoming = events.filter((event) => event.player !== currentPlayer && event.timestamp > lastSeenEventTs)
    if (incoming.length === 0) return

    const latest = incoming[incoming.length - 1]
    setTopNotice(latest.message)
    setLastSeenEventTs(latest.timestamp)
    const timer = setTimeout(() => setTopNotice(''), 5000)
    return () => clearTimeout(timer)
  }, [game?.events, currentPlayer, lastSeenEventTs, game])

  const finalizePendingMovement = useCallback(() => {
    if (!selectedUnitId || pathCells.length === 0 || !game) return
    const movingUnitId = selectedUnitId
    const plannedPath = [...pathCells]

    setSelectedUnitId(null)
    setPathCells([])

    updateLocal((draft) => {
      const extras = GameUtils.ensureExtras(draft)
      extras.moveState = GameUtils.ensureMoveState(draft, extras.moveState)
      const myResources = extras.resources[currentPlayer]
      const unit = draft.units.find((entry) => entry.id === movingUnitId)
      if (!unit) return false

      const currentPlayerData = draft[currentPlayer]
      if (!currentPlayerData || !myResources) return false

      const destination = plannedPath[plannedPath.length - 1]
      let state = extras.moveState.byUnit[unit.id]
      if (!state) {
        state = { start: { x: unit.x, y: unit.y }, captured: [] }
      }

      let captureBudget = unit.capture
      for (const step of plannedPath) {
        if (captureBudget <= 0) break
        const cell = GameUtils.getCell(draft, step.x, step.y)
        if (!cell || cell.type === 'river' || cell.object || GameUtils.getUnitAt(draft, step.x, step.y)) continue

        if (!cell.capture) {
          cell.capture = { type: 'normal', player: currentPlayer }
          state.captured.push({ x: step.x, y: step.y })
          currentPlayerData.captures.normal += 1
          captureBudget -= 1
          continue
        }

        if (cell.capture.player === currentPlayer || cell.capture.type !== 'normal') continue

        const enemy = draft[cell.capture.player]
        if (!enemy) continue
        enemy.captures.normal = Math.max(0, enemy.captures.normal - 1)
        cell.capture = { type: 'normal', player: currentPlayer }
        currentPlayerData.captures.normal += 1
        captureBudget -= 1
      }

      plannedPath.forEach((step) => {
        const cell = GameUtils.getCell(draft, step.x, step.y)
        if (!cell?.object) return
        if (cell.object.type === 'monster') {
          cell.object = null
          return
        }
        if (cell.object.type === 'chest') {
          cell.object = null
          return
        }
        if (cell.object.type === 'tree' && !cell.capture) {
          cell.object = null
          myResources.trees += 1
        }
      })

      unit.capture = captureBudget
      unit.x = destination.x
      unit.y = destination.y

      extras.moveState.byUnit[unit.id] = state
      draft.extras = extras
      GameUtils.calculateTerritory(draft)
      return true
    })
  }, [selectedUnitId, pathCells, game, currentPlayer, updateLocal])

  // Keyboard shortcuts for game mode
  useEffect(() => {
    if (viewMode !== 'game') return

    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }

      const key = event.key.toLowerCase()

      switch (key) {
        case 'd':
          // Reset tools: select tool and none capture mode
          if (pathCells.length > 0) finalizePendingMovement()
          setSelectedTool('select')
          setCaptureMode('none')
          break
        case 'a':
          // Normal capture mode
          if (pathCells.length > 0) finalizePendingMovement()
          setCaptureMode('normal')
          break
        case 's':
          // Permanent capture mode
          if (pathCells.length > 0) finalizePendingMovement()
          setCaptureMode('permanent')
          break
        case 'q':
        case 'w':
        case 'e':
        case 'r':
        case 't': {
          // Focus on characters by order (Q=1st, W=2nd, E=3rd, R=4th, T=5th)
          if (!game) return
          const unitIndex = ['q', 'w', 'e', 'r', 't'].indexOf(key)
          const playerUnits = game.units.filter((u) => u.player === currentPlayer && u.alive)
          if (unitIndex >= 0 && unitIndex < playerUnits.length) {
            const targetUnit = playerUnits[unitIndex]
            if (targetUnit) {
              setSelectedUnitId(targetUnit.id)
              setPathCells([])
            }
          }
          break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [viewMode, game, currentPlayer, pathCells.length, finalizePendingMovement])

  // Audio initialization
  useEffect(() => {
    const audio = new Audio(musicTracks[0])
    audio.preload = 'auto'
    audio.volume = musicVolume
    audioRef.current = audio

    const onEnded = () => {
      setMusicIndex((prev) => {
        const tracks = activeTracksRef.current
        if (tracks.length <= 1) return 0
        if (musicModeRef.current === 'random') {
          const nextChoices = tracks.map((_, idx) => idx).filter((idx) => idx !== prev)
          return nextChoices[Math.floor(Math.random() * nextChoices.length)] ?? 0
        }
        return (prev + 1) % tracks.length
      })
    }

    audio.addEventListener('ended', onEnded)
    return () => {
      audio.pause()
      audio.removeEventListener('ended', onEnded)
      audioRef.current = null
    }
  }, [])

  // Audio controls
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = musicVolume
    localStorage.setItem(musicVolumeStorageKey, String(musicVolume))
  }, [musicVolume])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const tracks = activeTracksRef.current
    const nextSrc = tracks[musicIndex] ?? tracks[0]
    if (nextSrc && !audio.src.endsWith(nextSrc)) {
      audio.src = nextSrc
      audio.load()
    }
    if (!musicEnabled) {
      audio.pause()
      return
    }
    audio.loop = false  // зацикливание через onEnded, не через loop
    void audio.play().catch(() => setMusicEnabled(false))
  }, [musicEnabled, musicIndex, activeTracks])

  function showNotice(message: string): void {
    setError('')
    setNotice(message)
  }

  function showError(message: string): void {
    setNotice('')
    setError(message)
  }

  function saveSession(gameName: string, player: PlayerKey): void {
    localStorage.setItem(sessionKey, JSON.stringify({ gameName, player }))
  }

  function clearSession(): void {
    localStorage.removeItem(sessionKey)
  }

  async function restoreSession(): Promise<void> {
    const raw = localStorage.getItem(sessionKey)
    if (!raw) return

    try {
      const parsed = JSON.parse(raw) as { gameName: string; player: PlayerKey }
      const loaded = await API.getGame(parsed.gameName)
      if (!loaded) {
        clearSession()
        return
      }
      loaded.extras = GameUtils.ensureExtras(loaded)
      pendingMutationsRef.current = []
      setGame(loaded)
      setCurrentPlayer(parsed.player)
      setStatsPlayer(parsed.player)
      setLastSeenEventTs(Date.now())
      setViewMode('game')
    } catch {
      clearSession()
    }
  }

  async function loadGames(): Promise<void> {
    try {
      setGames(await API.getGames())
    } catch {
      showError('Не удалось загрузить список игр')
    }
  }

  function normalizeGameForSave(nextGame: Game): Game {
    const draft = cloneGame(nextGame)
    draft.extras = GameUtils.ensureExtras(draft)
    draft.updatedAt = Date.now()
    return draft
  }

  async function flushPendingSaves(): Promise<void> {
    if (isFlushingSaveRef.current) return
    isFlushingSaveRef.current = true

    try {
      while (pendingMutationsRef.current.length > 0) {
        const queuedMutations = [...pendingMutationsRef.current]
        pendingMutationsRef.current = []
        const currentGame = gameRef.current
        if (!currentGame) break

        try {
          const latest = await API.getGame(currentGame.name)
          if (!latest) {
            showError('Игра не найдена на сервере')
            break
          }
          latest.extras = GameUtils.ensureExtras(latest)
          const merged = cloneGame(latest)
          merged.extras = GameUtils.ensureExtras(merged)

          let changed = false
          queuedMutations.forEach((mutate) => {
            changed = mutate(merged) || changed
          })

          if (!changed) {
            setGame(latest)
            continue
          }

          const normalized = normalizeGameForSave(merged)
          await API.saveGame(normalized)
          setGame(normalized)
        } catch {
          showError('Не удалось сохранить игру')
          pendingMutationsRef.current = [...queuedMutations, ...pendingMutationsRef.current]
          break
        }
      }
    } finally {
      isFlushingSaveRef.current = false
    }
  }

  function queueSave(): void {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void flushPendingSaves()
    }, SAVE_DEBOUNCE_MS)
  }

  async function saveAndSet(nextGame: Game): Promise<void> {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    await flushPendingSaves()

    const normalized = normalizeGameForSave(nextGame)
    setGame(normalized)
    await API.saveGame(normalized)
  }

  function updateLocal(updater: (draft: Game) => boolean): void {
    const base = gameRef.current
    if (!base) return
    const draft = cloneGame(base)
    draft.extras = GameUtils.ensureExtras(draft)
    const changed = updater(draft)
    if (!changed) return
    const normalized = normalizeGameForSave(draft)
    setGame(normalized)
    pendingMutationsRef.current.push(updater)
    queueSave()
  }



  async function handleCreateGame(): Promise<void> {
    if (!sessionName.trim()) {
      showError('Введите название сессии')
      return
    }
    try {
      const created = GameUtils.createGame(sessionName.trim(), maxTurns, color, numCharacters)
      const nextPlayer1Name = player1Name.trim()
      if (nextPlayer1Name) {
        created.player1.name = nextPlayer1Name
      }
      created.extras = GameUtils.ensureExtras(created)
      created.updatedAt = Date.now()
      await API.createGame(created)
      pendingMutationsRef.current = []
      setGame(created)
      setCurrentPlayer('player1')
      setStatsPlayer('player1')
      setLastSeenEventTs(Date.now())
      setSelectedUnitId(null)
      setPathCells([])
      setViewMode('game')
      saveSession(created.name, 'player1')
      await loadGames()
      showNotice(`Игра "${created.name}" создана`)
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Не удалось создать игру')
    }
  }

  async function handleJoin(gameName: string, asPlayer: PlayerKey): Promise<void> {
    try {
      const loaded = await API.getGame(gameName)
      if (!loaded) {
        showError('Игра не найдена')
        return
      }

      let nextGame: Game
      if (asPlayer === 'player2' && !loaded.player2) {
        const joinResponse = await API.joinGame(gameName, color)
        joinResponse.game.extras = GameUtils.ensureExtras(joinResponse.game)
        nextGame = joinResponse.game
      } else {
        loaded.extras = GameUtils.ensureExtras(loaded)
        nextGame = loaded
      }

      const desiredName = (asPlayer === 'player1' ? player1Name : player2Name).trim()
      let renamed = false
      if (desiredName) {
        if (asPlayer === 'player1') {
          if (nextGame.player1.name !== desiredName) {
            nextGame.player1.name = desiredName
            renamed = true
          }
        } else if (nextGame.player2 && nextGame.player2.name !== desiredName) {
          nextGame.player2.name = desiredName
          renamed = true
        }
      }

      if (renamed) {
        nextGame.updatedAt = Date.now()
        await API.saveGame(nextGame)
      }

      setGame(nextGame)
      pendingMutationsRef.current = []
      setCurrentPlayer(asPlayer)
      setStatsPlayer(asPlayer)
      setLastSeenEventTs(Date.now())
      setSelectedUnitId(null)
      setPathCells([])
      setViewMode('game')
      saveSession(gameName, asPlayer)
      showNotice(`Подключено к "${gameName}" как ${asPlayer === 'player1' ? 'Игрок 1' : 'Игрок 2'}`)
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Не удалось подключиться')
    }
  }

  function handleBackHome(): void {
    finalizePendingMovement()
    pendingMutationsRef.current = []
    setViewMode('home')
    clearSession()
  }

  function handleManualSave(): void {
    if (!game) return
    void saveAndSet(game)
      .then(() => showNotice('Игра сохранена'))
      .catch(() => showError('Не удалось сохранить игру'))
  }

  function handleCellClick(x: number, y: number): void {
    if (!game) return

    const unitAtCell = GameUtils.getUnitAt(game, x, y)
      if (selectedTool !== 'select') {
      if (pathCells.length > 0) {
        finalizePendingMovement()
      }
      updateLocal((draft) => {
        if (selectedTool === 'eraser') return GameUtils.removeObject(draft, x, y)
        if (objectTools.includes(selectedTool as ObjectType)) {
          return GameUtils.placeObject(draft, x, y, selectedTool as ObjectType, currentPlayer)
        }
        return false
      })
      return
    }

      if (captureMode !== 'none') {
        if (pathCells.length > 0) {
          finalizePendingMovement()
        }
        updateLocal((draft) => {
          if (captureMode === 'remove') return GameUtils.removeCapture(draft, x, y)
          return GameUtils.captureCell(draft, x, y, captureMode, currentPlayer)
        })
        return
      }

    if (unitAtCell && unitAtCell.player === currentPlayer) {
      if (selectedUnitId && selectedUnitId !== unitAtCell.id && pathCells.length > 0) {
        finalizePendingMovement()
        return
      }
      setSelectedUnitId(unitAtCell.id)
      setPathCells([])
      return
    }

    const activeUnit = selectedUnitId ? game.units.find((unit) => unit.id === selectedUnitId) : null
    if (activeUnit) {
      const lastCell = pathCells.length > 0 ? pathCells[pathCells.length - 1] : { x: activeUnit.x, y: activeUnit.y }
      const isLastClick =
        pathCells.length > 0 && pathCells[pathCells.length - 1].x === x && pathCells[pathCells.length - 1].y === y

      if (isLastClick) {
        finalizePendingMovement()
        return
      }

      const dx = Math.abs(x - lastCell.x)
      const dy = Math.abs(y - lastCell.y)
      const alreadyInPath = pathCells.some((cell) => cell.x === x && cell.y === y)
      if (dx + dy === 1 && !alreadyInPath && GameUtils.isPassable(game, x, y, activeUnit.player)) {
        setPathCells((prev) => [...prev, { x, y }])
      }
    }
  }

  function handleUnitTeleport(unitId: string, x: number, y: number): void {
    if (!game) return
    const unitPreview = game.units.find((entry) => entry.id === unitId)
    if (!unitPreview) return
    if ((unitPreview.items?.teleport ?? 0) <= 0) {
      showError(`У ${unitPreview.name} нет телепортов`)
      return
    }

    updateLocal((draft) => {
      const extras = GameUtils.ensureExtras(draft)
      const myResources = extras.resources[currentPlayer]
      const unit = draft.units.find((entry) => entry.id === unitId)
      if (!unit || unit.player !== currentPlayer || !unit.alive) return false
      if (!myResources) return false
      unit.items ??= { teleport: 0, camp: 0, returnStone: 0 }
      if ((unit.items.teleport ?? 0) <= 0) return false
      if (!GameUtils.isPassable(draft, x, y, unit.player)) return false
      if (GameUtils.getUnitAt(draft, x, y)) return false

      const cell = GameUtils.getCell(draft, x, y)
      if (cell?.object?.type === 'monster') {
        cell.object = null
      } else if (cell?.object?.type === 'chest') {
        cell.object = null
      } else if (cell?.object?.type === 'tree' && !cell.capture) {
        cell.object = null
        myResources.trees += 1
      }

      unit.x = x
      unit.y = y
      unit.items.teleport = Math.max(0, unit.items.teleport - 1)
      setSelectedUnitId(null)
      setPathCells([])
      draft.extras = extras
      return true
    })
  }

  function handleOutsideMapClick(): void {
    setSelectedTool('select')
    setCaptureMode('none')
  }

  function handleEndTurn(): void {
    finalizePendingMovement()

    updateLocal((draft) => {
      if (draft.status === 'ended') return false

      const extras = GameUtils.ensureExtras(draft)
      extras.moveState = { turnKey: `${draft.currentPlayer}:${draft.currentTurn}`, byUnit: {} }
      draft.extras = extras

      draft.currentPlayer = draft.currentPlayer === 'player1' ? 'player2' : 'player1'
      draft.currentTurn += 1

      if (draft.currentTurn > draft.maxTurns) {
        draft.status = 'ended'
        if ((draft.player2?.territory ?? 0) > draft.player1.territory) draft.winner = 'player2'
        else if ((draft.player2?.territory ?? 0) < draft.player1.territory) draft.winner = 'player1'
        else draft.winner = 'tie'
      }

      // draft.units.forEach((unit) => {
      //   if (unit.player === draft.currentPlayer) unit.capture = Math.min(3, unit.capture + 1)
      // })

      setSelectedUnitId(null)
      setPathCells([])
      return true
    })
  }

  function handleGenerate(type: 'trees' | 'chests' | 'monsters'): void {
    finalizePendingMovement()
    if (!game) return
    updateLocal((draft) => {
      const placed = GameUtils.generateObjects(draft, type, Math.max(1, Math.min(50, genCount)))
      if (placed.length > 0) {
        showNotice(`Сгенерировано: ${placed.length}`)
        return true
      }
      return false
    })
  }

  function updateUnitHp(unitId: string, delta: number): void {
    updateLocal((draft) => {
      const unit = draft.units.find((entry) => entry.id === unitId)
      if (!unit) return false
      unit.hp = Math.max(0, Math.min(unit.maxHp, unit.hp + delta))
      unit.alive = unit.hp > 0
      return true
    })
  }

  function updateUnitStat(unitId: string, stat: 'attack' | 'defense' | 'capture' | 'maxHp', delta: number): void {
    updateLocal((draft) => {
      const unit = draft.units.find((entry) => entry.id === unitId)
      if (!unit) return false
      unit[stat] = Math.max(0, unit[stat] + delta)
      if (unit.hp > unit.maxHp) unit.hp = unit.maxHp
      return true
    })
  }

  function updateUnitItem(unitId: string, item: 'teleport' | 'camp' | 'returnStone', delta: number): void {
    let applied = false
    updateLocal((draft) => {
      const unit = draft.units.find((entry) => entry.id === unitId)
      if (!unit) return false
      unit.items ??= { teleport: 0, camp: 0, returnStone: 0 }
      unit.items[item] = Math.max(0, (unit.items[item] ?? 0) + delta)
      applied = true
      return true
    })

    if(applied){
      const opponentKey = currentPlayer === 'player1' ? 'player2' : 'player1'
      const opponentIcons = game?.units
          .filter((u) => u.player === opponentKey && u.alive)
          .map((u) => u.icon ?? (u.player === 'player2' ? '/assets/characters/2.png' : '/assets/characters/1.png')) ?? []
      console.log("icons", opponentIcons)

      dropMessageRef.current?.show({
        imagePaths: opponentIcons,
        messages: ['Нифига тебе везет!!!', 'Подари!'],
        autoCloseMs: 5000,
      })
    }
  }

  function healUnitByDrop(unitId: string, mode: 'full' | 'fixed', amount?: number): void {
    updateLocal((draft) => {
      const unit = draft.units.find((entry) => entry.id === unitId)
      if (!unit) return false

      if (mode === 'full') {
        if (unit.hp >= unit.maxHp) return false
        unit.hp = unit.maxHp
        unit.alive = true
        return true
      }

      const heal = Math.max(0, Math.floor(amount ?? 0))
      if (heal <= 0 || unit.hp >= unit.maxHp) return false
      unit.hp = Math.min(unit.maxHp, unit.hp + heal)
      unit.alive = true
      return true
    })
  }

  function applyWarehouseDropToUnit(
    player: PlayerKey,
    unitId: string,
    action: 'trees-camp' | 'red-joker-revive' | 'heal-full',
  ): void {
    updateLocal((draft) => {
      const extras = GameUtils.ensureExtras(draft)
      const resources = extras.resources[player]
      const unit = draft.units.find((entry) => entry.id === unitId && entry.player === player)
      if (!unit || !resources) return false

      if (action === 'trees-camp') {
        if (resources.trees < 6) return false
        unit.items ??= { teleport: 0, camp: 0, returnStone: 0 }
        resources.trees -= 6
        unit.items.camp = Math.max(0, (unit.items.camp ?? 0) + 1)
        draft.extras = extras
        return true
      }

      if (action === 'red-joker-revive') {
        if (resources.redJokers < 1 || unit.alive) return false
        resources.redJokers -= 1
        unit.hp = unit.maxHp
        unit.alive = true
        draft.extras = extras
        return true
      }

      if (resources.heal < 1 || !unit.alive || unit.hp >= unit.maxHp) return false
      resources.heal -= 1
      unit.hp = unit.maxHp
      unit.alive = true
      draft.extras = extras
      return true
    })
  }

  function renameUnit(unitId: string, name: string): void {
    updateLocal((draft) => {
      const unit = draft.units.find((entry) => entry.id === unitId)
      if (!unit) return false
      const nextName = name.trim()
      if (!nextName || nextName === unit.name) return false
      unit.name = nextName
      return true
    })
  }

  function playerNameByKey(state: Game, player: PlayerKey): string {
    if (player === 'player1') return state.player1.name
    return state.player2?.name ?? 'Игрок 2'
  }

  function reorderQueueByIndex(player: PlayerKey, fromIndex: number, toIndex: number): void {
    updateLocal((draft) => {
      const extras = GameUtils.ensureExtras(draft)
      const queue = [...(extras.queueByPlayer?.[player] ?? [])]
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= queue.length || toIndex >= queue.length) return false
      const [moved] = queue.splice(fromIndex, 1)
      if (!moved) return false
      queue.splice(toIndex, 0, moved)
      extras.queueByPlayer = {
        ...(extras.queueByPlayer ?? { player1: [], player2: [] }),
        [player]: queue,
      }
      draft.extras = extras
      return true
    })
  }

  function sortQueueByDistance(player: PlayerKey, anchorUnitId: string): void {
    updateLocal((draft) => {
      const extras = GameUtils.ensureExtras(draft)
      const queue = [...(extras.queueByPlayer?.[player] ?? [])]
      if (queue.length < 2) return false
      const anchor = draft.units.find((unit) => unit.id === anchorUnitId && unit.player === player)
      if (!anchor) return false

      const ordered = queue
        .map((unitId, index) => {
          const unit = draft.units.find((entry) => entry.id === unitId && entry.player === player)
          if (!unit) return null
          const dist = Math.abs(unit.x - anchor.x) + Math.abs(unit.y - anchor.y)
          return { unitId, dist, index }
        })
        .filter((entry): entry is { unitId: string; dist: number; index: number } => entry !== null)
        .sort((a, b) => {
          if (a.dist !== b.dist) return a.dist - b.dist
          return a.index - b.index
        })
        .map((entry) => entry.unitId)

      if (ordered.length !== queue.length) return false
      const same = ordered.every((value, idx) => value === queue[idx])
      if (same) return false

      extras.queueByPlayer = {
        ...(extras.queueByPlayer ?? { player1: [], player2: [] }),
        [player]: ordered,
      }
      draft.extras = extras
      return true
    })
  }

  function setUnitIcon(unitId: string, icon: string): void {
    updateLocal((draft) => {
      const unit = draft.units.find((entry) => entry.id === unitId)
      if (!unit) return false
      unit.icon = icon
      return true
    })
  }

  async function uploadUnitIcon(unitId: string, file: File): Promise<string | null> {
    try {
      const iconPath = await API.uploadCharacterIcon(file)
      setUnitIcon(unitId, iconPath)
      return iconPath
    } catch {
      showError('Не удалось загрузить иконку')
      return null
    }
  }

  function cardRankValue(card: DeckCard): number | null {
    if (card.suit === 'joker') return null
    const label = card.label ?? ''
    const rank = label.replace(/[^\dAJQK]/gi, '').toUpperCase()
    if (/^\d+$/.test(rank)) return Number(rank)
    if (rank === 'J') return 11
    if (rank === 'Q') return 12
    if (rank === 'K') return 13
    if (rank === 'A') return 15
    return null
  }

  function applyDeckCardToUnit(unitId: string): void {
    updateLocal((draft) => {
      const extras = GameUtils.ensureExtras(draft)
      const card = extras.deck.current
      if (!card || card.suit === 'joker') return false

      const unit = draft.units.find((entry) => entry.id === unitId)
      if (!unit) return false

      const power = cardRankValue(card)
      if (!power) return false

      if (card.suit === 'hearts') {
        unit.maxHp += power
        unit.hp += power
      } else if (card.suit === 'clubs') {
        unit.attack += power
      } else if (card.suit === 'diamonds') {
        unit.capture += power
      } else if (card.suit === 'spades') {
        unit.defense += power
      } else {
        return false
      }

      extras.deck.current = null
      draft.extras = extras

      dropMessageRef.current?.show({
        imagePaths: [unit.icon ?? (unit.player === 'player2' ? '/assets/characters/2.png' : '/assets/characters/1.png')],
        messages: ["Спасибо хозяин!!! ^-^", "Моя благодарность не имеет границ!\n Сколько тебе заплатить?"]
      })

      return true
    })
  }

  function updateResource(
    player: PlayerKey,
    key: 'trees' | 'redJokers' | 'blackJokers' | 'heal' | 'buffDebuff' | 'provocation' | 'egoStrike',
    delta: number,
  ): void {
    updateLocal((draft) => {
      const extras = GameUtils.ensureExtras(draft)
      extras.resources[player][key] = Math.max(0, extras.resources[player][key] + delta)
      draft.extras = extras
      return true
    })
  }

  function handleMonsterChange(field: 'name' | 'hp' | 'attack' | 'defense', value: string | number): void {
    updateLocal((draft) => {
      const extras = GameUtils.ensureExtras(draft)
      if (field === 'name') extras.monster.name = String(value)
      else extras.monster[field] = Math.max(0, Number(value) || 0)
      draft.extras = extras
      return true
    })
  }

  function handleApplyMonsterDamage(amount: number, mode: 'normal' | 'crit' | 'vulnerable'): void {
    updateLocal((draft) => {
      const extras = GameUtils.ensureExtras(draft)
      let total = Math.max(0, amount)
      if (mode === 'crit') total += Math.round(total * 0.5)

      if (mode === 'vulnerable') {
        extras.monster.hp = Math.max(0, extras.monster.hp - total)
      } else {
        const blocked = Math.min(extras.monster.defense, total)
        extras.monster.defense -= blocked
        extras.monster.hp = Math.max(0, extras.monster.hp - (total - blocked))
      }
      draft.extras = extras
      return true
    })
  }

  function handleApplyCombatAttack(payload: {
    attackerId: string | 'monster'
    defenderId: string | 'monster'
    mode: 'normal' | 'crit' | 'vulnerable' | 'blocking'
    critPercent: number
  }): void {
    updateLocal((draft) => {
      const extras = GameUtils.ensureExtras(draft)
      const crit = Math.max(1, Math.min(100, Math.floor(payload.critPercent)))

      const attackerAttack =
        payload.attackerId === 'monster'
          ? Math.max(0, extras.monster.attack)
          : (() => {
              const attacker = draft.units.find((entry) => entry.id === payload.attackerId && entry.alive)
              if (!attacker) return null
              return Math.max(0, attacker.attack)
            })()

      if (attackerAttack === null) return false

      let totalDamage =
        payload.mode === 'crit' ? Math.round(attackerAttack * (1 + crit / 100)) : Math.max(0, attackerAttack)

      function applyDamageToStats(target: { hp: number; defense: number }): void {
        if(payload.mode === 'blocking'){
          totalDamage = attackerAttack - target.defense/2;
          if (totalDamage < 0){
            return;
          }
          target.hp = Math.max(0, target.hp - totalDamage)
          console.log(`aa=${attackerAttack}, d=${target.defense}, td=${totalDamage}`)
          return;
        }
        if (payload.mode === 'vulnerable') {
          target.hp = Math.max(0, target.hp - totalDamage)
          return
        }

        const blocked = Math.min(target.defense, totalDamage)
        target.defense = Math.max(0, target.defense - blocked)
        target.hp = Math.max(0, target.hp - Math.max(0, totalDamage - blocked))
      }

      if (payload.defenderId === 'monster') {
        applyDamageToStats(extras.monster)
      } else {
        const defender = draft.units.find((entry) => entry.id === payload.defenderId && entry.alive)
        if (!defender) return false
        applyDamageToStats(defender)
        defender.alive = defender.hp > 0
      }

      draft.extras = extras
      return true
    })
  }

  function handleApplySecret(secret: string, _stage?: 1 | 2 | 3): void {
    let applied = false

    updateLocal((draft) => {
      const extras = GameUtils.ensureExtras(draft)
      const myResources = extras.resources[currentPlayer]
      if (!myResources) return false

      if (secret === 'Лагерь') {
        myResources.trees += 1
      } else if (secret === 'Бафф') {
        myResources.redJokers += 1
      } else if (secret === 'Дебафф' || secret === 'Яд') {
        myResources.blackJokers += 1
      } else if (secret === 'Бафф + Дебафф') {
        myResources.buffDebuff += 1
      } else if (secret === 'Лечение') {
        myResources.heal += 1
      } else if (secret === 'Провокация') {
        myResources.provocation += 1
      } else if (secret === 'Эго-удар') {
        myResources.egoStrike += 1
      } else if (secret === 'Телепорт') {
        const unit = draft.units.find((entry) => entry.player === currentPlayer && entry.alive)
        if (unit?.items) unit.items.teleport += 1
      } else if (secret === 'buffdebuff') {
        myResources.buffDebuff += 1
      } else if (secret === 'buff') {
        myResources.redJokers += 1
      } else if (secret === 'debuff' || secret === 'poison') {
        myResources.blackJokers += 1
      } else if (secret === 'heal') {
        myResources.heal += 1
      } else if (secret === 'camp') {
        myResources.trees += 1
      } else if (secret === 'provocation') {
        myResources.provocation += 1
      } else if (secret === 'egoStrike') {
        myResources.egoStrike += 1
      } else if (secret === 'Бафф+Дебафф') {
        myResources.redJokers += 1
        myResources.blackJokers += 1
      }

      draft.extras = extras
      applied = true;
      return true
    })

    if(applied){
      const opponentKey = currentPlayer === 'player1' ? 'player2' : 'player1'
      const opponentIcons = game?.units
          .filter((u) => u.player === opponentKey && u.alive)
          .map((u) => u.icon ?? (u.player === 'player2' ? '/assets/characters/2.png' : '/assets/characters/1.png')) ?? []
      console.log("icons", opponentIcons)

      dropMessageRef.current?.show({
        imagePaths: opponentIcons,
        messages: ['Нифига тебе везет!!!', 'Подари!'],
        autoCloseMs: 5000,
      })
    }
  }

  function addGameEvent(type: string, message: string): void {
    updateLocal((draft) => {
      draft.events ??= []
      draft.events.push({
        type,
        message,
        player: currentPlayer,
        timestamp: Date.now(),
      })
      if (draft.events.length > 100) {
        draft.events = draft.events.slice(-100)
      }
      return true
    })
  }

  function handleDiceRolled(results: number[], total: number, sides: number): void {
    if (sides > 0) {
      addGameEvent('dice', `${currentPlayer} бросил ${results.length}d${sides}: [${results.join(', ')}], Σ=${total}`)
      return
    }
    addGameEvent('dice', `${currentPlayer} бросил набор кубиков: [${results.join(', ')}], Σ=${total}`)
  }

  function handleWheelSpun(result: string): void {
    addGameEvent('wheel', `${currentPlayer} крутил колесо битвы: ${result}`)
  }

  function handleSecretOpened(result: string): void {
    addGameEvent('secret', `${currentPlayer} открыл сундук: ${result}`)
  }

  function handleDeckDraw(): void {
    updateLocal((draft) => {
      const extras = GameUtils.ensureExtras(draft)
      const myResources = extras.resources[currentPlayer]
      if (!myResources) return false
      if (extras.deck.remaining.length === 0) {
        const newDeck = GameUtils.createDeckState()
        extras.deck.remaining = newDeck.remaining
        extras.deck.discard = []
      }
      const next = extras.deck.remaining.shift()
      if (!next) return false
      extras.deck.current = next
      extras.deck.discard.push(next)
      extras.deck.history.push(next)
      if (next.suit === 'joker') {
        if (next.color === 'red') myResources.redJokers += 1
        if (next.color === 'black') myResources.blackJokers += 1
      }
      if (extras.deck.history.length > 30) extras.deck.history = extras.deck.history.slice(-30)
      draft.extras = extras
      return true
    })
  }

  function handleDeckReset(): void {
    updateLocal((draft) => {
      const extras = GameUtils.ensureExtras(draft)
      extras.deck = GameUtils.createDeckState()
      draft.extras = extras
      return true
    })
  }

  function handleToolChange(nextTool: ToolType): void {
    if (pathCells.length > 0) finalizePendingMovement()
    setSelectedTool(nextTool)
  }

  function handleCaptureModeChange(nextMode: CaptureMode): void {
    if (pathCells.length > 0) finalizePendingMovement()
    setCaptureMode(nextMode)
  }

  function handleMapZoomIn(): void {
    setMapZoom((prev) => Math.min(1.8, Math.round((prev + 0.1) * 10) / 10))
  }

  function handleMapZoomOut(): void {
    setMapZoom((prev) => Math.max(0.6, Math.round((prev - 0.1) * 10) / 10))
  }

  const handleQueueReorder = (player: PlayerKey, fromIndex: number, toIndex: number) => {
    reorderQueueByIndex(player, fromIndex, toIndex)
  }

  const handleBattleStart = ()=>{
    setIsBoard(false);
  }

  const handleToBoard = ()=>{
    setIsBoard(true);
    if(musicEnabled){
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }
      setActiveTracks(musicTracks)
      setMusicIndex(0)
      setMusicEnabled(true)
    }
  }

  const handleRunMonsterBattleTrack = () => {
    if(musicEnabled){
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }
      setActiveTracks(battleMusicTracks)
      setMusicIndex(0)
      setMusicEnabled(true)
    }
  }

  const handleRunPlayerBattleTrack = () => {
    if(musicEnabled){
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }
      setActiveTracks(battleMusicTracks)
      setMusicIndex(0)
      setMusicEnabled(true)
    }
  }

  return (
    <main className="app">
      {viewMode === 'home' ? (
        <HomeScreen
          sessionName={sessionName}
          player1Name={player1Name}
          player2Name={player2Name}
          maxTurns={maxTurns}
          numCharacters={numCharacters}
          color={color}
          games={games}
          notice={notice}
          error={error}
          onSessionNameChange={setSessionName}
          onPlayer1NameChange={setPlayer1Name}
          onPlayer2NameChange={setPlayer2Name}
          onMaxTurnsChange={setMaxTurns}
          onNumCharactersChange={setNumCharacters}
          onColorChange={setColor}
          onCreateGame={() => void handleCreateGame()}
          onJoin={(gameName, asPlayer) => void handleJoin(gameName, asPlayer)}
          onRefreshGames={() => void loadGames()}
        />
      ) : null}

      {viewMode === 'game' && game ? (
        <>
          <header className="panel game-top">
            <div className="game-top-left">
              <strong>{game.name}</strong> | Ход {game.currentTurn}/{game.maxTurns} | Ходит: {playerNameByKey(game, game.currentPlayer)}
            </div>
            <div className="game-top-center">
              {topNotice ? <div className="live-notice">{topNotice}</div> : null}
            </div>
            <div className="row game-top-actions">
              <button onClick={handleEndTurn}>Завершить ход</button>
              <button onClick={handleManualSave}>Сохранить</button>
              <div className="music-dropdown-container">
                <button onClick={() => setMusicDropdownOpen((prev) => !prev)}>
                  {musicEnabled ? '🔊' : '🔇'}
                </button>
                {musicDropdownOpen && (
                  <div className="music-dropdown-panel">
                    <div className="music-dropdown-header">
                      <strong>Музыка</strong>
                    </div>
                    <div className="music-dropdown-controls">
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
                  </div>
                )}
              </div>
              <button onClick={handleBackHome}>На главную</button>
            </div>
          </header>

          <section className="game-layout">
            <LeftGamePanel
              game={game}
              currentPlayer={currentPlayer}
              activeStatsPlayer={statsPlayer}
              onStatsPlayerChange={setStatsPlayer}
              onUnitHpChange={updateUnitHp}
              onUnitStatChange={updateUnitStat}
              onUnitItemChange={updateUnitItem}
              onUnitRename={renameUnit}
              onQueueReorder={handleQueueReorder}
              onQueueFocus={sortQueueByDistance}
              onUnitIconSet={setUnitIcon}
              onUnitIconUpload={uploadUnitIcon}
              onApplyDeckCardToUnit={applyDeckCardToUnit}
              onHealDropToUnit={healUnitByDrop}
              onWarehouseDropToUnit={applyWarehouseDropToUnit}
              onResourceChange={updateResource}
            />
            {isBoard ?
                <BoardPanel
                    game={game}
                    selectedUnitId={selectedUnitId}
                    pathCells={pathCells}
                    zoom={mapZoom}
                    onCellClick={handleCellClick}
                    onUnitTeleport={handleUnitTeleport}
                    onOutsideMapClick={handleOutsideMapClick}
                    onZoomIn={handleMapZoomIn}
                    onZoomOut={handleMapZoomOut}
                />
                :
                <BattlePanel
                    game={game}
                    onMonsterChange={handleMonsterChange}
                    onApplyCombatAttack={handleApplyCombatAttack}
                    onToBoard={handleToBoard}
                    runMonsterBattleTrack = {handleRunMonsterBattleTrack}
                    runPlayerBattleTrack = {handleRunPlayerBattleTrack}
                />
            }

            <RightUtilityPanel
              game={game}
              currentPlayer={currentPlayer}
              onMonsterChange={handleMonsterChange}
              onApplyMonsterDamage={handleApplyMonsterDamage}
              onApplyCombatAttack={handleApplyCombatAttack}
              onApplySecret={handleApplySecret}
              onDeckDraw={handleDeckDraw}
              onDeckReset={handleDeckReset}
              onDiceRolled={handleDiceRolled}
              onWheelSpun={handleWheelSpun}
              onSecretOpened={handleSecretOpened}
              onBattleStart={handleBattleStart}
            />
          </section>

          <MapToolbar
            open={toolbarOpen}
            selectedTool={selectedTool}
            captureMode={captureMode}
            genCount={genCount}
            onToggle={() => setToolbarOpen((value) => !value)}
            onSelectedToolChange={handleToolChange}
            onCaptureModeChange={handleCaptureModeChange}
            onGenCountChange={setGenCount}
            onGenerate={handleGenerate}
          />
        </>
      ) : null}

      <RandomDropPopup ref={dropMessageRef} />
    </main>
  )
}

export default App
