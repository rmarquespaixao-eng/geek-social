export const communityCategories = [
  'boardgames',
  'tcg',
  'rpg-mesa',
  'rpg-digital',
  'mmo',
  'souls',
  'fps',
  'survival',
  'indie',
  'retro',
  'mobile',
  'simulation',
  'strategy',
  'mods',
  'community-events',
] as const

export type CommunityCategory = typeof communityCategories[number]
