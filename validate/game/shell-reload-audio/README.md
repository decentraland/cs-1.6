# XM1014 shell audio evidence — 2026-09-22

See [source rules, implementation and audible reproduction](../../../docs/CS16-RELOAD-AUDIO.md#xm1014-shell-loading-sounds--2026-09-22).

- [Before](before-tests.log): seven new cases against a preserved copy of the
  prior scene source; five fail, two guard cases pass.
- [Focused after](focused-tests.log): all 22 cases pass, covering insertion timing,
  cancellation, bots, unchanged magazine/M3 behavior, SDK Room delivery and
  actual SDK AudioSource clip/pitch/replacement/position state.
- [Full gate](full-gate.log): `npm run validate` in the scene repository exits 0;
  539 tests, asset integrity, bundling and typecheck pass.
- [Source hashes](source-audit.json): pinned references and exact installed files.
  The two new original clips are included in `stock-media.json` and the asset gate.

Run from the scene repository:

```sh
node --experimental-strip-types --test tests/shell-reload-audio.test.mjs tests/reload-audio.test.mjs tests/weapon-reload-parity.test.mjs
npm run validate
```

Refresh server and clients for the added Room message. These checks do not
establish audible original-client parity, native mobile touch behavior or engine
attenuation equivalence. No browser/native client or new preview server was
launched. Existing creator preview and debug-hub processes were left running.
