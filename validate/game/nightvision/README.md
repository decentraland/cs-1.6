# Nightvision browser check

Captured 2026-09-21 in one muted isolated headless Bevy browser against a separate
scene fixture. The mobile scene layout was forced at 844×390; the renderer was
desktop Bevy, not a native mobile client. The fixture gives $16000, pauses bots,
and extends the buy/round time. Production nightvision and purchase code is unchanged.

Observed:

- Purchase changed $16000 to $14750; a second tap did not spend money.
- [Off](off.png): goggles owned, no local LightSource.
- [On](on.png): green view, one green point light at the player, range 19.125 m.
- [Off again](off-again.png): original view restored and light removed.

The matching JSON files retain only HUD, labels and local light/transform data.
The owned browser and preview server were closed after capture.

## Reproduce

1. From the scene repo, run `node validate/prepare-touch-controls.mjs /tmp/cs16-nightvision-review`
   with a new destination, then `npm ci` in that directory.
2. In the fixture, run `npm run start:server -- --port 8034`.
3. Open one isolated headless browser with a fresh guest profile and CDP enabled
   at `https://decentraland.org/bevy-web/?preview=true&realm=http%3A%2F%2F127.0.0.1%3A8034&position=5%2C8&guest=1`.
   Permit loopback for this test browser and leave the scene on its initial team menu.
4. From the source repo, run `node validate/nightvision.mjs <browser-CDP-websocket> /tmp/cs16-nightvision-capture`.
   It joins CT, buys goggles, checks the duplicate purchase, toggles on/off, and
   saves screenshots and assertions. It does not start or close a browser/server.
5. Close the owned browser and stop the fixture server.

The recorded capture used the same check before its endpoint and output directory
were parameterized. The reusable version expects an already-open fresh preview;
it does not clear browser storage or navigate.

Full `npm run validate`: 357 tests passed, asset integrity and SDK build/typecheck passed.
Server life/round/replay guards and both teams' prices are covered by
`tests/nightvision.test.mjs`; this capture exercises CT purchase and toggles only.
Native phone lighting, multitouch, brightness adjustment and exact cross-engine
visual parity remain open.
