# Architecture

## Current scope

Phase A provides the true-3D, millimetre-based breadboard and physical editing foundation. Phase B connects that physical state to a deterministic DC circuit and persists projects in SQLite. Phase C adds persistent multimeter state and an attachable probe workflow over the same measurement boundary.

## Boundaries

| Layer | Responsibility | Must not own |
| --- | --- | --- |
| Physical domain | holes, strips, occupancy, package dimensions and lead metadata, rotations | electrical solving, meshes |
| Electrical domain | nodes, terminals, idealized components | hole coordinates, React state |
| Circuit extraction | map strips, wires, switches and leads into electrical nodes | rendering |
| Simulation | MNA matrix/stamps and structured results | project/UI state |
| Measurement | derived V/I/P values | solver mutation |
| Rendering | meshes, materials, camera, picking | authoritative connectivity |
| State/UI | commands and orchestration | solver algorithms |
| Persistence | versioned project JSON in SQLite | domain behavior |

The project JSON is a stable but untrusted boundary. The client validates API responses and the server exhaustively validates nested values, component discriminators, holes, occupancy, limits, and schema versions before a document reaches SQLite. SQLite stores the complete validated document plus indexed metadata. Revision numbers are advanced transactionally and stale revisions receive HTTP 409 instead of overwriting a newer document.

## Local API contract

- `GET /api/health` reports the SQLite service status.
- `GET /api/projects` returns validated project summaries.
- `GET /api/projects/:id` returns one complete versioned project or 404.
- `PUT /api/projects/:id` requires matching URL/body IDs and the current revision. It returns the saved document with the next revision, 400 for invalid input, or 409 for a stale/future version.
- `DELETE /api/projects/:id` removes one project or returns 404.

JSON bodies are limited to 2 MB. Schema version 1 and 2 documents migrate to version 3; legacy probes are assigned to the multimeter, Phase C instrument settings are initialized, and version 1 revisions start at zero. Unsupported future schemas are rejected explicitly.

## Chosen libraries

- React + TypeScript + Vite: small, fast application shell with strict typing.
- Three.js through React Three Fiber and Drei: true 3D geometry, camera controls, and a maintainable React projection layer.
- Express: intentionally small JSON/static API surface.
- Node `node:sqlite`: real SQLite durability without native addon compilation.
- Vitest: one test runner for domain, solver, persistence, and API tests.

## Major risks

- Browser picking across many holes: holes are instanced, but larger or multiple boards will still need profiling and spatial indexing.
- MNA non-linearity: the Phase B LED uses a documented piecewise-linear iteration, not a semiconductor-accurate SPICE model.
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
