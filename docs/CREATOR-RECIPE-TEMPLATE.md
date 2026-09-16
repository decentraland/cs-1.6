# Recipe: <one creator-visible outcome>

## When to use it

Describe the concrete problem, its trigger and the expected result in two or
three sentences. State whether this is a supported API pattern, a tested
combination, a version-specific workaround or an experiment.

## Compatibility

- SDK and runtime: exact versions.
- Explorer: client name, version/commit or build hash; browser/OS where relevant.
- Scene: repository revision and any uncommitted patch/fixture identifier.
- Dependencies: required packages, assets and configuration.
- Evidence: capture date; clients actually tested; known unsupported paths.

## Minimal implementation

Link a runnable minimal scene and explain where the code belongs. Define the
client/server owners, identities, initialization and cleanup. Include only the
code needed for this outcome. Use static imports and exact API names verified
against the pinned dependencies.

For networking: explain readiness, request identity, validation, duplicates,
late messages and recovery. For input: explain menus, capture, held-button reset
and the tested desktop/touch behavior.

## Reproduce and verify

1. Give exact setup and launch commands, including the preview URL and identity
   isolation when multiple servers are needed.
2. State the initial scene state, client count and real user inputs.
3. Describe the observable failure on the old version, if this fixes a bug.
4. Give the assertion and expected result on the new version.
5. Give cleanup steps for the test-owned browsers/processes and fixture copy.

Link the smallest meaningful rule test and a runtime check for anything the
player clicks, sees or hears. Record observed behavior separately from expected
behavior. If a script is no longer compatible, mark the evidence historical.

## Evidence record

```json
{
  "capturedAt": "<UTC timestamp>",
  "sceneRevision": "<commit plus patch identifier if dirty>",
  "sdkVersion": "<exact version>",
  "runtimeVersion": "<exact version>",
  "explorerBuild": "<version or hash>",
  "clientCount": 1,
  "fixtureChanges": [],
  "inputs": [],
  "observations": [],
  "artifacts": [],
  "limitations": []
}
```

For timing, include the sample interval and distinguish the first observed frame
from measured latency. For audio, distinguish a playing component from verified
audibility. Keep machine-specific paths, credentials and personal session data
out of shared evidence. Mute automation-owned browsers unless listening is part
of the test.

## Limits and maintenance

List what this example does not establish. Give a retest/removal condition for
workarounds. Link official API documentation, source/assets with provenance and
the appropriate SDK skill. State which behaviors need rechecking after an SDK,
explorer or input-layout change.
