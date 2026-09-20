# Big update Phase 0 audit

## Design read

Industrial Command Center for technical robot operators. The redesign is an overhaul of the visual layer while preserving information architecture, routes, state, backend contracts, motion authorization, E-stop behavior, and the separate mobile application.

## Baseline

- Framework: React + Vite + TypeScript
- Styling: Tailwind utilities plus `src/index.css` design tokens
- Primary visual mode: dark graphite, with a separate cool-silver light theme
- Brand accent: orange
- Semantic colors: green healthy/ready, amber warning/not ready, red error/E-stop
- Arm identity: desaturated cyan for Left and violet for Right
- Existing rollback snapshot: `.snapshots/frontend-v1`
- Big-update rollback snapshot: `.snapshots/frontend-v3-before-big-update`

## Structural audit

- Existing shell was a persistent wide sidebar and header.
- Control pages were card grids with the digital twin treated as one card among several.
- Single-arm and dual-arm actions lived in ordinary card footers.
- Camera previews were secondary and not consistently visible during data workflows.
- Telemetry was readable but did not have a strong instrument-panel hierarchy.
- Loading, diagnostic, and disconnected states existed in content but were not composed as a workspace mode.

## Phase 2 target

Recompose the control surfaces around a large technical-bay digital twin, side telemetry rails, and a sticky command dock. This is a visual composition change only. No command handlers, state transitions, backend requests, routes, or safety semantics are changed.
