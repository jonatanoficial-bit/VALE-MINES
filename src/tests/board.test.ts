import { describe, expect, it } from 'vitest'
import { DIFFICULTIES, cellId, initializeBoardAfterFirstReveal, neighborIds } from '../domain/board'
import type { GameConfig } from '../domain/contracts'

const config: GameConfig = { mode: 'solo', difficulty: 'recruta', ...DIFFICULTIES.recruta, difficultyMultiplier: 1, livesPerPlayer: 1 }

describe('geração do campo', () => {
  it('posiciona exatamente o total de minas da dificuldade', () => {
    const board = initializeBoardAfterFirstReveal(123456, cellId(4, 4), config)
    expect(board.cells.filter((cell) => cell.hasMine)).toHaveLength(10)
  })

  it('protege a primeira revelação e toda a vizinhança existente 3x3', () => {
    const board = initializeBoardAfterFirstReveal(99, cellId(0, 0), config)
    const protectedIds = new Set([cellId(0, 0), ...neighborIds(config, { row: 0, column: 0 })])
    expect(board.cells.filter((cell) => protectedIds.has(cell.id) && cell.hasMine)).toHaveLength(0)
  })

  it('calcula números a partir de cada uma das oito casas vizinhas', () => {
    const board = initializeBoardAfterFirstReveal(74, cellId(4, 4), config)
    const mines = new Set(board.cells.filter((cell) => cell.hasMine).map((cell) => cell.id))
    for (const cell of board.cells.filter((item) => !item.hasMine)) {
      expect(cell.neighborCount).toBe(neighborIds(config, cell).filter((id) => mines.has(id)).length)
    }
  })

  it('reproduz o mesmo terreno para a mesma seed e varia com outra seed', () => {
    const fingerprint = (seed: number) => initializeBoardAfterFirstReveal(seed, cellId(4, 4), config).cells.map((cell) => Number(cell.hasMine)).join('')
    expect(fingerprint(12)).toBe(fingerprint(12))
    expect(fingerprint(12)).not.toBe(fingerprint(13))
  })
})
