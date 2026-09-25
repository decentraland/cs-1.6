# Empty-trigger regression

From the scene root:

```sh
node --experimental-strip-types --test tests/empty-trigger.test.mjs
npm run validate
```

[Before](before-tests.log): all eight new cases failed.
[After](after-tests.log): the complete gate passes 436 tests, source/asset checks,
bundling and typecheck. The test adapter was corrected to record recoil calls
without accidentally returning the array length as a predicted shot plan.

The regression uses production client/server logic with controlled ECS and clock
adapters. Its transport case passes empty intents through the installed SDK Room,
checks the remote sound event and rejects a duplicate local click. Already
initialized players skip the fixture's join command. It does not exercise live
CRDT delivery or a native phone. No browser/client was launched.

[Behavior, source references and limits](../../../docs/CS16-EMPTY-TRIGGER.md).
