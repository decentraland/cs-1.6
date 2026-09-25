# Auto-buy and rebuy

Open BUY → AUTO BUY or REBUY. Both platforms show these buttons beside the
numbered categories. Tap once on mobile or click on desktop. Mobile commits on
finger release; sliding off cancels. Results report
the amount spent; rebuy also reports skipped purchases. There are no F1/F2 bindings
in the SDK action set.

## Auto-buy

The original default order is M4A1, AK-47, FAMAS, Galil, P90, MP5. Each attempt
uses normal team and money checks. The list stops when the attempted weapon is
carried, including a weapon already owned before the command. Auto-buy can
replace a carried primary with an earlier choice. REBUY keeps a carried primary.

Next it fills primary and pistol ammo, attempts the CT defusal kit, then the
helmet/vest purchase with a vest-only fallback. It does not buy a new pistol,
grenades, nightvision or a shield by default. It does not reserve money for later
items: on a CT $800 pistol round, pistol ammo and a kit leave too little for a
vest. A damaged vest can be repaired on a later auto-buy.

The resulting loadout becomes the new rebuy snapshot. No custom priority editor
or Condition Zero career-task preferences are implemented.

## Rebuy rules

The server snapshots the carried equipment after a buy command inside the valid
buy window, including a failed purchase. Shooting, dropping, dying and changing
rounds do not replace that snapshot. Rebuy leaves it intact so a partial purchase
can be retried when more money becomes available. Match reset clears it.

The default order is primary, primary ammo, defusal kit, armor, HE, flashbangs,
smoke, pistol, pistol ammo, nightvision. Every purchase uses the same inventory,
team and money rules as an individual purchase. The request is authenticated and
subject to round, sequence, life, eligibility, buy-zone and buy-time checks.

- A carried primary is kept, even when different from the saved primary.
- The saved pistol replaces a different carried pistol.
- A reserve below its saved amount is filled as far as money allows; rebuy does
  not reload the magazine. Shared ammo pools are updated by the normal rules.
- Only missing grenade quantities are purchased.
- Armor is bought only when the saved armor class is higher. A damaged helmet
  and vest are not repaired by rebuy while that class is still equipped.

The saved plan stays on the server. The information panel therefore shows a description,
not a price quote; the result reports the actual cost. The tactical shield
remains unavailable.

## Sources

Behavior: [BuildRebuyStruct and Rebuy methods](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/player.cpp#L10124).
Default auto-buy priorities: [original autobuy.txt](https://github.com/u3games/CS-Server/blob/6ad155c7a610a85cfd443fcace2c97f2afcb2866/server/cstrike/autobuy.txt).
Rebuy order: [original rebuy.txt](https://github.com/u3games/CS-Server/blob/6ad155c7a610a85cfd443fcace2c97f2afcb2866/server/cstrike/rebuy.txt).
Desktop button position: [MainBuyMenu.res](https://github.com/u3games/CS-Server/blob/6ad155c7a610a85cfd443fcace2c97f2afcb2866/server/cstrike/resource/UI/MainBuyMenu.res).

## Verification

`node --test tests/rebuy.test.mjs` exercises production economy, inventory,
equipment and weapon adapters with installed SDK ECS components. The networking
case passes rebuy through the installed SDK Room and binary message schema.
The touch test renders the production menu and invokes press/release callbacks.
Eight cases fail without the implementation and pass with it.

The rebuy step passed 402 tests, assets, build and typecheck. A short headless
check confirmed FIRE/reload, no charge on row selection, a $60 ammo refill,
no repeat charge, and portrait layout. Browser evidence is recorded in
[validate/game/rebuy/README.md](../validate/game/rebuy/README.md).
Native phone interaction remains unverified.

`node --test tests/autobuy.test.mjs` covers both teams, rifle price thresholds,
pistol-round budgets, armor fallback, existing/replaced primaries, shared ammo,
rebuy snapshots, buy restrictions, authenticated messages and mobile selection.
[Auto-buy evidence](../validate/game/autobuy/README.md) records the current gate
and browser check.

The auto-buy step passed the full gate with 410 tests, assets, build and typecheck.
The earlier headless menu check (before the classic mobile layout) verified the CT $4655 purchase, no cost on selection or
repeat, and the actual quick-buy rows/cart at 844×390 and 320×568.
