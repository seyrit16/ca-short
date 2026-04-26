import type { Game } from '../types'

export interface GamePatchOp {
  op: 'set' | 'delete'
  path: string[]
  value?: unknown
}

const IGNORED_ROOT_KEYS = new Set(['updatedAt', 'revision'])

function cloneValue<T>(value: T): T {
  if (value === undefined) return value
  return JSON.parse(JSON.stringify(value)) as T
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isArrayIndex(segment: string): boolean {
  if (!/^\d+$/.test(segment)) return false
  const num = Number(segment)
  return Number.isInteger(num) && num >= 0
}

function diffInto(
  from: unknown,
  to: unknown,
  path: string[],
  patch: GamePatchOp[],
): void {
  if (Object.is(from, to)) return

  if (Array.isArray(from) && Array.isArray(to)) {
    if (from.length !== to.length) {
      patch.push({ op: 'set', path, value: cloneValue(to) })
      return
    }
    for (let index = 0; index < from.length; index += 1) {
      diffInto(from[index], to[index], [...path, String(index)], patch)
    }
    return
  }

  if (isObject(from) && isObject(to)) {
    const keys = new Set([...Object.keys(from), ...Object.keys(to)])
    keys.forEach((key) => {
      if (path.length === 0 && IGNORED_ROOT_KEYS.has(key)) return
      const hasFrom = Object.prototype.hasOwnProperty.call(from, key)
      const hasTo = Object.prototype.hasOwnProperty.call(to, key)
      const nextPath = [...path, key]
      if (!hasTo) {
        patch.push({ op: 'delete', path: nextPath })
        return
      }
      if (!hasFrom) {
        patch.push({ op: 'set', path: nextPath, value: cloneValue((to as Record<string, unknown>)[key]) })
        return
      }
      diffInto((from as Record<string, unknown>)[key], (to as Record<string, unknown>)[key], nextPath, patch)
    })
    return
  }

  patch.push({ op: 'set', path, value: cloneValue(to) })
}

export function createGamePatch(from: Game, to: Game): GamePatchOp[] {
  const patch: GamePatchOp[] = []
  diffInto(from, to, [], patch)
  return patch
}

function setAtPath(target: unknown, path: string[], value: unknown): void {
  if (path.length === 0) return

  let cursor = target as Record<string, unknown> | unknown[]
  for (let i = 0; i < path.length - 1; i += 1) {
    const segment = path[i]
    const nextSegment = path[i + 1]
    const nextIsArray = isArrayIndex(nextSegment)

    if (Array.isArray(cursor)) {
      const index = Number(segment)
      const existing = cursor[index]
      if (existing === undefined || existing === null || typeof existing !== 'object') {
        cursor[index] = nextIsArray ? [] : {}
      }
      cursor = cursor[index] as Record<string, unknown> | unknown[]
      continue
    }

    const existing = (cursor as Record<string, unknown>)[segment]
    if (existing === undefined || existing === null || typeof existing !== 'object') {
      ;(cursor as Record<string, unknown>)[segment] = nextIsArray ? [] : {}
    }
    cursor = (cursor as Record<string, unknown>)[segment] as Record<string, unknown> | unknown[]
  }

  const last = path[path.length - 1]
  const safeValue = cloneValue(value)
  if (Array.isArray(cursor) && isArrayIndex(last)) {
    cursor[Number(last)] = safeValue
    return
  }
  ;(cursor as Record<string, unknown>)[last] = safeValue
}

function deleteAtPath(target: unknown, path: string[]): void {
  if (path.length === 0) return

  let cursor = target as Record<string, unknown> | unknown[]
  for (let i = 0; i < path.length - 1; i += 1) {
    const segment = path[i]
    if (Array.isArray(cursor)) {
      const index = Number(segment)
      const next = cursor[index]
      if (next === undefined || next === null || typeof next !== 'object') return
      cursor = next as Record<string, unknown> | unknown[]
      continue
    }
    const next = (cursor as Record<string, unknown>)[segment]
    if (next === undefined || next === null || typeof next !== 'object') return
    cursor = next as Record<string, unknown> | unknown[]
  }

  const last = path[path.length - 1]
  if (Array.isArray(cursor) && isArrayIndex(last)) {
    const index = Number(last)
    if (index >= 0 && index < cursor.length) cursor.splice(index, 1)
    return
  }
  delete (cursor as Record<string, unknown>)[last]
}

export function applyGamePatch(target: Game, patch: GamePatchOp[]): Game {
  for (const op of patch) {
    if (op.op === 'set') {
      setAtPath(target, op.path, op.value)
      continue
    }
    deleteAtPath(target, op.path)
  }
  return target
}
