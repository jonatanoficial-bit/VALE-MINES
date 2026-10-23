export type GameMode = 'solo' | 'hotseat'
export type DifficultyId = 'recruta' | 'veterano' | 'general' | 'custom'
export type MatchPhase = 'briefing' | 'playing' | 'paused' | 'won' | 'lost'
export type ActionType = 'reveal' | 'flag' | 'unflag'

export interface GameConfig {
  mode: GameMode
  difficulty: DifficultyId
  width: number
  height: number
  mineCount: number
  difficultyMultiplier: number
  livesPerPlayer: number
}

export interface PlayerProfile {
  playerId: string
  name: string
  avatarId: string
  accentColor: string
  xpTotal: number
  createdAt: number
  updatedAt: number
}

export interface MatchPlayer extends PlayerProfile {
  lives: number
  rawScore: number
  manualSafe: number
  autoSafe: number
  hitMines: number
  validActions: number
}

export interface BoardCell {
  id: string
  row: number
  column: number
  hasMine: boolean
  neighborCount: number
  revealed: boolean
  exploded: boolean
  flagOwnerId?: string
}

export interface BoardState {
  generated: boolean
  cells: BoardCell[]
}

export interface ActionLog {
  actionId: string
  turnNumber: number
  playerId: string
  type: ActionType
  cellId: string
  revealedCount: number
  hitMine: boolean
  scoreDelta: number
  livesAfter: number
  createdAt: number
}

export interface GameState {
  schemaVersion: 1
  matchId: string
  config: GameConfig
  seed: number
  board: BoardState
  players: MatchPlayer[]
  phase: MatchPhase
  currentTurnIndex: number
  turnNumber: number
  firstRevealCellId?: string
  elapsedMs: number
  startedAt?: number
  finishedAt?: number
  actionIds: string[]
  actionLog: ActionLog[]
  revision: number
  finalized: boolean
}

export interface GameEvent {
  kind: 'safe-reveal' | 'mine-hit' | 'flag' | 'unflag' | 'turn' | 'victory' | 'defeat'
  message: string
}

export type ActionResult =
  | { accepted: false; reason: string }
  | { accepted: true; nextState: GameState; events: GameEvent[] }

export interface RankingEntry {
  entryId: string
  matchId: string
  playerId: string
  name: string
  mode: GameMode
  difficulty: DifficultyId
  score: number
  seconds: number
  win: boolean
  timestamp: number
}
