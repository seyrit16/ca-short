import type { CaptureMode, ObjectType } from '../types'

export const objectTools: ObjectType[] = ['rock', 'tree', 'river', 'monster', 'chest', 'camp']

export const objectImage: Record<ObjectType, string> = {
  rock: '/assets/rock.png',
  tree: '/assets/tree.png',
  river: '/assets/river.png',
  monster: '/assets/monster.png',
  chest: '/assets/chest.png',
  camp: '/assets/camp.png',
}

export const objectLabel: Record<ObjectType, string> = {
  rock: 'Камень',
  tree: 'Дерево',
  river: 'Водоем',
  monster: 'Монстр',
  chest: 'Секрет',
  camp: 'Лагерь',
}

export const objectIcon: Record<ObjectType, string> = {
  rock: '🪨',
  tree: '🌲',
  river: '🌊',
  monster: '👹',
  chest: '🎁',
  camp: '🏕️',
}

export const captureModes: CaptureMode[] = ['none', 'normal', 'permanent', 'remove']
