# Bot round economy

Bots start a match with $800 and the team's default pistol. They use the same
weapon prices, ammunition packs, armor, $300 kill reward, round payments and
$16,000 cap as humans. A surviving Terrorist receives no timeout loss payment.
Money persists across rounds. Surviving bots retain their weapons, remaining
ammunition, armor and defusal kit; dead bots lose equipment.

At the next freeze, bots buy in their spawn buy zone. CTs prefer M4A1, then FAMAS,
then MP5; Terrorists prefer AK-47, then Galil, then MP5. They retain a primary
worth at least as much as the next affordable option. They reserve enough money
for one primary ammo pack, buy affordable armor and a CT kit, then fill reserves
with paid packs. Their held model, firing sound, damage and reload duration use
the actual equipped weapon. Replaced rifles drop their remaining magazine;
partial surviving magazines reload during freeze rather than refill for free.

If a primary's magazine and reserve are both empty, a bot switches to a carried
pistol with ammunition. It waits for the last shot's cooldown and the pistol's
draw time, then uses that pistol's firing and reload rules. An empty magazine
with spare primary ammunition still reloads. Shared reserves remain shared:
an exhausted MP5 leaves only the Glock's loaded rounds. Switching does not grant
ammunition or interrupt planting/defusing. On death, bots use the same weighted
weapon-drop selection as humans, even if their pistol was active.

Bot armor uses the attacking gun's penetration ratio and hit region, including
helmet coverage and armor depletion. Grenades and C4 use the shared blast armor
rule. Confirmed impacts and original hit voices distinguish flesh from armor.

This is a simple buying policy, not original CS bot tactics. Bots do not yet buy
or throw grenades, select every firearm or pick up dropped guns. When all guns
are empty, knife attacks remain unimplemented. Their armor and money remain
server-owned internal state; human HUD money still describes only the local player.

Run `npm run validate` for rules, asset integrity, bundling and type checking.
`tests/bot-economy.test.mjs` covers pistol-round budgets, paid ammo, round income,
survival/death, upgrades, kit restrictions and armor.
`tests/bot-loadout.test.mjs` covers fallback, deployment/reload timing, shared
ammunition and death drops. In-client balance and presentation need the creator's
[MVP playtest](MVP-PLAYTEST.md). No browser was
launched for this change. Historical arsenal-derived browser fixtures explicitly
keep fixed unarmored rifle bots and bypass their shop; they do not validate this
economy. See offline evidence for [buying](../validate/game/bot-economy/README.md)
and [switching](../validate/game/bot-switch/README.md).
