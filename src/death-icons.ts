export interface DeathIcon {
  sprite: string
  rect: readonly [number, number, number, number]
}
export const DEATH_ICONS: Record<string, DeathIcon> = {
  knife: {
    sprite: '640hud1',
    rect: [192, 0, 48, 16]
  },
  ak47: {
    sprite: '640hud1',
    rect: [192, 80, 48, 16]
  },
  awp: {
    sprite: '640hud1',
    rect: [192, 128, 48, 16]
  },
  deagle: {
    sprite: '640hud1',
    rect: [224, 16, 32, 16]
  },
  famas: {
    sprite: '640hud2',
    rect: [192, 144, 48, 16]
  },
  fiveseven: {
    sprite: '640hud16',
    rect: [192, 0, 32, 16]
  },
  flashbang: {
    sprite: '640hud1',
    rect: [192, 192, 48, 16]
  },
  g3sg1: {
    sprite: '640hud1',
    rect: [192, 144, 48, 16]
  },
  galil: {
    sprite: '640hud2',
    rect: [192, 160, 48, 16]
  },
  glock18: {
    sprite: '640hud1',
    rect: [192, 16, 32, 16]
  },
  grenade: {
    sprite: '640hud1',
    rect: [224, 192, 32, 16]
  },
  m249: {
    sprite: '640hud1',
    rect: [192, 160, 48, 16]
  },
  m3: {
    sprite: '640hud1',
    rect: [192, 48, 48, 16]
  },
  m4a1: {
    sprite: '640hud1',
    rect: [192, 96, 48, 16]
  },
  mp5navy: {
    sprite: '640hud1',
    rect: [192, 64, 32, 16]
  },
  p228: {
    sprite: '640hud1',
    rect: [224, 32, 32, 16]
  },
  p90: {
    sprite: '640hud1',
    rect: [192, 176, 48, 16]
  },
  scout: {
    sprite: '640hud1',
    rect: [192, 208, 48, 16]
  },
  sg550: {
    sprite: '640hud16',
    rect: [192, 48, 48, 16]
  },
  sg552: {
    sprite: '640hud1',
    rect: [192, 112, 48, 16]
  },
  ump45: {
    sprite: '640hud16',
    rect: [192, 80, 48, 16]
  },
  usp: {
    sprite: '640hud1',
    rect: [192, 32, 32, 16]
  },
  tmp: {
    sprite: '640hud1',
    rect: [224, 64, 32, 16]
  },
  xm1014: {
    sprite: '640hud1',
    rect: [192, 224, 48, 16]
  },
  skull: {
    sprite: '640hud1',
    rect: [224, 240, 32, 16]
  },
  tracktrain: {
    sprite: '640hud1',
    rect: [192, 240, 32, 16]
  },
  aug: {
    sprite: '640hud1',
    rect: [148, 240, 44, 16]
  },
  mac10: {
    sprite: '640hud1',
    rect: [109, 240, 34, 16]
  },
  elite: {
    sprite: '640hud1',
    rect: [52, 240, 57, 16]
  },
  headshot: {
    sprite: '640hud1',
    rect: [0, 240, 36, 16]
  }
}
