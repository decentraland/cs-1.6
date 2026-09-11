# Classic scoreboard validation

- `rounds.json`: solo three-kill win, round reset, scored loss, 3/1 retained stats,
  kill ordering decoded from the rendered font, and no automatic board on a
  normal round result.
- `teams.json`: shared CT/T scores across two rounds, player counts, local-row
  highlight, teammate-only C4 status, and disabled dead inputs.
- `viewports.json` and the three PNGs: final two-player layout, headings, rounded
  frame, and proportions at 1280×720, 1024×768, and 1920×1080. These captures use
  `captureScoreboardViewports` from the actual game harness.
- `solo-match-end.json`: a later observation of the same solo match at 16–1 with
  Play again visible. This is not a 5v5 or full-match performance benchmark.

Raw CDP screenshots stalled on the 1080p resize. The same browser stayed live;
agent-browser CLI capture succeeded. The shared capture helper now uses that
path and passed the complete three-viewport sweep. All browsers were muted.
