# Nightvision brightness check

Captured 2026-09-22 with one muted isolated Brave headless browser and hosted
Bevy. The fixture forces mobile layout, starts at $16000, pauses bots and extends
round/buy timers, with its own multiplayer identity. This is a desktop renderer
check, not native Godot touchscreen evidence.

Real pointer clicks bought goggles for $1250, rejected a repeat purchase, enabled
one local point light, increased overlay alpha from 110 to 130, reduced it to
110, then disabled goggles and removed the light. Screenshots include landscape
844×390 and portrait 390×844. The plus/minus controls are separate from FIRE,
weapon slots and alternate fire. See `runtime.log` for the successful assertions.

Run `node validate/prepare-touch-controls.mjs /tmp/cs16-nightvision-review`, then
install dependencies and start `npm run start:server -- --port 8034` in that
fixture. Connect an isolated muted headless Bevy preview with loopback access.
From the source repository run:

```sh
node validate/nightvision.mjs <browser-CDP-websocket> /tmp/cs16-nightvision-evidence
```

The browser begins at team selection. Close it and its server afterward.
Production-handler tests cover the 30/220 limits, 20-unit steps, persistence,
inactive/menu/death guards and isolation from server and combat messages.
Native mobile lighting and exact cross-renderer visual fidelity remain open.
