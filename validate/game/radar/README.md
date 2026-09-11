# Radar browser evidence

Three muted stock Bevy browser clients ran two CTs against one T. `results.json`
records rendered UI assertions for teammate count, camera rotation, C4
visibility/flashing, and death removal. `teammate.png` was visually reviewed.

The initial run also confirmed the radar is hidden in the lobby. Two C4 flash
checks failed because the test dropper automatically picked the bomb up: moving
before server acknowledgment can move the drop itself. The final run waited
for the red marker before moving and passed all checks in the same live server.

To repeat, launch the scene on port 8005 and serve stock Bevy on 8123. Open
three named, muted agent-browser sessions; the first must be `cs16-radar-a`
for the screenshot command. Obtain their CDP URLs and run:

```sh
node validate/radar.mjs "$CT_A_CDP" "$CT_B_CDP" "$T_CDP"
```

Start with an empty match. `--live` resumes a live match with the same team
assignment, both CTs alive and the T carrying C4. Close all owned browsers and
the isolated server after testing.

Planted-cross rendering, height glyph rendering, radio flashes and location
labels were not exercised in this browser run. Height and planted-C4 marker
rules are covered by `tests/radar.test.mjs`.
