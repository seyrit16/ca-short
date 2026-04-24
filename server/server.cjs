const express = require('express')
const fs = require('fs').promises
const path = require('path')
const cors = require('cors')
const http = require('http')
const { WebSocketServer } = require('ws')

const app = express()
const server = http.createServer(app)
const PORT = process.env.PORT || 3000
const GAMES_DIR = path.join(__dirname, 'games')
const CHARACTER_ASSETS_DIR = path.join(__dirname, '..', 'public', 'assets', 'characters')
const wsClientsByGame = new Map()

const WS_OPEN = 1

function wsLog(event, details) {
  console.log(`[WS][${new Date().toISOString()}] ${event}${details ? ` | ${details}` : ''}`)
}

function addWsClient(gameName, client) {
  const room = wsClientsByGame.get(gameName) ?? new Set()
  room.add(client)
  wsClientsByGame.set(gameName, room)
}

function removeWsClient(gameName, client) {
  const room = wsClientsByGame.get(gameName)
  if (!room) return
  room.delete(client)
  if (room.size === 0) wsClientsByGame.delete(gameName)
}

function broadcastWs(gameName, payload) {
  const room = wsClientsByGame.get(gameName)
  if (!room || room.size === 0) return
  const serialized = JSON.stringify(payload)
  wsLog('OUT', `game=${gameName} clients=${room.size} payload=`)
  for (const client of room) {
    if (client.readyState !== WS_OPEN) continue
    try {
      client.send(serialized)
    } catch {
      // no-op
    }
  }
}

function broadcastGameUpdate(gameName, game) {
  broadcastWs(gameName, {
    type: 'game:update',
    gameName,
    game,
    updatedAt: game?.updatedAt ?? Date.now(),
  })
}

function broadcastGameDeleted(gameName) {
  broadcastWs(gameName, {
    type: 'game:deleted',
    gameName,
    updatedAt: Date.now(),
  })
}

app.use(cors())
app.use(express.json({ limit: '10mb' }))

async function ensureGamesDir() {
  try {
    await fs.access(GAMES_DIR)
  } catch {
    await fs.mkdir(GAMES_DIR, { recursive: true })
  }
}

async function ensureUploadsDir() {
  try {
    await fs.access(CHARACTER_ASSETS_DIR)
  } catch {
    await fs.mkdir(CHARACTER_ASSETS_DIR, { recursive: true })
  }
}

function getGamePath(gameName) {
  const safeName = gameName.replace(/[^a-zA-Z0-9_-]/g, '_')
  return path.join(GAMES_DIR, `${safeName}.json`)
}

app.get('/api/games', async (req, res) => {
  try {
    await ensureGamesDir()
    const files = await fs.readdir(GAMES_DIR)
    const games = []

    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const content = await fs.readFile(path.join(GAMES_DIR, file), 'utf8')
        const game = JSON.parse(content)
        games.push({
          id: game.id,
          name: game.name,
          currentTurn: game.currentTurn,
          maxTurns: game.maxTurns,
          playerCount: game.player2 ? 2 : 1,
          player1Color: game.player1?.color,
          player2Color: game.player2?.color,
          status: game.status,
        })
      } catch (error) {
        console.error(`Failed to parse game file: ${file}`, error)
      }
    }

    res.json(games)
  } catch (error) {
    res.status(500).json({ error: 'Failed to list games' })
  }
})

app.get('/api/games/:name', async (req, res) => {
  try {
    const gamePath = getGamePath(decodeURIComponent(req.params.name))
    const content = await fs.readFile(gamePath, 'utf8')
    res.json(JSON.parse(content))
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'Game not found' })
      return
    }
    res.status(500).json({ error: 'Failed to load game' })
  }
})

app.post('/api/games', async (req, res) => {
  try {
    const game = req.body
    if (!game?.name) {
      res.status(400).json({ error: 'Game name is required' })
      return
    }
    await ensureGamesDir()
    const gamePath = getGamePath(game.name)

    try {
      await fs.access(gamePath)
      res.status(409).json({ error: 'Game with this name already exists' })
      return
    } catch {
      // no-op
    }

    game.updatedAt = Date.now()
    await fs.writeFile(gamePath, JSON.stringify(game, null, 2), 'utf8')
    broadcastGameUpdate(game.name, game)
    res.status(201).json({ message: 'Game created', id: game.id })
  } catch (error) {
    res.status(500).json({ error: 'Failed to create game' })
  }
})

app.put('/api/games/:name', async (req, res) => {
  try {
    const gameName = decodeURIComponent(req.params.name)
    const gamePath = getGamePath(gameName)
    const game = req.body
    game.updatedAt = Date.now()
    await fs.writeFile(gamePath, JSON.stringify(game, null, 2), 'utf8')
    broadcastGameUpdate(gameName, game)
    res.json({ message: 'Game saved' })
  } catch (error) {
    res.status(500).json({ error: 'Failed to save game' })
  }
})

app.delete('/api/games/:name', async (req, res) => {
  try {
    const gameName = decodeURIComponent(req.params.name)
    const gamePath = getGamePath(gameName)
    await fs.unlink(gamePath)
    broadcastGameDeleted(gameName)
    res.json({ message: 'Game deleted' })
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'Game not found' })
      return
    }
    res.status(500).json({ error: 'Failed to delete game' })
  }
})

app.post('/api/games/:name/join', async (req, res) => {
  try {
    const gameName = decodeURIComponent(req.params.name)
    const gamePath = getGamePath(gameName)
    const content = await fs.readFile(gamePath, 'utf8')
    const game = JSON.parse(content)

    if (game.player2) {
      res.status(409).json({ error: 'Game is full' })
      return
    }

    const color = req.body?.color
    if (!color || game.player1.color === color) {
      res.status(400).json({ error: 'Color already taken' })
      return
    }

    game.player2 = {
      color,
      name: 'Игрок 2',
      captures: { normal: 0, permanent: 0 },
      territory: 0,
      capturePoints: 10,
    }

    const startPositions =
      game.numCharacters === 5
        ? [{ x: 21, y: 2 }, { x: 22, y: 1 }, { x: 23, y: 1 }, { x: 22, y: 0 }, { x: 23, y: 0 }]
        : [{ x: 22, y: 1 }, { x: 23, y: 1 }, { x: 22, y: 0 }, { x: 23, y: 0 }]

    startPositions.forEach((pos, idx) => {
      game.units.push({
        id: `p2_unit_${idx}`,
        player: 'player2',
        type: 'character',
        emoji: '🙂',
        x: pos.x,
        y: pos.y,
        name: `Персонаж ${idx + 1}`,
        hp: 10,
        maxHp: 10,
        attack: 5,
        defense: 5,
        capture: 3,
        items: { teleport: 0, camp: 0, returnStone: 0 },
        alive: true,
      })
      game.board[pos.y][pos.x].capture = { type: 'permanent', player: 'player2' }
    })

    game.updatedAt = Date.now()
    await fs.writeFile(gamePath, JSON.stringify(game, null, 2), 'utf8')
    broadcastGameUpdate(gameName, game)
    res.json({ message: 'Joined game', game })
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'Game not found' })
      return
    }
    res.status(500).json({ error: 'Failed to join game' })
  }
})

app.post('/api/uploads/character-icon', async (req, res) => {
  try {
    await ensureUploadsDir()
    const dataUrl = req.body?.dataUrl
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
      res.status(400).json({ error: 'Invalid PNG payload' })
      return
    }

    const base64 = dataUrl.slice('data:image/png;base64,'.length)
    const buffer = Buffer.from(base64, 'base64')
    if (!buffer.length) {
      res.status(400).json({ error: 'Empty file' })
      return
    }

    const fileName = `icon_${Date.now()}_${Math.random().toString(36).slice(2, 10)}.png`
    const targetPath = path.join(CHARACTER_ASSETS_DIR, fileName)
    await fs.writeFile(targetPath, buffer)
    res.status(201).json({ path: `/assets/characters/${fileName}` })
  } catch (error) {
    res.status(500).json({ error: 'Failed to upload icon' })
  }
})

app.get('/api/character-icons', async (req, res) => {
  try {
    await ensureUploadsDir()
    const files = await fs.readdir(CHARACTER_ASSETS_DIR)
    const icons = files
      .filter((name) => /\.png$/i.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
      .map((name) => `/assets/characters/${name}`)
    res.json({ icons })
  } catch (error) {
    res.status(500).json({ error: 'Failed to load character icons' })
  }
})

async function start() {
  await ensureGamesDir()
  await ensureUploadsDir()
  const wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (client, request) => {
    let gameName = ''
    try {
      const parsedUrl = new URL(request.url ?? '', `http://${request.headers.host}`)
      gameName = (parsedUrl.searchParams.get('game') ?? '').trim()
    } catch {
      client.close(1008, 'Invalid URL')
      return
    }

    if (!gameName) {
      client.close(1008, 'Missing game')
      return
    }

    wsLog('CONNECT', `game=${gameName} from=${request.socket.remoteAddress ?? 'unknown'}`)
    addWsClient(gameName, client)
    client.on('message', (raw) => {
      //wsLog('IN', `game=${gameName} `)
    })
    client.on('close', (code, reason) => {
      wsLog('CLOSE', `game=${gameName} code=${code} reason=${String(reason || '')}`)
      removeWsClient(gameName, client)
    })
    client.on('error', (error) => {
      wsLog('ERROR', `game=${gameName} message=${error?.message ?? 'unknown'}`)
      removeWsClient(gameName, client)
    })
  })

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Chess Adventures API: http://localhost:${PORT}/api`)
  })
}

start().catch((error) => {
  console.error(error)
  process.exit(1)
})
