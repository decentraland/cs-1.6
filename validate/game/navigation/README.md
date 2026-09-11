# Bot navigation evidence

`rounds.json` records the complete existing solo test with grounded, moving bots:
freeze, three kills, CT win, automatic round reset, player death and T win, with
3/1 stats retained. The first navigation build failed before spawning bots because
the old fixed 10.026 m spawn height floated above Dust2's sloping floor. Floor
probing fixed that; `tests/navigation.test.mjs` now checks all three bot starts.

`routes.json` contains sampled positions from a second live round. The player
was moved to the original T spawn, out of sight of the initial encounter. Over
19.53 seconds the bots moved 83.24, 53.20 and 42.34 m from their starting points.
Samples stayed near navigation nodes, over actual collision floors, and within
the configured speed allowance. A bot patrolling toward T spawn reacquired the
player and dealt damage. `patrol.png` captures the player's location afterwards;
it is not a visual proof of every traversed route segment.

Run a separate scene checkout on port 8005 and serve stock Bevy on 8123. Launch
a muted agent-browser session named `cs16-navigation`, obtain its CDP URL, then:

```sh
node validate/game.mjs "$CS_CDP" validate/game/navigation/rounds.json --fresh-page
node validate/navigation.mjs "$CS_CDP"
```

The first command starts a fresh solo match. The navigation command waits for
the next healthy live round and moves the player to T spawn. Close the owned
browser and isolated server afterwards. Unit/geometry tests and the full build
are included in `npm run validate` (93 tests pass). The graph generator and its
collision-source hash are retained for reproduction.

This does not prove full CS bot AI, bomb tactics, navigation around dynamic
entities, agent avoidance, jumping/crouching, or exact player physics.
