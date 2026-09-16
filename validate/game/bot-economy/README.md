# Bot economy validation

Run `npm run validate` in the scene. `tests/bot-economy.test.mjs` adds seven
checks for budgets, paid ammunition, survival/death, upgrades and armor.
The gate also checks all scene rules, asset integrity, bundling and types.
`source.json` records the source and dependency files used for this pass.

The kit-bots, hit-response and dual-hands fixtures were generated and typechecked
without starting a browser. Their shared arsenal setup now explicitly preserves
fixed rifle loadouts and skips bot buying, retaining their historical test setup.
Those fixtures are not evidence for the new economy.

No runtime/browser balance validation was performed. The creator is playtesting
menus, buying, feedback and round flow; see `docs/MVP-PLAYTEST.md`.
