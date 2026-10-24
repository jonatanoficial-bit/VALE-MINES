import { describe, expect, it } from 'vitest'
import { createGame, createProfile } from '../domain/engine'
import type { GameConfig } from '../domain/contracts'
import { nextActivePlayer } from '../domain/turns'

const config: GameConfig = { mode: 'hotseat', difficulty: 'recruta', width: 9, height: 9, mineCount: 10, difficultyMultiplier: 1, livesPerPlayer: 3 }

function squad(...names: string[]) {
  return createGame(config, names.map(createProfile)).players
}

describe('rodízio de esquadrão', () => {
  it('pula participantes eliminados e volta ao início do esquadrão', () => {
    const players = squad('Ana', 'Beto', 'Caio', 'Dani')
    players[1].lives = 0
    players[2].lives = 0

    expect(nextActivePlayer(players, 0)).toBe(3)
    expect(nextActivePlayer(players, 3)).toBe(0)
  })

  it('informa ausência de participantes ativos', () => {
    const players = squad('Ana', 'Beto')
    players.forEach((player) => { player.lives = 0 })
    expect(nextActivePlayer(players, 0)).toBe(-1)
  })
})
