# Visible practice bots

`visible.png` is a muted Bevy browser capture of the three live practice bots.
They are synchronized `AvatarShape` NPCs whose entity transforms are driven by
the authoritative Dust2 navigation system.

`runtime.json` is produced by `validate/bot-avatars.mjs`. The check clicks the
canvas while the Start menu is open, verifies that the scene restores the
cursor, starts the round through the same UI, confirms all three named avatar
components, moves the player out of sight, and samples bot movement.

Run it against a fresh isolated scene server and an owned muted browser:

```sh
node validate/bot-avatars.mjs "$CS_CDP"
```

The avatars and their base wearables are temporary presentation. Faithful
low-poly Counter-Strike character models remain asset work.
