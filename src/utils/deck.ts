import type { DeckCard } from '../types'
import { GameUtils } from './gameUtils'

export function buildDeck(): DeckCard[] {
  return GameUtils.createDeckState().remaining
}
