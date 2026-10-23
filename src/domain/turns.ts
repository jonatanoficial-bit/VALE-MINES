import type { MatchPlayer } from './contracts'

export function nextActivePlayer(players: MatchPlayer[], currentIndex: number) {
  if (!players.some((player) => player.lives > 0)) return -1
  for (let offset = 1; offset <= players.length; offset += 1) {
    const candidate = (currentIndex + offset) % players.length
    if (players[candidate].lives > 0) return candidate
  }
  return -1
}
