export type SfxName = 'menu' | 'reveal' | 'flag' | 'mine' | 'victory' | 'defeat' | 'turn'

const soundPreferenceKey = 'vale-mines:sound-enabled'
let audioContext: AudioContext | undefined

export function getSoundEnabled() {
  return window.localStorage.getItem(soundPreferenceKey) !== 'false'
}

export function setSoundEnabled(enabled: boolean) {
  window.localStorage.setItem(soundPreferenceKey, String(enabled))
}

type Note = readonly [frequency: number, duration: number, offset?: number, wave?: OscillatorType]

const sequences: Record<SfxName, readonly Note[]> = {
  menu: [[440, .055], [660, .075, .06]],
  reveal: [[660, .045], [880, .07, .045]],
  flag: [[340, .07, 0, 'square'], [510, .055, .06, 'square']],
  mine: [[145, .18, 0, 'sawtooth'], [80, .24, .05, 'sawtooth']],
  victory: [[523, .08], [659, .08, .08], [784, .16, .16]],
  defeat: [[260, .1, 0, 'triangle'], [185, .16, .08, 'triangle'], [130, .23, .17, 'triangle']],
  turn: [[392, .045], [494, .06, .045]],
}

export function playSfx(name: SfxName, enabled: boolean) {
  if (!enabled || typeof window === 'undefined') return
  const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext
  if (!AudioContextConstructor) return

  audioContext ??= new AudioContextConstructor()
  const context = audioContext
  if (context.state === 'suspended') void context.resume()

  const start = context.currentTime
  for (const [frequency, duration, offset = 0, wave = 'sine'] of sequences[name]) {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const noteStart = start + offset
    oscillator.type = wave
    oscillator.frequency.setValueAtTime(frequency, noteStart)
    gain.gain.setValueAtTime(.0001, noteStart)
    gain.gain.exponentialRampToValueAtTime(.07, noteStart + .008)
    gain.gain.exponentialRampToValueAtTime(.0001, noteStart + duration)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(noteStart)
    oscillator.stop(noteStart + duration + .02)
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}
