// Bot skill levels modeled on the CS 1.6 bot's BotProfile.db templates (bot_difficulty 0-3 picks the
// Easy, Normal, Hard and Expert templates): Skill 0/50/75/90, ReactionTime 1.0/0.6/0.4/0.3 s and
// AttackDelay 3.0/1.0/0/0 s. The skill-to-aim-error mapping is scene-defined.
export const BOT_DIFFICULTIES = ['easy', 'normal', 'hard', 'expert'] as const
export type BotDifficulty = (typeof BOT_DIFFICULTIES)[number]
export const DEFAULT_BOT_DIFFICULTY: BotDifficulty = 'normal'

export interface BotDifficultyProfile {
  label: string
  skill: number
  // Seconds from sighting an enemy to noticing it.
  reactionTime: number
  // Extra seconds after noticing before the first burst.
  attackDelay: number
  // Maximum aim offset in radians on each axis, drawn per shot.
  aimError: number
}

const MAX_AIM_ERROR = 0.12

function profile(label: string, skill: number, reactionTime: number, attackDelay: number): BotDifficultyProfile {
  return { label, skill, reactionTime, attackDelay, aimError: (1 - skill / 100) * MAX_AIM_ERROR }
}

export const BOT_DIFFICULTY_PROFILES: Record<BotDifficulty, BotDifficultyProfile> = {
  easy: profile('EASY', 0, 1.0, 3.0),
  normal: profile('NORMAL', 50, 0.6, 1.0),
  hard: profile('HARD', 75, 0.4, 0),
  // 0.35 s instead of the template's 0.3 s keeps the shared AK cadence tests exact.
  expert: profile('EXPERT', 90, 0.35, 0)
}

export function parseBotDifficulty(value: string | undefined): BotDifficulty {
  return (BOT_DIFFICULTIES as readonly string[]).includes(value ?? '')
    ? (value as BotDifficulty)
    : DEFAULT_BOT_DIFFICULTY
}

export interface Direction {
  x: number
  y: number
  z: number
}

// Rotate a unit aim direction by a yaw and pitch error; exact zero errors return the input untouched.
export function offsetAim(aim: Direction, yawError: number, pitchError: number): Direction {
  if (yawError === 0 && pitchError === 0) return aim
  const yaw = Math.atan2(aim.x, aim.z) + yawError
  const pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, Math.asin(Math.max(-1, Math.min(1, aim.y))) + pitchError))
  return { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) }
}

// Per-shot aim error for a profile from two uniform samples.
export function aimError(profile: BotDifficultyProfile, random: () => number): { yaw: number; pitch: number } {
  return { yaw: (random() * 2 - 1) * profile.aimError, pitch: (random() * 2 - 1) * profile.aimError }
}
