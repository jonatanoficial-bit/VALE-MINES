export function levelForXP(xpTotal: number) {
  let level = 1
  let remaining = xpTotal
  while (remaining >= 100 + 25 * (level - 1)) {
    remaining -= 100 + 25 * (level - 1)
    level += 1
  }
  return level
}

export function xpProgress(xpTotal: number) {
  const level = levelForXP(xpTotal)
  let spent = 0
  for (let current = 1; current < level; current += 1) spent += 100 + 25 * (current - 1)
  const current = xpTotal - spent
  const target = 100 + 25 * (level - 1)
  return { level, current, target, percent: Math.min(100, Math.round((current / target) * 100)) }
}

export function rankForLevel(level: number) {
  if (level >= 80) return 'General de Campo'
  if (level >= 60) return 'Coronel'
  if (level >= 45) return 'Major'
  if (level >= 30) return 'Capitão'
  if (level >= 20) return 'Tenente'
  if (level >= 10) return 'Sargento'
  if (level >= 5) return 'Soldado'
  return 'Recruta'
}
