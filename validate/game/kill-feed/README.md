# Kill-feed validation

`npm run validate` passes 260 tests, asset coverage checks, bundle and typecheck.
The five kill-feed tests cover all firearm icons, naming, skull/explosive causes,
chronological ordering, overflow, independent expiry and event metadata.

One muted headless Brave/hosted Bevy run on 2026-09-15 verified:

- A lethal production human-damage call produces an AK/headshot notice.
- Three additional explicitly staged server messages exercise Galil, Five-Seven
  and world deaths, covering all three original sprite sheets.
- Four rows appear in chronological order, headshot/body/skull variants render,
  and every notice expires.

`headshot.png` records the production death notice. `feed.png` includes the three
display-only examples. `browser.json` records the decoded rendered icons and
names. This run does not prove actual Galil/Five-Seven/world combat; existing
combat tests cover weapon damage. Bot and C4 event metadata passed typecheck but
were not separately exercised in this browser run.

Reproduce with `node validate/prepare-kill-feed.mjs /tmp/cs16-kill-review` in a new
directory. Install its pinned dependencies and use `npm run start:server -- --port
8011` there. Open one isolated muted headless Bevy browser against that realm
with loopback access, then run `node validate/kill-feed.mjs <CDP-websocket>
<evidence-directory>` from this project. Close both test resources afterward.

The fixture inherits arsenal/hit-review staging (AWP/$16000, parked rifle bots,
extended rounds and lethal damage on E). Second E sends the three display-only
examples. `source.json` lists byte-identical production UI/server files. Owned
browser and port 8011 server were closed; creator preview 8000 was preserved.

Original sprite provenance, conversion and reference limits are in
`asset-sources/hud/SOURCE.md`. SDK alpha compositing and bitmap font rendering
remain adaptations.
