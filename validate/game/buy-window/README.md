# Buy-window regression

The menu previously derived buy time from the round/result countdown, and both
client and server rejected every result phase. A survivor in their buy zone
could not buy after an early win, loss or draw.

`Practice.buyTimeLeft` now carries the server's buy window independently. It
resets for freeze, counts from live round start and continues through results.
Zero includes the exact deadline; -1 means expired. Server purchases still check
the precise elapsed time, life, admission, zone, funds and ownership. A completed
match rejects purchases even if its original buy deadline has not passed.
The buy menu also renders after combat overlays, beneath the team menu, so
result messages cannot cover its controls. This stacking change needs the
creator's visual/click playtest below.

The pinned [ReGameDLL `CanPlayerBuy` implementation](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/player.cpp)
checks elapsed buy time and does not prohibit purchases merely because a round
has ended. This change covers buying; post-result combat remains disabled.

Run `node --experimental-strip-types --test tests/economy.test.mjs` or the full
`npm run validate` gate. Before the implementation, the new checks reproduced
survivor rejection and missing match-end protection. The tests cover all three
result phases, exact expiry, matching replicated/server eligibility, unchanged
accounts on rejection and the next freeze reset. `source.json` identifies the
validated source and `validation.txt` records the installed full gate.

No browser was launched for this change. To check manually in the existing
preview, survive an early round result in your buy zone, press Escape and buy
an affordable item before the original 90 seconds expire. Confirm its price is
deducted once and it survives the next spawn. After a timeout or at match end,
buying must stay closed; a new playable round opens it again.
