# Equipment change touch-input regression

2026-09-22, SDK 7.27.1-33533530571.commit-451d001.

```sh
node --experimental-strip-types --test tests/touch-equipment.test.mjs
```

The test uses production touch UI callbacks, the installed SDK input dispatcher,
the scene combat-input collector, and production client context/shooting handlers.
Engine rendering, transport and unrelated client systems are adapted in the
existing fixtures. The fixture exposes the private context function in its test
bundle and runs it before shooting, as `addClientSystems` does.

Before the fix, three transition cases failed (`before-tests.log`): FIRE/RELOAD
holds survived replacement by knife/grenade/C4 controls; removing left FIRE left
its hold active; returning from C4/grenade to a gun/knife inherited an old hold.
The fix adds the control type to the existing input-cancellation context. The
same test verifies gun-to-gun holds continue, releases stop them, and new direct
or native gestures rearm after a control change. No damage or weapon timing rules
were changed. This is a scene regression, not native-device multitouch proof.
