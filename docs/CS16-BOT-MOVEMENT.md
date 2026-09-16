# Bot movement and bullet flinch

Bots now pass their navigation intent through the same CS movement-rule class as
desktop players. Running accelerates to the equipped gun's speed, walking uses
52%, and stopping applies friction. Confirmed bullet and knife hits apply the
same small/large flinch selection and actual-velocity modifier. Eligible large
hits also push the bot away from the attacker. Death clears velocity; a new round
creates a fresh controller. Bot shot accuracy uses measured horizontal movement.

The authoritative server owns the controller, damage and synchronized Transform.
The visible AvatarShape follows that Transform, including hit displacement. No
client can supply a bot's velocity, damage result or flinch target. Grenades and
C4 use their existing blast path without this bullet response.

## Reference and adaptation

[ReGameDLL's bot command code](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/game_shared/bot/bot.cpp)
executes player movement commands, and
[bot.h](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/game_shared/bot/bot.h)
sets a 1/30-second command interval. These files were inspected in the pinned
local source checkout. The scene now uses that minimum bot-movement interval;
server scheduling can extend it. The shared formulas and flinch gun list are
documented in [desktop movement](CS16-MOVEMENT.md).

`bot-navigation.ts` still chooses goals, remembered targets, holds and sidesteps.
`bot-motion.ts` turns that intent into velocity and resolves its displacement.
A waypoint cannot be consumed merely because the planned full-speed step would
reach it: a hit may have slowed the actual bot. Route corner-cutting also checks
physical clearance. After an impulse or a blocked step, the bot can re-anchor and
replan from its actual position.

The navigation graph is a route guide, not the collision boundary. Displacement
uses the original Dust2 point hull with standing-body clearance samples, horizontal
sliding, ground support and an 18-HU step limit. This preserves movement around
walls and through ramps while allowing a hit to move a bot away from a waypoint.
The inherited bot footprint is 0.3 m radius / 1.8 m height. It remains an
approximation, not GoldSrc's original player hull. Bots remain grounded: jump,
crouch, airborne flinch, ladders, water and falling off ledges are still open.
Original bot tactics and character animations are separate remaining work.

## Validation

`npm run validate` covers the shared movement rules and bot-specific acceleration,
stopping, small/large flinch, wall/ceiling clipping, sliding and step height. Three
Dust2 detour/spawn-to-bomb routes receive hits and must still arrive at 20, 30 and
60 updates per second. These are real production geometry queries.

The browser fixture uses visible bots, real keyboard/mouse input and the production
USP/M4A1 damage path. Its controlled bot modes and health resets are fixture-only.
An independent normal-AI run verifies movement, gunfire that kills the player,
the new kill's score, round completion and fresh health/movement on respawn.
See [headless evidence and reproduction](../validate/game/bot-movement/README.md).
