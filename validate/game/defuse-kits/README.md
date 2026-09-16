# Recoverable defusal kits

September 15, 2026: muted headless Brave 151, official hosted Bevy web, SDK
7.27.1-33533530571.commit-451d001. No Unity/native Explorer was started.

## Human handoff

`browser.json` records two CT clients over two complete rounds:

- $200 purchase and original green HUD icon.
- A real fatal fall removes ownership and drops the original kit and firearm.
- The teammate sees the loaded ground model, recovers it for free, and receives
  the original sound, localized notice and icon.
- The recovered kit enables a five-second defuse and remains with the survivor.
- On the next round, an equipped CT cannot consume a second dropped kit.
- The next round clears the unclaimed kit and preserves the survivor's own kit.

See [dropped kit](dropped-kit.png), [recovery](recovered-kit.png),
[kit-assisted defuse](defusing-1.png) and [unclaimed kit](unclaimed-kit.png).

Reproduce in a fresh isolated directory:

1. `node validate/prepare-defuse-kits.mjs /tmp/cs16-kit-review`.
2. Install its dependencies and run `npm start -- --web --port 8011` there.
3. Open two isolated muted headless WebGPU browsers at the official Bevy preview,
   using realm `http://127.0.0.1:8011`, position `5,8`, with loopback permission.
4. `node validate/defuse-kits.mjs <owner-CDP> <recipient-CDP> <output-directory>`.

The fixture waits for both humans, grants $16000/AWP, parks T bots, extends the
round and buy time, and places the T carrier at A. Selecting knife enables the
bot's plant intent so the test can stage pickup before starting the normal fuse.
Purchases, fatal falls, item transfers, defuse timers and round transitions use
production code. Console teleports stage encounters. These historical kit checks used
an initial click to clear the old capture gate. The later
[input regression](../input-capture/README.md) verifies first-use recovery without
that extra click.

## Bots

Use `node validate/prepare-kit-bots.mjs /tmp/cs16-kit-bot-review`, install its
dependencies and start it on port 8011. Run one fresh muted headless preview,
then `node validate/kit-bots.mjs <CDP> <output-directory>`.

[Bot evidence](bots/browser.json) passed the real death/pickup, five-second
defuse, retention and re-drop checks; [capture](bots/bot-defusing.png).

This fixture grants CT bot 0 one kit in round one and places bots 0 and 1 beside
A. Bots remain parked. Real AWP shots kill each carrier; normal nearby pickup
transfers the kit. The human plants C4 using real input, the CT bot defuses with
the recovered kit, and its kit persists next round before another real death.

## Scope

`blender.json` records all 80 original triangles after export/reimport with zero
measured geometry error. `source.json` pins scene dependencies and changed files;
`validation.txt` is the installed scene gate. `browser-errors.txt` retains runtime
errors/native warnings. Unit tests cover team/death/duplicate/other-floor rejection,
source touch bounds, BSP floor placement and the recovered kit's defuse benefit.

These fixtures isolate equipment behavior and do not establish bot tactics,
match balance, exact GoldSrc collision, or audible equivalence. See
[remaining differences](../../../docs/CS16-DEFUSE-KITS.md).
