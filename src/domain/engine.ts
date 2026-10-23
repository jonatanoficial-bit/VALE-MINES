import {
  createEmptyBoard,
  initializeBoardAfterFirstReveal,
  mineCount,
  newSecureSeed,
  revealSafeArea,
} from './board'
import type {
  ActionLog,
  ActionResult,
  ActionType,
  BoardCell,
  GameConfig,
  GameEvent,
  GameState,
  MatchPlayer,
  PlayerProfile,
} from './contracts'
import { scoreForSafeReveal, xpForSafeReveal } from './scoring'
import { nextActivePlayer } from './turns'

const colors = ['#D9A441', '#77A87B', '#6FA8DC', '#D9534F', '#C084FC', '#F29E7E', '#5EEAD4', '#FCD34D', '#FB7185', '#A3E635']
const avatars = ['✦', '◆', '●', '▲', '⬟', '◈', '✹', '⬢', '✺', '✦']

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID?.() ?? `${Date.now()}-${newSecureSeed()}`}`
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

export function createProfile(name: string, index = 0): PlayerProfile {
  const now = Date.now()
  return {
    playerId: id('player'),
    name: name.trim(),
    avatarId: avatars[index % avatars.length],
    accentColor: colors[index % colors.length],
    xpTotal: 0,
    createdAt: now,
    updatedAt: now,
  }
}

export function createGame(config: GameConfig, profiles: PlayerProfile[]): GameState {
  if (profiles.length < 1 || profiles.length > 10) throw new Error('A missão aceita de 1 a 10 participantes.')
  if (config.mode === 'solo' && profiles.length !== 1) throw new Error('A campanha solo exige apenas um participante.')
  if (config.mode === 'hotseat' && profiles.length < 2) throw new Error('A operação por turnos exige ao menos dois participantes.')
  if (config.mineCount < 1 || config.mineCount > config.width * config.height - 9) throw new Error('Configuração de minas inválida.')
  const names = profiles.map((profile) => profile.name.trim().toLocaleLowerCase('pt-BR'))
  if (names.some((name) => name.length < 2) || new Set(names).size !== names.length) throw new Error('Use nomes únicos com pelo menos 2 caracteres.')

  const players: MatchPlayer[] = profiles.map((profile, index) => ({
    ...profile,
    avatarId: profile.avatarId || avatars[index % avatars.length],
    accentColor: profile.accentColor || colors[index % colors.length],
    lives: config.mode === 'solo' ? 1 : config.livesPerPlayer,
    rawScore: 0,
    manualSafe: 0,
    autoSafe: 0,
    hitMines: 0,
    validActions: 0,
  }))

  return {
    schemaVersion: 1,
    matchId: id('match'),
    config,
    seed: newSecureSeed(),
    board: createEmptyBoard(config),
    players,
    phase: 'briefing',
    currentTurnIndex: 0,
    turnNumber: 1,
    elapsedMs: 0,
    actionIds: [],
    actionLog: [],
    revision: 0,
    finalized: false,
  }
}

export function beginGame(game: GameState) {
  if (game.phase !== 'briefing' && game.phase !== 'paused') return game
  return { ...clone(game), phase: 'playing' as const, startedAt: Date.now(), revision: game.revision + 1 }
}

export function pauseGame(game: GameState) {
  if (game.phase !== 'playing') return game
  return { ...clone(game), phase: 'paused' as const, revision: game.revision + 1 }
}

export function isVictory(game: GameState) {
  return game.board.generated && game.board.cells.every((cell) => cell.hasMine || cell.revealed)
}

export function allPlayersEliminated(game: GameState) {
  return game.players.every((player) => player.lives <= 0)
}

export function flagCount(game: GameState) {
  return game.board.cells.filter((cell) => cell.flagOwnerId).length
}

export function remainingSafeCells(game: GameState) {
  return game.board.cells.filter((cell) => !cell.hasMine && !cell.revealed).length
}

function currentPlayer(game: GameState) {
  return game.players[game.currentTurnIndex]
}

function reject(reason: string): ActionResult {
  return { accepted: false, reason }
}

function preserveFlags(target: GameState, generatedCells: BoardCell[]) {
  const flags = new Map(target.board.cells.filter((cell) => cell.flagOwnerId).map((cell) => [cell.id, cell.flagOwnerId]))
  return generatedCells.map((cell) => ({ ...cell, flagOwnerId: flags.get(cell.id) }))
}

function actionAllowed(game: GameState, playerId: string, actionId: string, cellId: string) {
  if (game.phase !== 'playing') return 'A missão não está em andamento.'
  if (game.actionIds.includes(actionId)) return 'Esta ação já foi processada.'
  if (currentPlayer(game)?.playerId !== playerId) return 'Aguarde a sua vez.'
  if (currentPlayer(game)?.lives <= 0) return 'Este participante está fora de combate.'
  if (!game.board.cells.some((cell) => cell.id === cellId)) return 'Setor inexistente.'
  return undefined
}

function writeLog(game: GameState, player: MatchPlayer, type: ActionType, cellId: string, revealedCount: number, hitMine: boolean, scoreDelta: number, actionId: string) {
  const log: ActionLog = {
    actionId,
    turnNumber: game.turnNumber,
    playerId: player.playerId,
    type,
    cellId,
    revealedCount,
    hitMine,
    scoreDelta,
    livesAfter: player.lives,
    createdAt: Date.now(),
  }
  game.actionIds.push(actionId)
  game.actionLog.push(log)
}

function awardFinalXP(game: GameState, won: boolean) {
  for (const player of game.players) {
    if (won && player.lives > 0 && player.validActions > 0) {
      player.rawScore += 150
      player.xpTotal += game.config.mode === 'solo' ? 40 : 25
    }
    if (player.validActions >= 3 && player.manualSafe > 0) player.xpTotal += 10
    player.updatedAt = Date.now()
  }
}

function finalize(game: GameState, outcome: 'won' | 'lost') {
  if (game.finalized) return
  for (const cell of game.board.cells) {
    if (!cell.flagOwnerId) continue
    const owner = game.players.find((player) => player.playerId === cell.flagOwnerId)
    if (owner) owner.rawScore += cell.hasMine ? 10 : -15
  }
  awardFinalXP(game, outcome === 'won')
  game.phase = outcome
  game.finishedAt = Date.now()
  game.finalized = true
}

function advanceAfterAction(game: GameState, events: GameEvent[]) {
  if (isVictory(game)) {
    finalize(game, 'won')
    events.push({ kind: 'victory', message: 'Missão cumprida. Todo o terreno seguro foi reconhecido.' })
    return
  }
  if (allPlayersEliminated(game)) {
    finalize(game, 'lost')
    events.push({ kind: 'defeat', message: 'Esquadrão sem vidas. Reorganize a operação.' })
    return
  }
  if (game.config.mode === 'hotseat') {
    game.currentTurnIndex = nextActivePlayer(game.players, game.currentTurnIndex)
    const next = currentPlayer(game)
    events.push({ kind: 'turn', message: `Comando transferido para ${next.name}.` })
  }
  game.turnNumber += 1
}

function commit(game: GameState, player: MatchPlayer, type: ActionType, cellId: string, revealedCount: number, hitMine: boolean, scoreDelta: number, actionId: string, events: GameEvent[]): ActionResult {
  writeLog(game, player, type, cellId, revealedCount, hitMine, scoreDelta, actionId)
  advanceAfterAction(game, events)
  game.revision += 1
  assertInvariants(game)
  return { accepted: true, nextState: game, events }
}

export function revealCell(game: GameState, playerId: string, cellId: string, actionId = id('action')): ActionResult {
  const denied = actionAllowed(game, playerId, actionId, cellId)
  if (denied) return reject(denied)
  const next = clone(game)
  if (!next.board.generated) {
    const generated = initializeBoardAfterFirstReveal(next.seed, cellId, next.config)
    next.board = { generated: true, cells: preserveFlags(next, generated.cells) }
    next.firstRevealCellId = cellId
  }
  const cell = next.board.cells.find((item) => item.id === cellId)!
  if (cell.revealed || cell.flagOwnerId) return reject('Este setor não pode ser revelado agora.')
  const player = currentPlayer(next)
  player.validActions += 1
  const events: GameEvent[] = []

  if (cell.hasMine) {
    cell.revealed = true
    cell.exploded = true
    cell.flagOwnerId = undefined
    player.lives -= 1
    player.rawScore -= 50
    player.hitMines += 1
    events.push({ kind: 'mine-hit', message: `${player.name} acionou uma mina e perdeu uma vida.` })
    if (next.config.mode === 'solo') {
      finalize(next, 'lost')
      events.push({ kind: 'defeat', message: 'Mina acionada. A missão solo foi encerrada.' })
      writeLog(next, player, 'reveal', cellId, 0, true, -50, actionId)
      next.revision += 1
      return { accepted: true, nextState: next, events }
    }
    return commit(next, player, 'reveal', cellId, 0, true, -50, actionId, events)
  }

  const { board, revealed } = revealSafeArea(next.board, cellId, next.config)
  next.board = board
  const scoreDelta = scoreForSafeReveal(revealed.length)
  player.rawScore += scoreDelta
  player.manualSafe += 1
  player.autoSafe += Math.max(0, revealed.length - 1)
  player.xpTotal += xpForSafeReveal(revealed.length)
  events.push({ kind: 'safe-reveal', message: `${player.name} reconheceu ${revealed.length} setor${revealed.length === 1 ? '' : 'es'} seguro${revealed.length === 1 ? '' : 's'}.` })
  return commit(next, player, 'reveal', cellId, revealed.length, false, scoreDelta, actionId, events)
}

export function toggleFlag(game: GameState, playerId: string, cellId: string, actionId = id('action')): ActionResult {
  const denied = actionAllowed(game, playerId, actionId, cellId)
  if (denied) return reject(denied)
  const next = clone(game)
  const cell = next.board.cells.find((item) => item.id === cellId)!
  if (cell.revealed) return reject('Setor já reconhecido.')
  const player = currentPlayer(next)
  player.validActions += 1
  const events: GameEvent[] = []

  if (cell.flagOwnerId) {
    cell.flagOwnerId = undefined
    events.push({ kind: 'unflag', message: `${player.name} retirou um sinalizador.` })
    return commit(next, player, 'unflag', cellId, 0, false, 0, actionId, events)
  }
  if (flagCount(next) >= next.config.mineCount) return reject('Todos os sinalizadores disponíveis já estão em campo.')
  cell.flagOwnerId = playerId
  events.push({ kind: 'flag', message: `${player.name} posicionou um sinalizador.` })
  return commit(next, player, 'flag', cellId, 0, false, 0, actionId, events)
}

export function assertInvariants(game: GameState) {
  const expectedCells = game.config.width * game.config.height
  if (game.board.cells.length !== expectedCells) throw new Error('Tabuleiro com tamanho inválido.')
  if (game.board.generated && mineCount(game.board) !== game.config.mineCount) throw new Error('Contagem de minas inválida.')
  if (game.players.length < 1 || game.players.length > 10) throw new Error('Quantidade de jogadores inválida.')
  if (game.phase === 'playing' && currentPlayer(game)?.lives <= 0) throw new Error('Turno aponta para participante eliminado.')
}

export function serializeGame(game: GameState) {
  return JSON.stringify(game)
}

export function deserializeAndValidate(serialized: string) {
  const game = JSON.parse(serialized) as GameState
  if (game.schemaVersion !== 1) throw new Error('Versão de salvamento não suportada.')
  assertInvariants(game)
  return game
}
