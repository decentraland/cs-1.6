import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { BitmapText, bitmapTextWidth, scoreFontSize } from './bitmap-text'
import { DEATH_ICONS } from './death-icons'
import type { DeathIcon } from './death-icons'
import { deathIconKey } from './kill-feed'
import type { FeedEntry } from './kill-feed'

const iconColor = Color4.create(1, 80 / 255, 0, 1)
const nameColor = (team?: number) =>
  team === 1
    ? Color4.create(1, 64 / 255, 64 / 255, 1)
    : team === 2
      ? Color4.create(153 / 255, 204 / 255, 1, 1)
      : Color4.create(1, 0.7, 0, 1)

function Icon({ icon, left, rowHeight }: { icon: DeathIcon; left: number; rowHeight: number }) {
  const [x, y, width, height] = icon.rect
  const u = x / 256,
    right = (x + width) / 256,
    top = 1 - y / 256,
    bottom = 1 - (y + height) / 256
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left, top: Math.floor((rowHeight - height) / 2) },
        width,
        height,
        pointerFilter: 'none'
      }}
      uiBackground={{
        texture: { src: `assets/ui/death-${icon.sprite}.png`, filterMode: 'point' },
        textureMode: 'stretch',
        uvs: [u, bottom, u, top, right, top, right, bottom],
        color: iconColor
      }}
    />
  )
}

export function KillFeed({
  entries,
  width,
  height,
  observing
}: {
  entries: readonly FeedEntry[]
  width: number
  height: number
  observing: boolean
}) {
  const size = scoreFontSize(height)
  const rowHeight = Math.max(20, size + 4)
  const top = (observing ? height / 5 : (height * 32) / 480) + 2
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', width, height, pointerFilter: 'none' }}>
      {entries.map((entry, index) => {
        const icon = DEATH_ICONS[deathIconKey(entry.weapon)]
        const headshot = entry.headshot ? DEATH_ICONS.headshot : undefined
        const killer = entry.suicide || !entry.killer ? '' : entry.killer
        const gap = killer ? 5 : 0
        const iconWidth = icon.rect[2] + (headshot?.rect[2] ?? 0)
        const space = Math.max(0, width - 8 - iconWidth - gap)
        const victimWidth = Math.min(bitmapTextWidth(entry.victim, size), killer ? space / 2 : space)
        const killerWidth = Math.min(bitmapTextWidth(killer, size), space - victimWidth)
        const rowWidth = killerWidth + gap + iconWidth + victimWidth
        return (
          <UiEntity
            key={String(entry.id)}
            uiTransform={{
              positionType: 'absolute',
              position: { left: width - rowWidth - 4, top: top + index * rowHeight },
              width: rowWidth,
              height: rowHeight,
              pointerFilter: 'none'
            }}
          >
            {killer && (
              <BitmapText
                value={killer}
                left={0}
                width={killerWidth}
                height={rowHeight}
                size={size}
                color={nameColor(entry.killerTeam)}
              />
            )}
            <Icon icon={icon} left={killerWidth + gap} rowHeight={rowHeight} />
            {headshot && <Icon icon={headshot} left={killerWidth + gap + icon.rect[2]} rowHeight={rowHeight} />}
            <BitmapText
              value={entry.victim}
              left={killerWidth + gap + iconWidth}
              width={victimWidth}
              height={rowHeight}
              size={size}
              color={nameColor(entry.victimTeam)}
            />
          </UiEntity>
        )
      })}
    </UiEntity>
  )
}
