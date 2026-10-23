import type { BoardCell, BoardState, GameConfig } from './contracts'

export const DIFFICULTIES = {
  recruta: { label: 'Recruta', width: 9, height: 9, mineCount: 10, multiplier: 1 },
  veterano: { label: 'Veterano', width: 16, height: 16, mineCount: 40, multiplier: 1.5 },
  general: { label: 'General', width: 30, height: 16, mineCount: 99, multiplier: 2 },
} as const

export function cellId(row: number, column: number) {
  return `r${row}c${column}`
}

export function createEmptyBoard(config: GameConfig): BoardState {
  const cells: BoardCell[] = []
  for (let row = 0; row < config.height; row += 1) {
    for (let column = 0; column < config.width; column += 1) {
      cells.push({ id: cellId(row, column), row, column, hasMine: false, neighborCount: 0, revealed: false, exploded: false })
    }
  }
  return { generated: false, cells }
}

export function newSecureSeed() {
  const values = new Uint32Array(1)
  crypto.getRandomValues(values)
  return values[0] || 1
}

export function mulberry32(seed: number) {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function neighborIds(config: Pick<GameConfig, 'width' | 'height'>, cell: Pick<BoardCell, 'row' | 'column'>) {
  const ids: string[] = []
  for (let row = cell.row - 1; row <= cell.row + 1; row += 1) {
    for (let column = cell.column - 1; column <= cell.column + 1; column += 1) {
      if (row === cell.row && column === cell.column) continue
      if (row >= 0 && row < config.height && column >= 0 && column < config.width) ids.push(cellId(row, column))
    }
  }
  return ids
}

export function protectedInitialIds(config: Pick<GameConfig, 'width' | 'height'>, firstCell: Pick<BoardCell, 'row' | 'column'>) {
  return new Set([cellId(firstCell.row, firstCell.column), ...neighborIds(config, firstCell)])
}

export function calculateNeighborCounts(cells: BoardCell[], config: Pick<GameConfig, 'width' | 'height'>) {
  const mineIds = new Set(cells.filter((cell) => cell.hasMine).map((cell) => cell.id))
  return cells.map((cell) => ({
    ...cell,
    neighborCount: cell.hasMine ? 0 : neighborIds(config, cell).filter((id) => mineIds.has(id)).length,
  }))
}

export function initializeBoardAfterFirstReveal(seed: number, firstCellId: string, config: GameConfig): BoardState {
  const board = createEmptyBoard(config)
  const firstCell = board.cells.find((cell) => cell.id === firstCellId)
  if (!firstCell) throw new Error('Célula inicial inválida.')

  const protectedIds = protectedInitialIds(config, firstCell)
  const candidates = board.cells.filter((cell) => !protectedIds.has(cell.id)).map((cell) => cell.id)
  if (config.mineCount > candidates.length) throw new Error('Configuração sem espaço seguro para a primeira revelação.')

  const random = mulberry32(seed)
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const chosen = Math.floor(random() * (index + 1))
    ;[candidates[index], candidates[chosen]] = [candidates[chosen], candidates[index]]
  }
  const mineIds = new Set(candidates.slice(0, config.mineCount))
  const placed = board.cells.map((cell) => ({ ...cell, hasMine: mineIds.has(cell.id) }))
  return { generated: true, cells: calculateNeighborCounts(placed, config) }
}

export function revealSafeArea(board: BoardState, startId: string, config: Pick<GameConfig, 'width' | 'height'>) {
  const cells = board.cells.map((cell) => ({ ...cell }))
  const byId = new Map(cells.map((cell) => [cell.id, cell]))
  const revealed: string[] = []
  const queue = [startId]
  const queued = new Set(queue)

  while (queue.length > 0) {
    const id = queue.shift()!
    const cell = byId.get(id)
    if (!cell || cell.revealed || cell.flagOwnerId || cell.hasMine) continue
    cell.revealed = true
    revealed.push(id)
    if (cell.neighborCount === 0) {
      for (const neighborId of neighborIds(config, cell)) {
        if (!queued.has(neighborId)) {
          queued.add(neighborId)
          queue.push(neighborId)
        }
      }
    }
  }
  return { board: { ...board, cells }, revealed }
}

export function mineCount(board: BoardState) {
  return board.cells.filter((cell) => cell.hasMine).length
}
