# Bot bodies, hits and deaths

Practice bots use original Arctic (T) and Urban (CT) models. Their original leg animation runs independently of aiming, firing and reloading. Reload poses are scaled to the actual weapon reload deadline. A lethal hit removes the damage target, hides its held weapon, drops equipment through the existing server rules, and plays a full-body death without rotating the entire entity onto its side. The corpse remains until the next round.

The server evaluates the original model hitboxes from the same leg/torso pose selection. Head, chest, stomach, arms and legs retain the existing CS damage/armor rules. Dead bodies have no active hitboxes. Human players still use Decentraland avatars and the existing approximate avatar regions.

The models retain neutral aim blends. There is no claim of exact visual synchronization under network delay: the server starts animation state when it handles the event, and the renderer starts it after receiving the component. SDK Animator does not expose an absolute clip seek time. Directional throws, full aim blending, human model replacement and crouch/airborne animation selection remain open.

Run `npm run validate` for source/model integrity, animation selection and oriented-hitbox checks plus the full existing gameplay suite/build. A focused browser fixture is reproducible with:

```
node validate/prepare-player-models.mjs /tmp/cs16-player-models-review
cd /tmp/cs16-player-models-review
npm install
npm run start:server -- --port 8011
```

Open the Bevy preview manually, join CT, and inspect the stationary T bots while moving around them. The fixture applies one scripted lethal head hit ten seconds after live play begins: the body should collapse once, its gun should drop, and its death count should change. This demonstrates the damage/death presentation; it does not verify mouse input or bullet accuracy. Use the supplied AWP against the other two bots for that manual check. Switch teams and repeat for the CT body. For normal movement, use the main scene rather than this stationary fixture. No browser is opened by the server command.

Source and conversion details: [player assets](../asset-sources/players/SOURCE.md). Evidence and its scope: [validation](../validate/game/player-models/README.md).


Bot animation layers and their start times are synchronized in `BotBodyPose`.
Both client impact prediction and server damage traces evaluate the source
hitboxes from those layers; the client no longer uses the AvatarShape proxy.
See [real mouse-fire regression](../validate/game/combat-recovery/README.md).
