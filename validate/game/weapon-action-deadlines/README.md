# Weapon action deadline regression

From the scene root:

```sh
node --experimental-strip-types --test tests/weapon-action-deadlines.test.mjs
npm run validate
```

[Before](before-tests.log): six failing cases and one passing guard case.
[After](after-tests.log): all 34 cases in the selected deadline, cadence, arsenal,
held-reload and short-press suites pass, including all seven new cases. The full
gate passed 428 tests, assets and SDK build/typecheck.

The tests invoke production shooting, mode, reload and desktop/touch input code
with controlled time and transport. They reproduce retained zoom cooldowns,
retroactively lengthened primary cooldowns and waits after the third burst
bullet. No browser or native device was launched, and this does not validate
real mobile multitouch. [Rules and source links](../../../docs/CS16-WEAPON-ACTIONS.md).
