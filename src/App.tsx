import { useEffect, useMemo, useRef, useState } from 'react'
import backgroundUrl from './assets/art/command-post.png'
import generalUrl from './assets/art/general.png'
import { DIFFICULTIES } from './domain/board'
import type { DifficultyId, GameConfig, GameMode, GameState, PlayerProfile, RankingEntry } from './domain/contracts'
import { beginGame, createGame, createProfile, flagCount, pauseGame, remainingSafeCells, revealCell, toggleFlag } from './domain/engine'
import { visibleScore } from './domain/scoring'
import { levelForXP, rankForLevel, xpProgress } from './domain/xp'
import { cloudStatus } from './cloud/firebase'
import { localStore } from './storage/local'
import { getSoundEnabled, playSfx, setSoundEnabled as storeSoundEnabled, type SfxName } from './audio/sfx'
import './App.css'

type Screen = 'home' | 'setup' | 'briefing' | 'game' | 'ranking' | 'results'
type InteractionMode = 'reveal' | 'flag'

const localColors = ['#D9A441', '#77A87B', '#6FA8DC', '#D9534F', '#C084FC', '#F29E7E', '#5EEAD4', '#FCD34D', '#FB7185', '#A3E635']
const avatars = ['✦', '◆', '●', '▲', '⬟', '◈', '✹', '⬢', '✺', '✦']

function operationConfig(mode: GameMode, difficulty: DifficultyId, custom: { width: number; height: number; mineCount: number }): GameConfig {
  if (difficulty === 'custom') {
    const totalCells = custom.width * custom.height
    const density = custom.mineCount / totalCells
    const multiplier = Math.min(2.5, Math.max(.8, Math.round((.8 + totalCells / 480 * .7 + density * 4) * 10) / 10))
    return { mode, difficulty, width: custom.width, height: custom.height, mineCount: custom.mineCount, difficultyMultiplier: multiplier, livesPerPlayer: 3 }
  }
  const preset = DIFFICULTIES[difficulty as keyof typeof DIFFICULTIES] ?? DIFFICULTIES.recruta
  return {
    mode,
    difficulty,
    width: preset.width,
    height: preset.height,
    mineCount: preset.mineCount,
    difficultyMultiplier: preset.multiplier,
    livesPerPlayer: 3,
  }
}

function createActionId() {
  return crypto.randomUUID?.() ?? `action-${Date.now()}-${Math.round(Math.random() * 1e9)}`
}

function elapsedMs(game: GameState, now = Date.now()) {
  return game.elapsedMs + (game.phase === 'playing' && game.startedAt ? now - game.startedAt : 0)
}

function formatTime(milliseconds: number) {
  const total = Math.floor(milliseconds / 1000)
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`
}

function playerProfile(player: PlayerProfile): PlayerProfile {
  return {
    playerId: player.playerId,
    name: player.name,
    avatarId: player.avatarId,
    accentColor: player.accentColor,
    xpTotal: player.xpTotal,
    createdAt: player.createdAt,
    updatedAt: player.updatedAt,
  }
}

function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [game, setGame] = useState<GameState>()
  const [profiles, setProfiles] = useState<PlayerProfile[]>([])
  const [ranking, setRanking] = useState<RankingEntry[]>([])
  const [mode, setMode] = useState<GameMode>('solo')
  const [difficulty, setDifficulty] = useState<DifficultyId>('recruta')
  const [custom, setCustom] = useState({ width: 9, height: 9, mineCount: 10 })
  const [draftNames, setDraftNames] = useState(['Comandante'])
  const [message, setMessage] = useState('Operação pronta. Escolha uma missão para começar.')
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('reveal')
  const [inputLocked, setInputLocked] = useState(false)
  const [clock, setClock] = useState(0)
  const [soundEnabled, setSoundEnabled] = useState(() => getSoundEnabled())
  const lockRef = useRef(false)

  const play = (name: SfxName) => playSfx(name, soundEnabled)

  const toggleSound = () => {
    const next = !soundEnabled
    setSoundEnabled(next)
    storeSoundEnabled(next)
    if (next) playSfx('menu', true)
  }

  useEffect(() => {
    void Promise.all([localStore.loadGame(), localStore.loadProfiles(), localStore.loadRanking()]).then(([savedGame, savedProfiles, savedRanking]) => {
      setGame(savedGame)
      setProfiles(savedProfiles)
      setRanking(savedRanking)
    })
  }, [])

  useEffect(() => {
    if (game?.phase !== 'playing') return undefined
    const timer = window.setInterval(() => setClock(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [game?.phase])

  const currentPlayer = game ? game.players[game.currentTurnIndex] : undefined
  const missionTime = game ? game.elapsedMs + (game.phase === 'playing' && game.startedAt && clock ? Math.max(0, clock - game.startedAt) : 0) : 0
  const canContinue = Boolean(game && !game.finalized)

  const saveAndSetGame = (next: GameState) => {
    setGame(next)
    void localStore.saveGame(next)
  }

  const recordFinal = (finished: GameState) => {
    setProfiles((previous) => {
      const byId = new Map(previous.map((profile) => [profile.playerId, profile]))
      for (const profile of finished.players.map(playerProfile)) byId.set(profile.playerId, profile)
      const next = [...byId.values()]
      void localStore.saveProfiles(next)
      return next
    })
    setRanking((previous) => {
      const newEntries = finished.players
        .filter((player) => !previous.some((entry) => entry.matchId === finished.matchId && entry.playerId === player.playerId))
        .map((player) => ({
          entryId: `${finished.matchId}-${player.playerId}`,
          matchId: finished.matchId,
          playerId: player.playerId,
          name: player.name,
          mode: finished.config.mode,
          difficulty: finished.config.difficulty,
          score: visibleScore(player, finished.config),
          seconds: Math.floor(finished.elapsedMs / 1000),
          win: finished.phase === 'won',
          timestamp: finished.finishedAt ?? 0,
        }))
      const next = [...previous, ...newEntries].sort((a, b) => b.score - a.score).slice(0, 100)
      void localStore.saveRanking(next)
      return next
    })
    void localStore.clearGame()
  }

  const startSetup = (selected: GameMode) => {
    play('menu')
    setMode(selected)
    setDraftNames(selected === 'solo' ? ['Comandante'] : ['Jogador 1', 'Jogador 2'])
    setDifficulty('recruta')
    setScreen('setup')
  }

  const addParticipant = () => {
    if (draftNames.length < 10) setDraftNames((current) => [...current, `Jogador ${current.length + 1}`])
  }

  const moveParticipant = (from: number, direction: -1 | 1) => {
    const to = from + direction
    if (to < 0 || to >= draftNames.length) return
    setDraftNames((current) => {
      const next = [...current]
      ;[next[from], next[to]] = [next[to], next[from]]
      return next
    })
  }

  const startOperation = () => {
    const names = draftNames.map((name) => name.trim()).filter(Boolean)
    if ((mode === 'solo' && names.length !== 1) || (mode === 'hotseat' && names.length < 2)) {
      setMessage(mode === 'solo' ? 'A campanha solo exige um participante.' : 'Inclua ao menos dois participantes para a operação local.')
      return
    }
    const normalized = names.map((name) => name.toLocaleLowerCase('pt-BR'))
    if (new Set(normalized).size !== normalized.length || names.some((name) => name.length < 2 || name.length > 18)) {
      setMessage('Cada nome deve ser único e ter entre 2 e 18 caracteres.')
      return
    }
    const selectedProfiles = names.map((name, index) => {
      const known = profiles.find((profile) => profile.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))
      return known ?? { ...createProfile(name, index), avatarId: avatars[index], accentColor: localColors[index] }
    })
    const storedProfiles = [...profiles]
    for (const profile of selectedProfiles) {
      if (!storedProfiles.some((known) => known.playerId === profile.playerId)) storedProfiles.push(profile)
    }
    setProfiles(storedProfiles)
    void localStore.saveProfiles(storedProfiles)
    try {
      const next = createGame(operationConfig(mode, difficulty, custom), selectedProfiles)
      play('menu')
      saveAndSetGame(next)
      setMessage(mode === 'solo' ? 'Cada setor exige cautela. A primeira revelação é protegida.' : 'Uma ação válida passa o comando para o próximo participante ativo.')
      setScreen('briefing')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível preparar a missão.')
    }
  }

  const enterField = () => {
    if (!game) return
    const next = beginGame(game)
    play('menu')
    saveAndSetGame(next)
    setMessage('Reconheça o terreno. Clique esquerdo revela; clique direito posiciona sinalizador.')
    setScreen('game')
  }

  const continueOperation = () => {
    if (!game) return
    if (game.phase === 'briefing') {
      setScreen('briefing')
      return
    }
    const resumed = game.phase === 'paused' ? beginGame(game) : { ...game, startedAt: Date.now() }
    saveAndSetGame(resumed)
    setScreen('game')
  }

  const pauseOrResume = () => {
    if (!game) return
    if (game.phase === 'playing') {
      const paused = { ...pauseGame(game), elapsedMs: elapsedMs(game), startedAt: undefined }
      saveAndSetGame(paused)
      setMessage('Operação pausada e salva neste dispositivo.')
      play('menu')
    } else if (game.phase === 'paused') {
      saveAndSetGame(beginGame(game))
      setMessage('Operação retomada.')
      play('menu')
    }
  }

  const takeAction = (cellId: string, forcedMode: InteractionMode | undefined, eventTimestamp: number) => {
    if (!game || !currentPlayer || lockRef.current) return
    const now = performance.timeOrigin + eventTimestamp
    const prepared: GameState = { ...game, elapsedMs: elapsedMs(game, now), startedAt: now }
    const chosen = forcedMode ?? interactionMode
    const result = chosen === 'flag'
      ? toggleFlag(prepared, currentPlayer.playerId, cellId, createActionId())
      : revealCell(prepared, currentPlayer.playerId, cellId, createActionId())
    if (!result.accepted) {
      setMessage(result.reason)
      return
    }
    const lastEvent = result.events[result.events.length - 1]
    setMessage(lastEvent?.message ?? 'Ação registrada.')
    const isFinal = result.nextState.phase === 'won' || result.nextState.phase === 'lost'
    const sound = isFinal
      ? result.nextState.phase === 'won' ? 'victory' : 'defeat'
      : chosen === 'flag' ? 'flag' : lastEvent?.kind === 'mine-hit' ? 'mine' : game.config.mode === 'hotseat' ? 'turn' : 'reveal'
    play(sound)
    setGame(result.nextState)
    if (!isFinal) void localStore.saveGame(result.nextState)
    lockRef.current = true
    setInputLocked(true)
    if (isFinal) recordFinal(result.nextState)
    window.setTimeout(() => {
      lockRef.current = false
      setInputLocked(false)
      if (isFinal) setScreen('results')
    }, isFinal ? 700 : game.config.mode === 'hotseat' ? 700 : 180)
  }

  const replay = () => {
    if (!game) return
    const next = createGame(game.config, game.players.map(playerProfile))
    play('menu')
    saveAndSetGame(next)
    setMessage('Novo terreno gerado. A primeira revelação continuará segura.')
    setScreen('briefing')
  }

  const topRanking = useMemo(() => ranking.slice().sort((a, b) => b.score - a.score).slice(0, 10), [ranking])

  return (
    <main className="app-shell" style={{ '--battlefield': `url(${backgroundUrl})` } as React.CSSProperties}>
      <header className="topbar">
        <button className="brand" onClick={() => setScreen('home')} aria-label="Voltar ao comando central">
          <span className="brand-mark">✦</span>
          <span><strong>VALE MINES</strong><small>FRONTLINE</small></span>
        </button>
        <div className="save-indicator" title={cloudStatus}><span className="status-dot" /> SALVO NESTE DISPOSITIVO</div>
        <button className="sound-toggle" onClick={toggleSound} aria-pressed={soundEnabled} aria-label={soundEnabled ? 'Desativar efeitos sonoros' : 'Ativar efeitos sonoros'}>
          {soundEnabled ? '◖ SOM' : '◖ SOM OFF'}
        </button>
      </header>

      {screen === 'home' && <section className="home-screen">
        <div className="home-copy">
          <p className="eyebrow">VALE GAMES PLAY // OPERAÇÃO TÁTICA</p>
          <h1>A guerra começa no <em>próximo passo.</em></h1>
          <p className="lead">Um Campo Minado estratégico: revele setores seguros, marque ameaças e mantenha seu esquadrão em ação.</p>
          <div className="home-actions"><button className="button primary" onClick={() => startSetup('solo')}>Iniciar operação</button>{canContinue && <button className="button ghost" onClick={continueOperation}>Continuar operação</button>}</div>
          <div className="mode-chips"><button onClick={() => startSetup('solo')}><span>01</span> Campanha solo</button><button onClick={() => startSetup('hotseat')}><span>02–10</span> Operação local</button><button onClick={() => setScreen('ranking')}><span>★</span> Ranking local</button></div>
        </div>
        <div className="general-hero" aria-hidden="true"><img src={generalUrl} alt="" /></div>
        <div className="home-bottom"><span>PRIMEIRA REVELAÇÃO PROTEGIDA</span><span>•</span><span>JOGUE OFFLINE</span><span>•</span><span>MULTIPLAYER LOCAL</span></div>
      </section>}

      {screen === 'setup' && <section className="setup-screen panel-screen">
        <div className="section-title"><p className="eyebrow">PLANEJAMENTO DA MISSÃO</p><h2>Escolha a formação</h2></div>
        <div className="mode-selector">
          <button className={mode === 'solo' ? 'mission-card selected' : 'mission-card'} onClick={() => { play('menu'); setMode('solo'); setDraftNames(['Comandante']) }} aria-pressed={mode === 'solo'}><span className="mission-icon">◉</span><strong>Campanha solo</strong><small>Uma vida. Mina acionada encerra a missão.</small></button>
          <button className={mode === 'hotseat' ? 'mission-card selected' : 'mission-card'} onClick={() => { play('menu'); setMode('hotseat'); setDraftNames(['Jogador 1', 'Jogador 2']) }} aria-pressed={mode === 'hotseat'}><span className="mission-icon">◫</span><strong>Operação por turnos</strong><small>2–10 pessoas no mesmo aparelho. Três vidas por padrão.</small></button>
        </div>
        <h3 className="subheading">Dificuldade</h3>
        <div className="difficulty-grid">{Object.entries(DIFFICULTIES).map(([key, item]) => <button key={key} className={difficulty === key ? 'difficulty selected' : 'difficulty'} onClick={() => { play('menu'); setDifficulty(key as DifficultyId) }} aria-pressed={difficulty === key}><strong>{item.label}</strong><span>{item.width} × {item.height}</span><small>{item.mineCount} minas · ×{item.multiplier.toFixed(1)}</small></button>)}<button className={difficulty === 'custom' ? 'difficulty selected' : 'difficulty'} onClick={() => { play('menu'); setDifficulty('custom') }} aria-pressed={difficulty === 'custom'}><strong>Personalizado</strong><span>{custom.width} × {custom.height}</span><small>{custom.mineCount} minas · multiplicador calculado</small></button></div>
        {difficulty === 'custom' && <div className="custom-grid"><label>Largura<input type="number" min="7" max="30" value={custom.width} onChange={(event) => setCustom((value) => { const width = Math.min(30, Math.max(7, Number(event.target.value) || 7)); return { ...value, width, mineCount: Math.min(value.mineCount, width * value.height - 9) } })} /></label><label>Altura<input type="number" min="7" max="24" value={custom.height} onChange={(event) => setCustom((value) => { const height = Math.min(24, Math.max(7, Number(event.target.value) || 7)); return { ...value, height, mineCount: Math.min(value.mineCount, value.width * height - 9) } })} /></label><label>Minas<input type="number" min="1" max={custom.width * custom.height - 9} value={custom.mineCount} onChange={(event) => setCustom((value) => ({ ...value, mineCount: Math.min(value.width * value.height - 9, Math.max(1, Number(event.target.value) || 1)) }))} /></label></div>}
        <h3 className="subheading">{mode === 'solo' ? 'Identidade de campo' : `Esquadrão local (${draftNames.length}/10)`}</h3>
        <div className="roster-editor">{draftNames.map((name, index) => <label className="roster-row" key={`${index}-${name}`}><span className="avatar" style={{ backgroundColor: localColors[index] }}>{avatars[index]}</span><input value={name} maxLength={18} onChange={(event) => setDraftNames((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} aria-label={`Nome do participante ${index + 1}`} />{mode === 'hotseat' && <span className="roster-actions"><button className="icon-button" disabled={index === 0} onClick={() => moveParticipant(index, -1)} aria-label={`Mover ${name} para cima`}>↑</button><button className="icon-button" disabled={index === draftNames.length - 1} onClick={() => moveParticipant(index, 1)} aria-label={`Mover ${name} para baixo`}>↓</button>{draftNames.length > 2 && <button className="icon-button" onClick={() => setDraftNames((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remover ${name}`}>×</button>}</span>}</label>)}{mode === 'hotseat' && draftNames.length < 10 && <button className="add-player" onClick={addParticipant}>+ Incluir participante</button>}</div>
        <p className="message-line">{message}</p><div className="screen-actions"><button className="button ghost" onClick={() => setScreen('home')}>Voltar</button><button className="button primary" onClick={startOperation}>Confirmar missão</button></div>
      </section>}

      {screen === 'briefing' && game && <section className="briefing-screen panel-screen">
        <div className="briefing-general"><img src={generalUrl} alt="General fictício apontando para o mapa da missão" /></div>
        <div className="briefing-copy"><p className="eyebrow">BRIEFING // {game.config.mode === 'solo' ? 'CAMPANHA SOLO' : 'OPERAÇÃO LOCAL'}</p><h2>Atenção, soldados.<br />Cada setor conta.</h2><p>Terreno: <strong>{DIFFICULTIES[game.config.difficulty as keyof typeof DIFFICULTIES]?.label ?? 'Personalizado'}</strong> · {game.config.width} × {game.config.height} setores · {game.config.mineCount} minas.</p><ul><li>A primeira revelação e a área 3 × 3 ao redor dela nunca contêm mina.</li><li>{game.config.mode === 'solo' ? 'Uma mina encerra a missão.' : 'Cada ação válida transfere o comando ao próximo participante ativo.'}</li><li>Sinalizadores ajudam no raciocínio; a pontuação deles só é validada no fim.</li></ul><button className="button primary" onClick={enterField}>Entrar no campo</button></div>
      </section>}

      {screen === 'game' && game && currentPlayer && <section className="game-screen">
        <div className="game-hud"><div><small>MISSÃO</small><strong>{DIFFICULTIES[game.config.difficulty as keyof typeof DIFFICULTIES]?.label ?? 'Personalizado'}</strong></div><div><small>SINALIZADORES</small><strong>{game.config.mineCount - flagCount(game)}</strong></div><div><small>SETORES SEGUROS</small><strong>{remainingSafeCells(game)}</strong></div><div><small>TEMPO</small><strong>{formatTime(missionTime)}</strong></div><button className="pause-button" onClick={pauseOrResume}>{game.phase === 'paused' ? 'Retomar' : 'Pausar'}</button></div>
        <aside className="general-panel"><img src={generalUrl} alt="General de comando" /><div><p className="eyebrow">COMANDO</p><p>{message}</p></div></aside>
        <section className="field-panel">
          <div className="turn-banner" aria-live="polite" style={{ '--accent': currentPlayer.accentColor } as React.CSSProperties}><span className="avatar" style={{ backgroundColor: currentPlayer.accentColor }}>{currentPlayer.avatarId}</span><div><small>{game.config.mode === 'hotseat' ? 'AGORA É A VEZ DE' : 'EM OPERAÇÃO'}</small><strong>{currentPlayer.name}</strong></div><span className="turn-count">TURNO {game.turnNumber}</span></div>
          <div className="board-viewport" aria-label="Campo minado navegável"><div className="mine-board" style={{ '--columns': game.config.width } as React.CSSProperties}>{game.board.cells.map((cell) => {
            const content = cell.flagOwnerId ? '⚑' : cell.revealed && cell.hasMine ? '✹' : cell.revealed && cell.neighborCount > 0 ? cell.neighborCount : ''
            const classes = ['mine-cell', cell.revealed ? 'revealed' : 'closed', cell.flagOwnerId ? 'flagged' : '', cell.exploded ? 'exploded' : ''].filter(Boolean).join(' ')
            return <button key={cell.id} className={classes} data-number={cell.neighborCount || undefined} disabled={inputLocked || game.phase !== 'playing'} aria-label={`Linha ${cell.row + 1}, coluna ${cell.column + 1}, ${cell.revealed ? cell.hasMine ? 'mina revelada' : cell.neighborCount ? `${cell.neighborCount} minas vizinhas` : 'segura' : cell.flagOwnerId ? 'sinalizada' : 'fechada'}`} onClick={(event) => takeAction(cell.id, undefined, event.timeStamp)} onContextMenu={(event) => { event.preventDefault(); takeAction(cell.id, 'flag', event.timeStamp) }} onKeyDown={(event) => { if (event.key.toLowerCase() === 'f') { event.preventDefault(); takeAction(cell.id, 'flag', event.timeStamp) } }}>{content}</button>
          })}</div></div>
          <div className="field-controls"><button className={interactionMode === 'reveal' ? 'control selected' : 'control'} onClick={() => setInteractionMode('reveal')}>⌖ Revelar</button><button className={interactionMode === 'flag' ? 'control selected' : 'control'} onClick={() => setInteractionMode('flag')}>⚑ Sinalizar</button><span>Toque usa o modo selecionado. No computador, clique direito sinaliza.</span></div>
        </section>
        <aside className="score-panel"><p className="eyebrow">ESQUADRÃO</p><div className="score-list">{game.players.map((player, index) => {
          const level = levelForXP(player.xpTotal)
          return <div className={index === game.currentTurnIndex && game.phase === 'playing' ? 'score-row active' : `score-row ${player.lives <= 0 ? 'eliminated' : ''}`} key={player.playerId} style={{ '--accent': player.accentColor } as React.CSSProperties}><span className="avatar" style={{ backgroundColor: player.accentColor }}>{player.avatarId}</span><div className="player-name"><strong>{player.name}</strong><small>{rankForLevel(level)} · Nv. {level}</small></div><div className="player-stats"><span>{'♥'.repeat(Math.max(0, player.lives)) || '—'}</span><strong>{visibleScore(player, game.config)} pts</strong></div></div>
        })}</div></aside>
      </section>}

      {screen === 'results' && game && <section className="results-screen panel-screen"><div className="result-glow" /><p className="eyebrow">DEBRIEFING FINAL</p><h2>{game.phase === 'won' ? 'Missão cumprida.' : 'Reorganize o esquadrão.'}</h2><p className="lead">{game.phase === 'won' ? 'Todos os setores seguros foram reconhecidos.' : 'O campo continua lá. Ajuste a estratégia e tente novamente.'}</p><div className="result-list">{game.players.slice().sort((a, b) => visibleScore(b, game.config) - visibleScore(a, game.config)).map((player, index) => { const xp = xpProgress(player.xpTotal); return <article className="result-row" key={player.playerId}><span className="placement">{index + 1}</span><span className="avatar" style={{ backgroundColor: player.accentColor }}>{player.avatarId}</span><div><strong>{player.name}</strong><small>{player.manualSafe} descobertas manuais · {player.hitMines} minas acionadas</small></div><div className="result-xp"><strong>{visibleScore(player, game.config)} pts</strong><small>Nv. {xp.level} · {rankForLevel(xp.level)} · {xp.current}/{xp.target} XP</small></div></article>})}</div><div className="screen-actions"><button className="button ghost" onClick={() => setScreen('home')}>Comando central</button><button className="button primary" onClick={replay}>Revanche</button></div></section>}

      {screen === 'ranking' && <section className="ranking-screen panel-screen"><div className="section-title"><p className="eyebrow">ARQUIVO LOCAL</p><h2>Ranking de operações</h2><p>Resultados reais salvos apenas neste dispositivo.</p></div>{topRanking.length === 0 ? <div className="empty-state">Nenhuma missão concluída ainda. Entre no campo para estabelecer o primeiro recorde.</div> : <div className="ranking-list">{topRanking.map((entry, index) => <article key={entry.entryId} className="ranking-row"><strong>#{index + 1}</strong><span>{entry.name}</span><small>{entry.mode === 'solo' ? 'Solo' : 'Turnos'} · {entry.difficulty}</small><b>{entry.score} pts</b></article>)}</div>}<div className="screen-actions"><button className="button primary" onClick={() => setScreen('home')}>Voltar ao comando</button></div></section>}
    </main>
  )
}

export default App
