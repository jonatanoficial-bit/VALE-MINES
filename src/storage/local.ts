import type { GameState, PlayerProfile, RankingEntry } from '../domain/contracts'

const DB_NAME = 'vale-mines-frontline'
const STORE = 'state'
const FALLBACK_PREFIX = 'vale-mines:'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function read<T>(key: string): Promise<T | undefined> {
  try {
    const db = await openDatabase()
    return await new Promise<T | undefined>((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
      request.onsuccess = () => resolve(request.result as T | undefined)
      request.onerror = () => reject(request.error)
    })
  } catch {
    const fallback = localStorage.getItem(`${FALLBACK_PREFIX}${key}`)
    return fallback ? JSON.parse(fallback) as T : undefined
  }
}

async function write<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite')
      transaction.objectStore(STORE).put(value, key)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  } catch {
    localStorage.setItem(`${FALLBACK_PREFIX}${key}`, JSON.stringify(value))
  }
}

async function remove(key: string): Promise<void> {
  try {
    const db = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite')
      transaction.objectStore(STORE).delete(key)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  } catch {
    localStorage.removeItem(`${FALLBACK_PREFIX}${key}`)
  }
}

export const localStore = {
  loadGame: () => read<GameState>('active-game'),
  saveGame: (game: GameState) => write('active-game', game),
  clearGame: () => remove('active-game'),
  loadProfiles: async () => (await read<PlayerProfile[]>('profiles')) ?? [],
  saveProfiles: (profiles: PlayerProfile[]) => write('profiles', profiles),
  loadRanking: async () => (await read<RankingEntry[]>('ranking')) ?? [],
  saveRanking: (ranking: RankingEntry[]) => write('ranking', ranking),
}
