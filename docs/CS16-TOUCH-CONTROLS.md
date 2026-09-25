# Mobile controls

Mobile uses the native joystick, touch-look area and gamepad. The large native
bottom-right button is FIRE, replacing JUMP. Jump moves to a smaller adjacent
button. This uses the SDK's `TouchScreenControls.mainAction`, not another scene
button layered over the native control.

## In a round

- **Large reticle:** hold FIRE; release stops shooting. The same position shows
  SLASH, THROW or PLANT when using knife, grenade or C4. Grenades throw on release;
  planting still requires a bomb site.
- **Small native actions:** JUMP, RELOAD/STAB, WALK/RUN, and the current gun's
  alternate action (scope, burst or silencer). At most five native buttons are
  visible, so the gamepad does not need an overflow button.
- **Walk/run:** one tap switches mode and changes the walking/running glyph.
  Release keeps that mode; tap again to switch back. Opening menus preserves it.
- **Bottom bar:** carried primary, pistol, knife, grenades and C4. Unavailable
  slots disappear. Portrait places the bar above the joystick/gamepad area.
- **Cart:** visible only while alive, connected and allowed to buy in the spawn
  buy zone and buy period. It disappears outside the zone.
- **OPTIONS:** scores, team selection, drop and owned night vision; brightness
  controls appear only while night vision is on. The native gamepad hides while
  these options are open.
- **DEFUSE (scissors):** visible only to nearby CTs while the bomb is planted.
  It turns green when in range and facing the C4. Leaving reach cancels the hold;
  the server continues to validate range and aim.
- **Spectating:** NEXT/PREVIOUS replace the weapon controls after death transition.

There is one FIRE button. Left movement, right look, manual fire, reload and a
weapon bar follow the conventions documented in
[Activision's mobile controls guide](https://blog.activision.com/call-of-duty/2019-10/Getting-a-Grip-on-the-Call-of-Duty-Mobile-Controls).
The reduced layout and persistent walk toggle are our CS adaptation.

## Input and assets

`src/touch-actions.ts` builds the component on `engine.RootEntity`:

| Native action | Scene behavior |
| --- | --- |
| `IA_ACTION_6` (`mainAction`) | Fire/slash/throw/plant |
| `IA_JUMP` | Native jump |
| `IA_SECONDARY` | Reload/stab |
| `IA_ACTION_3` | Toggle walk/run on press |
| `IA_ACTION_4` | Request the gun's alternate mode on press |

Every unused gamepad action is explicitly hidden. The joystick remains native;
the native crosshair is hidden in favor of the scene crosshair. Native button
positions and sizes belong to the explorer. `client.ts` writes the configuration
only when its contents change. Desktop input is unchanged. Mobile ignores the
desktop team/buy/weapon number shortcuts so the native actions cannot select a
team or buy an item accidentally.

Never bind mobile FIRE to `IA_POINTER`: ordinary UI taps emit it too.
`combat-input.ts` collects root events before gameplay and retains brief
press/release pairs for one update. Menu, death, round, lost-sync and equipment-kind
changes cancel held actions until release and a fresh press. Gun-to-gun switches
retain FIRE. The shared UI hold adapter remains for defuse and spectator controls.

Native icon textures cannot use atlas UVs, so `assets/ui/touch/` contains 13
standalone transparent PNGs from the existing editable `icons.svg`. Reproduce
with `node asset-sources/touch-controls/render-native.cjs`, with `@resvg/resvg-js`
available (or `NODE_PATH` pointing to an installation). Custom scene controls
continue to use the atlas. `validate/touch-icon-assets.mjs` checks both forms.

## Menus

The mobile buy menu reuses the desktop rows and `MenuButton` styling: numbered
categories, Auto Buy/Rebuy in the right column, numbered item submenus, money and
item details. There are no category cards, reordered quick-buy rows, scroll area,
or extra purchase cart. A completed tap purchases; leaving a row before release
cancels. Disabled items remain unavailable and display their reason in the info
panel. Release uses the current row availability. Closing clears any held row.
Lists and notices have fixed positions inside safe bounds. Team selection keeps
its responsive cards. Movement stops while either menu is open.

## Verification

Run `npm run validate` for tests, asset integrity and the scene build/typecheck.
Focused regressions:

```sh
node --experimental-strip-types --test tests/native-touch-hud.test.mjs tests/touch-controls.test.mjs tests/touch-equipment.test.mjs tests/mobile-controls.test.mjs tests/short-press.test.mjs
```

The native-HUD regression checks the actual root configuration and feeds real
SDK root events into the production client: firing/release, persistent walking,
contextual icons and menu/death/disconnect cancellation. Equipment regressions
exercise real native edges across gun, knife, grenade and C4 switches. Other
input regressions retain coverage of the shared UI hold adapter and all 24 guns.
UI tests check carried slots, conditional buying, hidden utilities and safe bounds.

Use `npm run test:smoke` for one bounded headless readiness check on the hosted
Bevy build. Bevy does not render the native iOS gamepad: do not use it to claim
that native button placement or multitouch passed. Older captures under
`validate/game/mobile-controls/` show the superseded custom-button layout.

On iOS after refresh:

1. Confirm the large bottom-right reticle shoots and the small jump icon jumps.
2. Hold FIRE while moving and dragging to aim; release to stop. Open OPTIONS
   while holding FIRE, close it, then check that shooting requires a fresh press.
3. Tap walk once, release, move, then tap again: slow/normal movement should persist.
4. Select pistol/knife/grenade, reload/stab and hold/release a throw. Check alternate
   modes on a compatible gun.
5. Leave the spawn buy zone: the cart should disappear. Re-enter during buy time:
   it returns. Open a numbered category and tap an item once to buy. Check Auto Buy/Rebuy beside the category list.
6. Check OPTIONS scores/team/drop and NEXT/PREVIOUS after death.

Native layout and simultaneous touches require this device playtest. Mobile
scope magnification and spectator camera transitions retain their existing limits;
see [explorer API differences](EXPLORER-INCONSISTENCIES.md).

## SDK references

- [On-screen UI](https://docs.decentraland.org/creator/scenes-sdk7/2d-ui/onscreen-ui)
- [Native touch controls](https://docs.decentraland.org/creator/scenes-sdk7/interactivity/touch-screen-controls)
- [UI input binding](https://docs.decentraland.org/creator/scenes-sdk7/2d-ui/ui_input_binding)
