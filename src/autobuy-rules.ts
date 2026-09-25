export function* autoBuyItems(primary: () => string | undefined): Generator<string> {
  for (const id of ['m4a1', 'ak47', 'famas', 'galil', 'p90', 'mp5']) {
    yield 'weapon:' + id
    // CS stops once the attempted gun is carried, including an already-owned gun.
    if (primary() === id) break
  }
  yield 'ammo'
  yield 'secondaryammo'
  yield 'defusekit'
  yield 'assaultsuit'
  yield 'kevlar'
}
