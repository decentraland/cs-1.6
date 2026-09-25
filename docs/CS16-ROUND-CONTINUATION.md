# Play through the round result

The five-second result countdown no longer freezes surviving players or bots.
Movement, gun/knife attacks, grenades, reloads, alternate modes, switching weapons,
drops and pickups remain available. Crosshair, scopes and mobile controls stay
visible. A FIRE hold continues across the result transition; death, menus, match
end and a new round still cancel touch holds.

The winner and team score are settled once. Subsequent kills affect personal
scores, kill rewards and survival: a player killed during the result loses their
loadout on respawn. The existing next-round reset owns respawn and ground-item
cleanup. Bomb planting/defusing stays closed once the objective result is settled.
First-to-16 still ends the match without an automatic side switch.

`round-rules.ts` shares combat/equipment eligibility between adapters. Freeze
permits equipment handling and reloads, but blocks attacks and movement. Lobby,
waiting and match end block both. Delayed shots are checked again at execution;
their originating round must still match. Grenade effects can finish during the
result, while a completed match no longer receives new grenade damage.

Reference: pinned [TerminateRound](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/gamerules.h#L828)
records the winner and restart deadline. The [weapon frame handler](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/weapons.cpp#L1084)
checks the freeze period before firing; the [restart routine](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/multiplay_gamerules.cpp#L1729)
starts that freeze at the next round. These separate states are the basis for
keeping result-time combat active.

## Verification

Run `npm run validate`. `tests/round-continuation.test.mjs` covers actual server
hits, duplicate rejection, queued-shot transitions, all 24 client firearm paths,
knife attacks, alternate controls, grenade input and mobile button availability.
Existing reload and locomotion adapter tests cover the result phases too.
Before the change, the focused server-fire, client-fire and mobile-controls cases
all fail; afterward they pass. [Browser evidence and fixture](../validate/game/round-continuation/README.md).

Native phone multitouch and a complete first-to-16 human match remain separate
acceptance checks. These regressions do not establish either.
