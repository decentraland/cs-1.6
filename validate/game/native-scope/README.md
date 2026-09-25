# Native scope review

Checked 2026-09-21 in one muted, isolated headless Bevy browser. Hosted version:
`0.1.0-35345436542.commit-593f384`.

The three captures show actual world magnification at an unchanged camera
transform, with no TextureCamera component or duplicate scene render:

- [Unscoped 90 degrees](scope-90.png)
- [First zoom, 40 degrees](scope-40.png)
- [Second zoom, 10 degrees](scope-10.png)
- [Camera values, transform and bolt-cycle results](scope.json)

These CS horizontal-at-4:3 angles become 73.73979, 30.536943 and 7.508333
vertical degrees in VirtualCamera. A scoped AWP shot consumed one round,
unscoped through its bolt animation, and returned to the previous zoom.

## Reproduce

Prepare the [isolated arsenal fixture](../arsenal/README.md) from the current
scene, then start its server with `npm run start:server -- --port 8034`.
Use one isolated headless browser with loopback access to the preview. Keep the
CDP connection granting that permission open for the duration of the check.
Join CT, equip the starting AWP, close menus and capture the pointer. Start
unscoped, then run from the original scene repo:

```sh
node validate/arsenal-scope.mjs <browser-CDP-websocket> /tmp/cs16-native-scope-check
```

The harness checks all three FOV values, saves captures for visual comparison,
fires one round and checks automatic unscope/rescope. A changed component value
alone does not prove the renderer applied it; compare the world in the captures.
`validate/capture-review.mjs` additionally checks switching to a pistol restores
normal FOV and recapturing the pointer does not fire a shot. This also passed
with capture clicks lasting 10, 70 and 250 ms: [results](capture.json).

The scene validation gate passed: 331 tests, asset checks, bundle and typecheck.

The fixture pauses bots, starts with an AWP and $16000, extends rounds and allows
purchases throughout the round. This proves camera/weapon behavior, not match
balance. It does not verify Unity or mobile touch controls. Close the owned
browser and fixture server after the check.
