# CS 1.6 team menu browser evidence

The scene renders the team-selection screen from the pinned original resources
documented in [`asset-sources/team-menu`](../../../asset-sources/team-menu/SOURCE.md).
The 640×480 source coordinates stay centered in a 4:3 area on widescreen clients.

- [`team-menu-800x450.png`](team-menu-800x450.png) shows the compact font tier.
- [`team-menu-1280x720.png`](team-menu-1280x720.png) shows the widescreen layout.
- [`visual.json`](visual.json) records the panel geometry and successful practice action.
- [`auto-assign-waiting.png`](auto-assign-waiting.png) shows the first player assigned to Terrorists.
- [`auto-assign.json`](auto-assign.json) records T/CT balancing, freeze time, and the expected Glock-18/USP loadouts.

The visual validator reconstructs bitmap labels from the atlas UVs, so clipped or
missing text fails even though transparent compatibility labels exist for older
gameplay scripts. It also checks the outer panel, briefing panel, button rows,
and logo against the original resource coordinates. The screenshots provide the
rendered comparison; the automated checks are geometric and do not claim a
per-pixel match across GoldSrc and Bevy rasterizers.

Run the visual phase against a fresh isolated realm, reset that realm, and then
run the auto-assignment phase with two muted browser sessions:

```sh
node validate/team-menu.mjs visual <browser-A-CDP-websocket>
node validate/team-menu.mjs auto <browser-A-CDP-websocket> <browser-B-CDP-websocket>
```
