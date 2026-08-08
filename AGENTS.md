# Virtual Electronics Workbench — Agent Guide

## Product direction

Build a calm, approachable workbench where circuits are assembled physically and then measured. The breadboard is the source of physical connectivity; the UI is not the electrical model. Use real millimetre dimensions and 2.54 mm terminal pitch.

## Architecture

- `src/domain`: framework-free electrical, physical, component, and project types.
- `src/simulation`: deterministic solvers and circuit extraction. Never import React or Three.js.
- `src/measurement`: calculations over simulation output. Never read React state directly.
- `src/workbench`: Three.js rendering and physical interactions. Rendering is a projection of domain state.
- `src/state`: reducer, commands, project lifecycle, and UI-facing selectors.
- `src/persistence`: versioned serialization and repository interfaces/clients.
- `src/ui`: non-3D React presentation.
- `server`: HTTP transport and SQLite repository. It may depend on domain persistence types, not UI code.

The authoritative flow is:

`PhysicalProject -> Circuit extraction -> Solver -> SimulationResult -> Measurements -> UI`

## Conventions

- Strict TypeScript; small, named modules; no `any`.
- Units are explicit in names (`positionMm`, `voltageV`, `resistanceOhms`).
- IDs are stable strings and must survive save/load.
- Every persisted shape has a schema version and migration path.
- Never put electrical connectivity or simulation calculations in JSX/renderers.
- Never resize physical packages merely to make placement easier.
- Keep component renderers procedural and inexpensive until a specific asset is justified.

## Adding a component

1. Define its electrical terminals/properties in `src/domain/circuit`.
2. Define its package dimensions and leads in `src/domain/physical`.
3. Add circuit-extraction stamps in `src/simulation/circuitBuilder.ts`.
4. Add a renderer in `src/workbench/components` that consumes domain state only.
5. Add unit tests for the model and solver behavior.

## Adding a simulation model

- Implement against the circuit types, not project/UI types.
- Return structured warnings/errors; never throw for a user-created invalid circuit.
- Add reference tests with tolerances and document numerical assumptions.
- Preserve the `SimulationEngine` boundary so the internal solver remains replaceable.

## Adding an instrument

- Instruments own settings and probe IDs in project state.
- Probes resolve to electrical nodes through the measurement layer.
- Time-dependent instruments use one shared simulation clock, never animation frames.

## Commands

- `npm install` — install dependencies.
- `npm run dev` — run API and Vite development server.
- `npm test` — unit/integration tests.
- `npm run lint` — lint TypeScript/React.
- `npm run build` — type-check and production build.
- `npm start` — run the SQLite API and serve `dist` after a build.
- `npm run check` — lint, test, and build.

## Testing and performance

- Test topology, placement, color bands, circuit extraction, DC reference cases, migrations, and SQLite behavior.
- A renderer change needs a browser smoke test at desktop and narrow widths.
- Prefer instancing for repeated breadboard holes and simple geometry for 50–100 components.
- Avoid per-frame React state updates and unnecessary allocations in render loops.
