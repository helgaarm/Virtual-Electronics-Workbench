# Architecture

## Current scope

Phase A provides the true-3D, millimetre-based breadboard and physical editing foundation. Phase B connects that physical state to a deterministic DC circuit and persists projects in SQLite. Phase C adds persistent multimeter state and an attachable probe workflow over the same measurement boundary. Phase D adds polarized capacitors, transient MNA state, and a shared deterministic simulation clock. Phase E adds a time-dependent ideal signal source and a two-channel oscilloscope over bounded samples from that same clock. Phase F adds generic nonlinear semiconductor primitives, internal electrical subcircuits, reusable DIP packages, and the NE555N proof component.

## Boundaries

| Layer | Responsibility | Must not own |
| --- | --- | --- |
| Physical domain | holes, strips, occupancy, package dimensions and lead metadata, rotations | electrical solving, meshes |
| Electrical domain | nodes, terminals, semiconductor primitives, internal subcircuit definitions | hole coordinates, React state |
| Circuit extraction | map strips, wires, switches and leads into electrical nodes | rendering |
| Simulation | shared MNA stamps, linear/nonlinear DC and transient engines, subcircuit flattening, fixed-step clock, structured results | project/UI state, animation-frame timing, commercial-device special cases |
| Measurement | derived V/I/P and waveform statistics | solver mutation or display-only waveform synthesis |
| Rendering | meshes, materials, camera, picking | authoritative connectivity |
| State/UI | commands and orchestration | solver algorithms |
| Persistence | versioned project JSON in SQLite | domain behavior |

The project JSON is a stable but untrusted boundary. The client validates API responses and the server exhaustively validates nested values, component discriminators, holes, occupancy, limits, and schema versions before a document reaches SQLite. SQLite stores the complete validated document plus indexed metadata. Revision numbers are advanced transactionally and stale revisions receive HTTP 409 instead of overwriting a newer document.

## Local API contract

- `GET /api/health` reports the SQLite service status and supported project-schema version so stale frontend/backend combinations can be diagnosed explicitly.
- `GET /api/projects` returns validated project summaries.
- `GET /api/projects/:id` returns one complete versioned project or 404.
- `PUT /api/projects/:id` requires matching URL/body IDs and the current revision. It returns the saved document with the next revision, 400 for invalid input, or 409 for a stale/future version.
- `DELETE /api/projects/:id` removes one project or returns 404.

JSON bodies are limited to 2 MB. Schema versions 1 through 7 migrate to version 8; legacy probes are assigned to the multimeter, missing transient and instrument settings are initialized, legacy continuous scales are mapped to supported controls, and version 1 revisions start at zero. Unsupported future schemas are rejected explicitly.

## Package, device, and model separation

Physical packages are reusable geometry and placement contracts such as `DIP-8`. Electronic devices such as `NE555N` bind a named pinout and metadata to one package. Simulation models are separate electrical definitions: primitive resistor/capacitor/diode/BJT stamps or a reusable subcircuit. Circuit extraction maps only the visible device pins to breadboard nodes; recursive subcircuit flattening scopes internal component/node IDs and sends the expanded primitive network to the generic solver.

This internal representation already resembles the useful subset of a future SPICE importer: `.SUBCKT` external pins map to `externalNodeIds`, unnamed/private nets map to `internalNodeIds`, and R/C/D/Q records map to existing primitives. Parsing model cards, units, parameter expressions, controlled sources, and full Gummel–Poon behavior remains separate future work.

## Chosen libraries

- React + TypeScript + Vite: small, fast application shell with strict typing.
- Three.js through React Three Fiber and Drei: true 3D geometry, camera controls, and a maintainable React projection layer.
- Express: intentionally small JSON/static API surface.
- Node `node:sqlite`: real SQLite durability without native addon compilation.
- Vitest: one test runner for domain, solver, persistence, and API tests.

## Major risks

- Browser picking across many holes: holes are instanced, but larger or multiple boards will still need profiling and spatial indexing.
- MNA non-linearity: Newton iteration includes junction limiting and bounded transient retries, but the BJT model is a compact Ebers–Moll subset and the legacy LED remains piecewise-linear.
- Transient fidelity: the Phase D capacitor is ideal and uses a fixed-step backward-Euler model. Other reactive components and variable-step error control remain future work.
- Sampling fidelity: generator frequencies require an adequately small fixed timestep. The UI warns below 20 samples per cycle, but it does not silently resample or interpolate solver output.
- Mechanical interaction: snapping/occupancy is discrete. It prevents contradictory terminal occupancy but is not a rigid-body engine.
- SQLite concurrency: `BEGIN IMMEDIATE` plus optimistic document revisions protects the local multi-tab workflow. A collaborative service will still need a transactional async design and user-facing merge semantics.
- Project evolution: migrations are mandatory whenever persisted shapes change.

## Milestones

1. Architecture and versioned project model.
2. Physical breadboard, camera controls, hole topology.
3. Resistor/LED/switch/wire placement, rotation, occupancy and rendering.
4. Circuit extraction and DC MNA solver.
5. SQLite repository and project lifecycle UI.
6. Integrated verification and accessibility/browser smoke testing.
7. Persistent multimeter readings, probe attachment, 3D markers, and Test & Analysis telemetry.
8. Polarized capacitor, reusable MNA primitives, fixed-step transient clock, and verified RC charge/discharge response.
9. Square/sine signal source, bounded sample capture, two oscilloscope channels, trigger/scale controls, and waveform measurements.
10. Generic nonlinear devices, internal subcircuits, reusable DIP-8, and a breadboard-ready NE555N astable demonstration.
