# Dust2 bullet penetration and input review

Recorded 2026-09-15 in a muted, headless Brave browser on the official Bevy web
client. The production bullet resolver uses the original map point hull and the
source caliber/material rules documented in [the arsenal](../../../docs/CS16-ARSENAL.md).

- [Authoritative damage and ammunition](browser.json): USP 12→11, bot health stays
  100 behind the middle door; AWP body hits reduce health 100→44→0, magazine 10→8.
- Closing the buy menu consumes no ammunition. The first intentional shot works.
- [Scope and capture regression](capture.json): switching from a scoped AWP to the
  USP releases its render target; recapturing with 10/70/250 ms clicks causes no
  shots, and the next intentional click consumes exactly one bullet each time.
- Captures: [before shooting](door-before.png), [first AWP hit](door-awp-hit.png),
  [second AWP hit and kill feed](door-awp-kill.png).

The separate fixture has a unique multiplayer identity, $16000, a starting AWP,
paused bots, a one-hour round and unlimited buy time with refunded money. It also
places bot 0 behind the middle door and exposes its synchronized health through
TextShape for inspection. Those overrides are confined to the temporary fixture;
the normal scene retains moving bots, $800, original spawn loadouts and buy rules.
The door texture is absent from the original materials table, so its bullet
material falls back to concrete, as in the source lookup.

## Reproduce

From the scene repository:

```sh
node validate/prepare-penetration.mjs /tmp/cs16-door-review
cd /tmp/cs16-door-review
npm install
npm start -- --web --port 8011
```

Follow the [arsenal browser setup](../arsenal/README.md), using the session name
`cs16-penetration-review` and the preview URL with port 8011. Explicitly choose
Brave, enable WebGPU, mute audio and grant approved loopback access before loading
the page. Wait for startup; do not join a team manually. From the original repo:

```sh
node validate/penetration.mjs <browser-CDP-websocket> /tmp/cs16-door-evidence cs16-penetration-review
node validate/capture-review.mjs <browser-CDP-websocket> /tmp/cs16-door-evidence
```

The first script joins CT and asserts the door hits; the second continues in that
browser to check scope cleanup and mouse capture. Restart a fresh fixture/browser
before repeating the full sequence. Stop both test processes afterward.

The official Bevy build was observed to panic on live scene reload while a scoped
texture camera was active (directional-light visible-entity lookup). Normal scoped
weapon switching passed. Close the preview before rebuilding, then reopen it;
these checks include no engine modifications.
