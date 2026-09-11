export function menuPoint(width, height, x, y) {
  const scale = Math.min(width / 640, height / 480)
  return {
    x: (width - 640 * scale) / 2 + x * scale,
    y: (height - 480 * scale) / 2 + y * scale
  }
}

export function teamButtonPoint(width, height, team) {
  return menuPoint(width, height, 150, team === 1 ? 126 : 158)
}

export function practiceButtonPoint(width, height) {
  return menuPoint(width, height, 150, 318)
}

export function autoAssignButtonPoint(width, height) {
  return menuPoint(width, height, 150, 222)
}

export function spectatorButtonPoint(width, height) {
  return menuPoint(width, height, 150, 254)
}
