# Shotgun and penetration observation regression

Run from the scene root:

```sh
node --experimental-strip-types --test tests/pellet-claims.test.mjs
npm run validate
```

The client previously considered only the first pellet and stopped at the first
wall when reporting an observed target position. The server already resolved all
pellets and penetration. The client now shares that trace, without changing the
server's weapon formulas or granting client-owned damage.

[Before](before-tests.log): four failing cases, one passing clear-sight guard.
[After](after-tests.log): all 37 selected combat/input cases pass.
[Full gate](full-gate.log): 441 tests, assets, bundle and typecheck pass.

- The M3/XM1014 fixture uses seed 1234 and shot 1. The first pellet misses;
  later pellets hit arms, head and arms. A 30 cm observed-position offset is
  within the existing server validation bound. Production client messages pass
  through SDK Room to the production server; the target goes from 100 health
  to dead, one shell is spent and a replay cannot award another kill.
- The door case uses the existing Dust2 middle-door collision, with targets
  behind it. AK/M4/AWP/Deagle report the target; USP and shotgun pellets do not.
- An empty-world adapter isolates the M3's 75 m and XM1014's 76.2 m ranges from
  the map walls. A target 80 m away cannot become an observation.
- Clear-sight observations remain present for all 24 guns. The desktop fixture
  establishes pointer capture before firing; the touch fixture uses its dedicated
  fire action. Neither simulates a native touchscreen renderer.

A separate [comparison](server-equivalence.log) matched 612 old/new server
results across all 24 guns, modes, zooms, ground/air states and seeds after
extracting the shared trace. This is a refactor equivalence check, not proof of
complete GoldSrc parity.

ECS state, clock and transport delivery are controlled test adapters; live CRDT
transport and avatar smoothing still require playtesting. Only one observed
target position is sent per shot. At this step the visible marker still showed
the first impact. The subsequent [surface-feedback change](../bullet-impacts/README.md)
adds original decals for all contacts. No browser or native client was launched
for this observation regression. [Human rewind rules](../../../docs/CS16-HUMAN-REWIND.md).
