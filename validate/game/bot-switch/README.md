# Bot weapon switching

Run `node --test tests/bot-loadout.test.mjs` for six focused regressions or
`npm run validate` for the scene gate.

The tests call production inventory, firing and reload rules with exhausted
AK/M4A1/MP5 states. They check the carried pistol, deployment delay, reload
boundaries, finite/shared ammunition, and weighted death drops after switching.
They also cover keeping a reloadable primary and not inventing ammunition when
every carried gun is empty.

The server applies the switch only to living bots outside planting/defusing.
Its synced gun ID drives the existing held model and each shot's sound and
attacker name. This wiring passed bundle/typecheck; no browser was launched,
and rendered switching/presentation is not certified by these rule tests.

`source.json` records the source and dependencies for this pass.
