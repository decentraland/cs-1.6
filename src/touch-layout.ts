export interface ScreenInsets {
  left: number
  right: number
  top: number
  bottom: number
}

export function touchLayout(width: number, height: number, insets?: ScreenInsets) {
  const left = insets?.left ?? 0,
    top = insets?.top ?? 0
  const safeWidth = width - left - (insets?.right ?? 0)
  const safeHeight = height - top - (insets?.bottom ?? 0)
  const scale = Math.max(0.6875, Math.min(safeHeight / 720, safeWidth / 1000))
  return { left, top, width: safeWidth, height: safeHeight, scale }
}

export function touchControlLayout(width: number, height: number, insets?: ScreenInsets) {
  const safe = touchLayout(width, height, insets)
  const portrait = safe.height > safe.width
  const scale = Math.max(
    0.8,
    Math.min(
      width / (portrait ? 390 : 780),
      height / (portrait ? 844 : 360),
      safe.width / (portrait ? 336 : 640),
      safe.height / (portrait ? 560 : 340)
    )
  )
  return { ...safe, scale, portrait }
}

export function touchBuyLayout(width: number, height: number, count: number, insets?: ScreenInsets, purchase = false) {
  const safe = touchLayout(width, height, insets)
  const gap = 8 * safe.scale,
    margin = 16 * safe.scale
  const columns = safe.width >= 520 ? 2 : 1
  const rowCount = Math.max(1, Math.ceil(count / columns))
  const header = Math.max(44, 64 * safe.scale)
  const footer = Math.max(44, 64 * safe.scale)
  const purchaseHeight = purchase ? Math.max(56, 76 * safe.scale) : 0
  const purchaseSpace = purchase ? purchaseHeight + gap : 0
  const rowHeight = Math.max(
    48,
    Math.min(
      76 * safe.scale,
      (safe.height - header - footer - purchaseSpace - margin * 2 - gap * (rowCount - 1)) / rowCount
    )
  )
  const contentWidth = safe.width - margin * 2
  const buttonWidth = (contentWidth - gap * (columns - 1)) / columns
  return {
    ...safe,
    margin,
    gap,
    header,
    footer,
    purchaseHeight,
    rowHeight,
    contentHeight: rowCount * (rowHeight + gap) - gap,
    viewportHeight: safe.height - header - footer - purchaseSpace - margin * 2,
    buttonWidth,
    row: (index: number) => ({
      left: (index % columns) * (buttonWidth + gap),
      top: Math.floor(index / columns) * (rowHeight + gap)
    })
  }
}
