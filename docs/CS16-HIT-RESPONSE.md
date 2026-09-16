# CS 1.6 hit response

The server resolves five groups for every firearm and knife: head ×4, chest (`body`) ×1, stomach ×1.25, arms ×1 and legs ×0.75. Kevlar covers chest/stomach/arms; a helmet also covers the head. Legs bypass armor. Each weapon retains its own armor ratio and range falloff.

Damage is truncated at the source bullet-falloff step, multiplied by the hit group without early rounding, then processed through armor. Only the final health loss is truncated. For example, a 19-damage stomach hit becomes 23.75; AK armor penetration leaves 18 health damage. Rounding 23.75 first incorrectly gave 17. Bots now truncate health damage at the same final stage.

Shotguns accumulate consecutive pellets hitting the same player, retaining fractional damage. A different target flushes that batch; misses retain it. Armor coverage uses the last hit group, reproducing the source `MultiDamage` behavior. Victim punch uses individual trace damage, not the summed shotgun damage. Arms and legs don't start a new camera kick; chest/stomach kick up to four degrees, and unprotected head hits use the existing twelve-degree/roll caps. Protected hits don't start punch.

Standing proxy regions now separate torso and arms and rotate with the target's horizontal facing. Humans and bots share these regions; client impact prediction, authoritative bullet penetration and knife queries all use the same oriented boxes. These are **approximate AvatarShape bounds**, not the original animated character hitboxes. Client/server facing can differ in transit; pose rewind still uses current facing.

## MVP visual feedback

Human and bot damage now share the server-owned `combatImpact` event. A loss of
health or armor produces a short blood or armor-spark effect near the reported
hit region. Kills produce a larger burst. The client pools at most 96 transient
particles; none has a collider or changes damage. These are temporary procedural
effects, not converted GoldSrc blood sprites or exact impact-point decals.

Predicted impacts use a neutral marker and cannot claim confirmed damage.
Rejected shots remove their marker. The original pain sprites scale with the
640×480 menu reference and briefly flash red on an incoming confirmed hit.
The kill feed keeps four recent kills instead of replacing the previous one.
See [the creator playtest](MVP-PLAYTEST.md) for the pending visual checks.

## Original player sounds

The server chooses one clip and sends it to clients. Unprotected head hits use `headshot1/2/3`, protected heads use `bhit_helmet-1`, covered torso/arms use `bhit_kevlar-1`, and other impacts use `bhit_flesh-1/2/3`. A depleted helmet selects the headshot voice, matching the source's post-armor check. Fatal hits select `die1/2/3/death6`. Falls use the same voice channel plus a separate body-splat emitter when appropriate.

Each actor has one reusable voice emitter. Death and subsequent hits replace that voice instead of overlapping different variants. Remote voices follow the actor; local voices follow the camera. Silent emitters expire after four seconds. SDK Room accepts client messages only from the authoritative peer; the handler also restricts clip names to the fixed list. Client callbacks have no sender context because Room performs this check before delivery. Bevy supplies spatial attenuation and decoding; this does not claim identical GoldSrc mixing/attenuation.

The five added clips are byte-for-byte original WAV files with pinned URLs and SHA-256s in [player hit sources](../asset-sources/player-hits/sounds.json). Flesh/death/splat files remain in the [fall source manifest](../asset-sources/player-falling/sounds.json). No sound is synthesized in this path.

## Reference and limits

Rules were checked against [ReGameDLL player.cpp](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/player.cpp) (`TraceAttack`, `TakeDamage`, `Pain`, `DeathSound`), [weapons.cpp](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/weapons.cpp) (`AddMultiDamage`) and [cbase.cpp](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/cbase.cpp) (`FireBullets`). The original behavior outside the optional ReGameDLL fixes/additions is the reference.

Hit slowdown/knockback remains open. The source applies a 0.5 or 0.65 velocity modifier, recovers it per grounded player command, and adds a 170-unit impulse for qualifying rifle/Deagle hits below 300 units/s. Multiplying `AvatarLocomotionSettings` speeds would only approximate that actual-velocity behavior. This pass leaves movement unchanged. Native gravity, acceleration, friction, crouch bounds and original player animation hitboxes remain engine/model gaps. Blood/sparks and combined punch/recoil timing still need visual comparison against the original client.

## Verification

Run `npm run validate` for the rule, source-asset, bundle and type checks. `tests/hit-response.test.mjs` covers oriented groups, fractional armor, shotgun accumulation, knife stomach/backstab damage and sound selection. Existing ballistic/bot tests now give targets explicit facing.

The isolated headless browser fixture and captured evidence are in [validate/game/hits](../validate/game/hits/README.md). It uses deterministic incoming shots through the production trace/damage functions, plus real mouse input against visible bots. It does not certify multiplayer lag compensation or original animated hitbox alignment.
