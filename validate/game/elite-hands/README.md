# Dual Elites hand and animation correction

The former center-origin/parity-animation implementation disagreed with the
source firing-hand state. [Rules and source links](../../../docs/CS16-DUAL-ELITES.md)
explain the offset, reload/deploy behavior, animation thresholds and limits.
[Pinned source hashes](source-references.json) identify the inspected references.
No game asset conversion or new media is included.

## Reproduce

From the scene root:

```sh
node --experimental-strip-types --test tests/elite-hands.test.mjs tests/elite-presentation.test.mjs tests/weapon-fire-animation.test.mjs tests/weapon-switch-recoil.test.mjs tests/arsenal.test.mjs tests/short-press.test.mjs tests/touch-equipment.test.mjs tests/remote-shot-sound.test.mjs
npm run validate
```

[Before](before-tests.log): all six initial hand regressions fail on the previous
source. These are assertion failures, not missing test dependencies. Five further
checks were added for acknowledgement ordering, source-offset head contact, SDK
Room transport and actual camera/Animator components. [After](after-tests.log):
all 49 focused tests pass. [Full gate](full-gate.log): 503 tests, assets, build and
typecheck pass. Two existing expectations were corrected: the Elite animation
selector now receives the firing hand, and its remote sound originates at the
source-offset muzzle instead of the eye.

The new checks cover:

- Even/odd magazine deployment and storage; partial reload preservation; accepted,
  rejected and duplicated server requests; bot alternation and dropped state.
- Left/right 0.125-metre offsets with yaw, pitch and residual recoil. The other
  23 guns retain their prior origins. An offset changes a controlled head contact.
- Animation thresholds, both last-shot clips and the one-round idle pose through
  the production view code and installed SDK Animator. Actual camera prediction
  supplies the corresponding left/right rays.
- Production desktop/touch firing and real binary Room messages with intentionally
  stale weapon components. Three successive server/predicted origins agree within
  0.00001 m, allowing float32 serialization. Right-hand mode zero survives the wire.
- Confirmation before/after component updates, rejected predictions, out-of-order
  replies, previous deployments and new rounds.

These are controlled scene/SDK regressions. No browser, native phone or original
CS engine was launched, so rendered model mirroring, perceived timing and native
multitouch are not established. The creator's preview was not restarted.
