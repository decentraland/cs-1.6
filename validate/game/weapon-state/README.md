# Weapon accuracy lifecycle — 2026-09-22

Before: the generic draw reset lost item accuracy/history. The nine new item-state
cases and one new camera case all fail against the preceding scene source. Seven
existing switch/punch cases still pass. [Before: 17 tests, 10 failures](before-tests.log).

After: **55 focused tests pass**, including weapon state, camera switches,
reload parity, bot fallback/death, Elite hands, rebuy and auto-buy.
[Focused log](after-tests.log). The complete **521-test gate**, asset validation,
bundle and typecheck pass. [Full gate](full-gate.log).

```sh
node --experimental-strip-types --test tests/weapon-item-state.test.mjs \
  tests/weapon-switch-recoil.test.mjs tests/weapon-reload-parity.test.mjs \
  tests/bot-loadout.test.mjs tests/elite-hands.test.mjs \
  tests/rebuy.test.mjs tests/autobuy.test.mjs
npm run validate
```

The lifecycle check runs real server shooting, inventory selection and equipment
code through its message handlers. SDK serialization checks preserve zero/false
and `1790090400.125` through actual inventory/drop/weapon schemas. The camera test
uses an airborne fixture: spread 0.118125 after drawing stored accuracy, then
0.009 after recovery; repeated component updates cannot reset it. Bot tests cover
fallback and death/item transfer without transferring another player's punch.

[The source assignment matrix](source-audit.json) records pinned hashes for all
24 deploy implementations. SG550's Spawn/Deploy also received a static check
against the original server binary. [Disassembly](sg550-spawn-deploy.asm).
The inferred zero initial accuracy is supported by zeroed engine allocation;
this is not an original-client runtime comparison.

No browser, preview server, native Explorer or original CS client was launched.
The mobile input regressions remain included in the full gate; actual phone
behavior still needs verification. Component schema changes require refreshing
both server and clients. [Behavior, sources and limits](../../../docs/CS16-WEAPON-STATE.md).
