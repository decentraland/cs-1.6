# Game setup

Follow [README.md](README.md) for the playable scene, controls, and test commands.

Choose **Terrorists** or **Counter-Terrorists** on the team menu (click, or press
**1**/**2** while the menu is open). The round starts immediately: any side with
no connected human is filled with three bots (Guerilla, Phoenix, Arctic). A
human joining a bot-filled side replaces those bots at the next round; the match
resets when every human leaves. Late joins wait for the next round, and deaths
stay out until the shared restart. Original team spawns, scored wins, and
persistent kills/deaths are implemented; bot kills show in the kill feed.

Rounds include C4 planting/defusing and explosion outcomes. Terrorist bots
carry and plant; Counter-Terrorist bots pursue and defuse. Select C4 with 4,
hold left mouse in a site to plant, hold E near the bomb to defuse, use Shift+4
to drop it, and 1 to return to the rifle.

Press Esc at your spawn during the buy window to purchase armor, helmets, kits,
rifles, or ammo. Close the menu to resume aiming. Survivors retain equipment and
ammunition; money carries between rounds.

Respawns give CT a USP and T a Glock. Buy M4A1/AK rifles in the menu.

## Controls

- WASD moves, Space jumps, Shift (hold) walks.
- Left mouse fires, swings the knife, or plants the C4.
- 1 primary, 2 pistol, 3 knife, 4 C4 (carrier only), Shift+4 drop C4.
- E (hold) uses: defuse the planted bomb. F reloads a gun or stabs with the knife.
- Shift+1 (hold) shows the scoreboard; Esc releases the cursor and opens the buy menu inside your buy zone.
- Buy menu: CS 1.6 categories (1 Pistols, 4 Rifles, 6/7 ammo, 8 Equipment, 0 Cancel); keys 1-4 pick rows, the rest are click-only. Hover a row to see its price and stats.
- Team menu: 1 Terrorists, 2 Counter-Terrorists; AUTO ASSIGN and SPECTATE are click-only because the explorer has no 5/6 input actions.

The live view is a scene-driven first-person camera at eye height. Recoil and
victim punch kick the view like CS 1.6 and can be counter-aimed with the mouse;
your own avatar is hidden locally so it never appears in front of the lens.

Remaining weapons, alternate modes, remaining spectator modes, final models, and exact UI parity remain
unfinished. The initial five-seat team limit is not a verified 5v5 performance claim.

While dead, mouse movement orbits a living human teammate, or a living bot when
none is available. Click cycles forward and Shift+click cycles backward. You
return to your own camera on the next round spawn. Other observer modes and
original observer UI are still pending.

Hold **Shift+1** for the classic scoreboard. Round-win messages appear separately; the
board automatically opens only at match completion. Player rows sort by kills,
then fewer deaths, with bots listed inside their team. Human latency currently
displays `-`; bots display `BOT`.
