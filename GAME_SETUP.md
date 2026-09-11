# Game setup

Follow [README.md](README.md) for the playable scene, controls, and test commands.

**Start game** runs the solo three-enemy Dust2 encounter. Choose **Terrorists**
or **Counter-Terrorists** to play shared human elimination rounds on the same
realm. Both teams must be present to start; late joins wait for the next round.
Deaths stay out until the shared restart. Original team spawns, scored wins,
and persistent kills/deaths are implemented.

Shared rounds include C4 planting/defusing and explosion outcomes. Select C4
with 4, hold left mouse to plant, hold E near the bomb to defuse, and use 3 to
drop or 2 to return to the rifle.

In shared rounds, press Esc at your spawn during the buy window to purchase
armor, helmets, kits, or AK reserve ammo. Close the menu to resume aiming.
Survivors retain equipment and ammunition; money carries between rounds.

Team respawns now give CT a USP and T a Glock. Buy M4A1/AK rifles in the menu;
2 selects primary and Shift+2 selects pistol. Pistols fire once per press.

Remaining weapons, alternate modes, remaining spectator modes, final models, and exact UI parity remain
unfinished. The initial five-seat team limit is not a verified 5v5 performance claim.

While dead in team rounds, mouse movement orbits a living teammate. Click cycles
forward and Shift+click cycles backward. You return to your own camera on the
next round spawn. Other observer modes and original observer UI are still pending.

Hold **1** for the classic scoreboard. Round-win messages appear separately; the
board automatically opens only at match completion. Player rows sort by kills,
then fewer deaths. Human latency currently displays `-`; bots display `BOT`.
