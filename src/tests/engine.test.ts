import { describe, expect, it } from 'vitest'
import { createGame, createProfile, beginGame, revealCell, toggleFlag } from '../domain/engine'
import type { GameConfig } from '../domain/contracts'

const hotseat: GameConfig = { mode: 'hotseat', difficulty: 'recruta', width: 9, height: 9, mineCount: 10, difficultyMultiplier: 1, livesPerPlayer: 3 }

describe('motor de turnos', () => {
  it('passa a vez para o próximo participante após uma revelação segura', () => {
    const game = beginGame(createGame(hotseat, [createProfile('Ana'), createProfile('Beto')]))
    const result = revealCell(game, game.players[0].playerId, 'r4c4', 'safe-action')
    expect(result.accepted).toBe(true)
    if (!result.accepted) return
    expect(result.nextState.currentTurnIndex).toBe(1)
    expect(result.nextState.players[0].rawScore).toBeGreaterThan(0)
  })

  it('não aceita a mesma ação duas vezes', () => {
    const game = beginGame(createGame(hotseat, [createProfile('Ana'), createProfile('Beto')]))
    const first = toggleFlag(game, game.players[0].playerId, 'r0c0', 'repeat-action')
    expect(first.accepted).toBe(true)
    if (!first.accepted) return
    const second = toggleFlag(first.nextState, first.nextState.players[1].playerId, 'r0c1', 'repeat-action')
    expect(second).toEqual({ accepted: false, reason: 'Esta ação já foi processada.' })
  })

  it('desconta vida apenas de quem acionou uma mina no hotseat', () => {
    let game = beginGame(createGame(hotseat, [createProfile('Ana'), createProfile('Beto')]))
    const start = revealCell(game, game.players[0].playerId, 'r4c4', 'first')
    expect(start.accepted).toBe(true)
    if (!start.accepted) return
    game = start.nextState
    const mine = game.board.cells.find((cell) => cell.hasMine && !cell.revealed && !cell.flagOwnerId)!
    const current = game.players[game.currentTurnIndex]
    const result = revealCell(game, current.playerId, mine.id, 'mine-hit')
    expect(result.accepted).toBe(true)
    if (!result.accepted) return
    expect(result.nextState.players.find((player) => player.playerId === current.playerId)?.lives).toBe(2)
    expect(result.nextState.players.find((player) => player.playerId !== current.playerId)?.lives).toBe(3)
  })
})
