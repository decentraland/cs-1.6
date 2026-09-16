# MVP playtest

Use the existing Bevy preview on realm `http://127.0.0.1:8000` and refresh after
the scene rebuild. Automation uses `npm run start:server`; it must not launch
tabs in the creator's normal browser. No browser test is left running.

The creator is checking feel and presentation. Offline tests, asset integrity,
bundle and typecheck remain required; they do not certify that these effects
look or sound right in Bevy.

## Short creator check

1. Join a team, press Escape to free the cursor and click BUY. Hover an unaffordable or owned gun:
   its details should remain readable. Buy an affordable item: check its price,
   confirmation and money change. Buying a pistol while carrying a rifle tells
   you to press 2; original weapon-selection priorities still apply.
   If a round ends early while you survive in your buy zone, BUY should still
   open buying until the original 90-second buy window expires. A timeout or
   completed match must not reopen buying; the next round restores it.
2. Fight a bot. Incoming hits should show a larger directional pain sprite with
   a brief red pulse, plus the existing original hit sound and camera response.
   Confirmed hits on enemies should show red impact particles; armor hits on
   equipped players or bots show sparks. A miss or rejected shot must not show those
   damage effects. Multiple kills should remain together in the feed, oldest first,
   with the original weapon icons, team-colored names and a headshot marker only
   when the server confirms a headshot kill.
3. Die, wait for the chase view, then press Escape. The team menu should stay
   clickable. RESUME SPECTATING returns to the camera; team choices still obey
   server admission rules. Joining a playing team mid-round waits for the next
   round. At match end, the menu shows the final score and PLAY AGAIN.
   Chase view should show the watched player's name/health and hide your own
   dead-player ammo/money. Resume should keep that target; the next click cycles
   forward and Shift+click goes back. Neutral spectators can cycle bots and humans.
   As a neutral spectator, Space switches chase/free look; WASD flies the camera
   and Escape stops it. SPECTATE should also work before anyone joins a team.
   Choose a team afterward and confirm the camera returns to your player.
4. Start a fresh match: bots should carry their team's pistol on the first round.
   Later rounds use their earned money for guns and equipment. Surviving bots
   keep their gear; killing a rifle-carrying bot should drop its actual gun.

Report the action, expected result and what happened. Prioritize controls that
trap the player, unclear damage/kill feedback and rounds that cannot finish.

## Remaining MVP work

Visual feel, menu transitions and pooled effects need the creator's in-client
pass. Original character death/hit animations are still absent. Bots now share
player prices, round rewards, armor and paid ammo through a simple
[buying policy](CS16-BOT-ECONOMY.md); encounter balance remains work. Wider CS fidelity gaps stay in the
[implementation plan](../IMPLEMENTATION_PLAN.md).
