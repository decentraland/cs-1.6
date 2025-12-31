# Counter-Strike Style Game Setup

This Decentraland scene implements a Counter-Strike style game with your Dust2 map.

## Features Implemented

### Core Game Mechanics
- **Team-based gameplay** - Terrorists vs Counter-Terrorists
- **Round system** - First to win 16 rounds wins the match
- **Freeze time** - 15 seconds at start of each round
- **Round timer** - 1:55 per round
- **Economy system** - Buy weapons with money earned from kills and round wins
- **Health & Armor** - 100 HP and armor that reduces damage
- **Respawn system** - Players respawn at the start of each round

### Weapons
Multiple weapons with different stats:
- **AK-47** (T side) - 36 damage, 30/90 ammo
- **M4A4** (CT side) - 33 damage, 30/90 ammo
- **AWP** - 115 damage, 10/30 ammo ($4750)
- **Desert Eagle** - 53 damage, 7/35 ammo ($700)
- **Glock-18** - 28 damage, 20/120 ammo ($200)

### Bomb System
- Terrorists can plant the bomb at A or B sites
- 3 seconds to plant
- 40 seconds until detonation
- CTs can defuse in 10 seconds

### Win Conditions
- Eliminate all enemies
- Plant and detonate bomb (T win)
- Defuse bomb (CT win)
- Time expires without bomb plant (CT win)

### UI Elements
- Health and armor display (bottom left)
- Ammo counter (bottom right)
- Score and round timer (top center)
- Money display (bottom center)
- K/D/A stats (top right)
- Team indicator (top left)
- Round end messages (center screen)

## Customization Guide

### 1. Adjust Map GLB Path

In `src/index.ts`, line 25-28:
```typescript
GltfContainer.create(mapEntity, {
  src: 'models/dust2.glb' // Change to your actual GLB path
})
```

### 2. Configure Spawn Points

In `src/index.ts`, function `createSpawnPoints()` (lines 51-91):

**Terrorist Spawns:**
```typescript
const tSpawns = [
  Vector3.create(5, 0, 5),  // Adjust X, Y, Z coordinates
  Vector3.create(6, 0, 5),
  // Add more spawns...
]
```

**Counter-Terrorist Spawns:**
```typescript
const ctSpawns = [
  Vector3.create(11, 0, 11),  // Adjust X, Y, Z coordinates
  Vector3.create(12, 0, 11),
  // Add more spawns...
]
```

**Finding Coordinates:**
1. Open your scene in Decentraland Editor
2. Walk to desired spawn locations
3. Use `/getpos` command to get your current position
4. Copy those coordinates into the spawn arrays

### 3. Position Bomb Sites

In `src/index.ts`, function `createBombSites()` (lines 93-158):

**Bomb Site A:**
```typescript
Transform.create(bombSiteA, {
  position: Vector3.create(10, 0, 6),  // Adjust position
  scale: Vector3.create(5, 0.1, 5)      // Adjust size
})
```

**Bomb Site B:**
```typescript
Transform.create(bombSiteB, {
  position: Vector3.create(6, 0, 10),  // Adjust position
  scale: Vector3.create(5, 0.1, 5)     // Adjust size
})
```

### 4. Adjust Game Settings

In `src/systems.ts`, lines 25-30:
```typescript
const ROUND_TIME = 115       // Round duration in seconds
const FREEZE_TIME = 15       // Freeze time at round start
const BOMB_PLANT_TIME = 3    // Time to plant bomb
const BOMB_DEFUSE_TIME = 10  // Time to defuse bomb
const BOMB_TIMER = 40        // Seconds until bomb detonates
const RESPAWN_TIME = 3       // Seconds to respawn
```

### 5. Modify Weapon Stats

In `src/systems.ts`, lines 44-78:
```typescript
export const WEAPON_PRESETS = {
  AK47: {
    name: 'AK-47',
    damage: 36,           // Damage per hit
    maxAmmoClip: 30,      // Magazine size
    maxAmmoReserve: 90,   // Reserve ammo
    fireRate: 0.1,        // Seconds between shots
    reloadTime: 2.5,      // Reload duration
    cost: 2700           // Buy price
  },
  // ... other weapons
}
```

### 6. Adjust Economy

**Starting Money:**
In `src/index.ts`, line 181:
```typescript
PlayerMoney.create(localPlayerEntity, {
  amount: 800  // Starting money ($800 default)
})
```

**Win/Loss Bonuses:**
In `src/systems.ts`, function `awardMoney()` (lines 178-202):
```typescript
let award = 1400  // Loss bonus
// Win award
award = 3250     // Win bonus
```

**Kill Reward:**
In `src/systems.ts`, function `killPlayer()` (lines 329-331):
```typescript
killerMoney.amount += 300  // Money per kill
```

## Testing the Game

1. **Build the scene:**
   ```bash
   npm run build
   ```

2. **Start local server:**
   ```bash
   npm run start
   ```

3. **Test features:**
   - **Shoot anywhere** - Click to shoot at center of crosshair (raycasting)
   - Aim at colored boxes (enemies) to damage them
   - Walk into bomb sites and click to plant bomb
   - Check UI updates for health, ammo, score
   - Yellow hit marker appears when you hit something

## How Shooting Works

The game uses **global raycasting** for realistic shooting:
- Aim with the **white crosshair** in center of screen
- **Hold left mouse button** to fire automatically
- **Click or hold** - both work (like CS)
- **Ammo is consumed on every shot** (hit or miss)
- Raycast fires from camera forward up to 100 units
- Automatically detects entities with health components
- Visual feedback:
  - **Yellow marker** = Hit enemy/target
  - **Gray marker** = Missed (hit environment)
- Damage dealt based on weapon stats
- Fire rate limit controls automatic fire speed
- Auto-reload when magazine is empty

### Shooting Modes:
- **Single tap** - One shot per click
- **Hold button** - Full auto (respects fire rate)
- Fire rate prevents instant spray (realistic timing)

## Dynamic Crosshair (CS-Style)

The crosshair expands and contracts based on player actions, just like Counter-Strike:

### Crosshair Behavior:
- **Standing still** - Crosshair is tight and accurate
- **Moving** - Crosshair expands (less accurate)
- **Shooting** - Crosshair expands with each shot
- **Recovery** - Smoothly returns to base size when standing still

### Technical Details:
- Base gap: 5 pixels from center
- Max expansion: 20 pixels from center (when moving/shooting)
- Decay rate: 2.0 units per second
- Movement threshold: 0.01 units
- Shooting expansion: 0.3 spread per shot

This encourages **tactical gameplay**:
- Stop moving before shooting for accuracy
- Tap fire instead of spraying for better precision
- Wait for crosshair to reset between bursts

## Multiplayer Integration

This implementation has the core game logic ready. To make it multiplayer:

1. **Use Decentraland's Multiplayer SDK** to sync:
   - Player positions
   - Health and damage
   - Weapon fire events
   - Bomb plant/defuse status
   - Round state

2. **Add server authority** for:
   - Hit detection validation
   - Anti-cheat measures
   - Round management
   - Score tracking

3. **Implement player detection:**
   - Replace dummy targets with actual player entities
   - Use raycasting for shooting mechanics
   - Implement proper crosshair and aiming

## Known Limitations

1. **No real player shooting** - Currently uses click-to-shoot on dummy entities
2. **No raycasting** - Shooting mechanics simplified for demo
3. **No animations** - Weapon animations not included
4. **No sounds** - Audio system not implemented
5. **Single player** - Needs multiplayer SDK integration
6. **Simplified physics** - Movement and collision basic

## Next Steps

To make this production-ready:
1. Integrate proper player input handling
2. Add raycasting for realistic shooting
3. Implement multiplayer synchronization
4. Add sound effects and music
5. Create weapon models and animations
6. Add buy menu UI
7. Implement proper collision detection
8. Add spectator mode for dead players
9. Create lobby and matchmaking system
10. Add admin controls and server configuration

## File Structure

```
src/
├── components.ts  - Game component definitions (health, weapons, teams, etc.)
├── systems.ts     - Game logic (shooting, rounds, bomb, economy)
├── index.ts       - Main scene setup (map, spawns, bomb sites, player init)
└── ui.tsx         - UI components (HUD, scoreboard, etc.)
```

## Questions?

Refer to the SDK7 documentation at: https://docs.decentraland.org/creator/development-guide/sdk7/
