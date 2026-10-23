import type { GameConfig, MatchPlayer } from './contracts'

export const scoringVersion = '1.0'

export function scoreForSafeReveal(revealedCount: number) {
  return 20 + Math.min(40, Math.max(0, revealedCount - 1) * 2)
}

export function xpForSafeReveal(revealedCount: number) {
  return 5 + Math.min(20, Math.max(0, revealedCount - 1))
}

export function visibleScore(player: MatchPlayer, config: GameConfig) {
  return Math.max(0, Math.round(player.rawScore * config.difficultyMultiplier))
}
