# Movement audio browser evidence

Captured September 15, 2026 with muted headless Brave (Chromium 151), the official
Bevy web preview and SDK/runtime `7.27.1-33533530571.commit-451d001`.
No Unity client was launched. The review used its own room and port 8011.

- `browser.json`: actual keyboard Shift+W, Shift+W+D, running, stopping,
  stationary/running jumps and a staged high fall. Walking emitted no CS steps;
  running steps appeared approximately every 0.30–0.32 seconds. It records the
  actual Bevy velocity component alongside sampled positions. AudioSource data
  proves scheduling, not that a sound was heard.
- `bots.json`: normal bot AI moved through Dust2 and emitted world-positioned
  footstep sounds. The browser's AudioBufferSourceNode start calls matched the
  source WAV sample count, rate, channels and first 64 PCM samples (allowing the
  decoder's small, constant normalization difference). This proves decoded
  original audio reached WebAudio playback scheduling while the browser was muted.
- `movement.png`: the knife view during the keyboard test. The official preview's
  debug overlay and native minimap are visible; this is not a clean HUD reference.
- `audio-settings.png`: the current web UI has Avatar Volume 0 and Scene Volume
  100. This was changed only in the isolated test browser; production does not
  change a user's settings.
- `source.json`: source hashes and fixture differences. `validation.txt`: the
  installed scene's complete gate, 193 tests plus assets, build and typecheck.

Both final browser checks reported no page exceptions. These captures do not
prove audible loudness/panning, human-to-human timing under network jitter,
GoldSrc movement physics, bot hearing or fall damage.

## Reproduce

Create a fresh isolated scene fixture:

```sh
node validate/prepare-movement.mjs /tmp/cs16-movement-review
cd /tmp/cs16-movement-review
npm install
npm start -- --web --port 8011
```

Open a muted headless Chromium browser with WebGPU enabled at:

`https://decentraland.org/bevy-web/?preview=true&realm=http%3A%2F%2F127.0.0.1%3A8011&position=5%2C8&guest=1`

Grant that test origin access to loopback addresses if Chromium requests it.
Keep the browser permission/CDP connection alive during loading. From the source
repository, run the following with the browser websocket and agent-browser session:

```sh
node validate/movement-audio.mjs "$CDP_WEBSOCKET" /tmp/cs16-movement-evidence cs16-movement-review
```

For bots, close the browser/server, create another fresh fixture with the `bots`
argument, start it on 8011, and open a fresh headless preview:

```sh
node validate/prepare-movement.mjs /tmp/cs16-movement-bots-review bots
# Start this fixture's server, then:
node validate/movement-bots.mjs "$CDP_WEBSOCKET" /tmp/cs16-movement-evidence
```

The fixtures inherit the arsenal review's $16000, AWP inventory, extended rounds
and buy time. The human fixture parks bots; the bot fixture runs normal bot AI.
Both add tiny diagnostic TextShapes for movement events, positions and match
state. Movement/audio production rules are otherwise unchanged. Teleports stage
positions; the walking and jumping checks use actual keyboard input.

Close owned browser sessions and test servers afterwards. Preserve any existing
user preview on port 8000.
