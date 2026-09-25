# Switching timer regression evidence — 2026-09-22

Silencer and knife attack locks used to disappear on reselecting the weapon.
See [the source audit and behavior](../../../docs/CS16-SWITCH-TIMERS.md).

- [Before](before-tests.log): final 11-case regression file against an unchanged
  copy of the previous scene source; nine failures, two passing guard cases.
- [After](focused-tests.log): 24 focused tests pass, including all 11 new cases,
  existing action-deadline tests and bot-loadout tests.
- [Full gate](full-gate.log): `npm run validate` in the actual scene repository;
  532 tests pass, assets pass, SDK bundling/typecheck pass (exit 0).
- [Hashes](source-audit.json): inspected pinned source and before/after scene files.

Reproduce from the scene root:

```sh
node --experimental-strip-types --test tests/switch-timers.test.mjs tests/weapon-action-deadlines.test.mjs tests/bot-loadout.test.mjs
npm run validate
```

The input harness exercises desktop and touch paths with controlled clock and
transport; the wire test uses the installed SDK's actual serializer. These are
not native-phone, visual or live-network measurements. No browser, native client
or preview server was started. Refresh server and clients together for the new
component fields. Existing unrelated work was preserved.
