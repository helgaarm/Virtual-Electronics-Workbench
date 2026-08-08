# Architecture

## Current scope

Phase A provides the true-3D, millimetre-based breadboard and physical editing foundation. Phase B connects that physical state to a deterministic DC circuit and persists projects in SQLite.

## Boundaries

| Layer | Responsibility | Must not own |
| --- | --- | --- |
| Physical domain | holes, strips, occupancy, package leads, rotations | electrical solving, meshes |
| Electrical domain | nodes, terminals, idealized components | hole coordinates, React state |
| Circuit extraction | map strips, wires, switches and leads into electrical nodes | rendering |
| Simulation | MNA matrix/stamps and structured results | project/UI state |
| Measurement | derived V/I/P values | solver mutation |
| Rendering | meshes, materials, camera, picking | authoritative connectivity |
| State/UI | commands and orchestration | solver algorithms |
| Persistence | versioned project JSON in SQLite | domain behavior |

The project JSON is a stable boundary. SQLite stores the complete versioned document plus indexed metadata. This allows the backend storage to change later without changing editor or simulation code.

## Chosen libraries

- React + TypeScript + Vite: small, fast application shell with strict typing.
- Three.js through React Three Fiber and Drei: true 3D geometry, camera controls, and a maintainable React projection layer.
- Express: intentionally small JSON/static API surface.
- Node `node:sqlite`: real SQLite durability without native addon compilation.
- Vitest: one test runner for domain, solver, persistence, and API tests.

## Major risks

- Browser picking across many holes: repeated hole meshes are currently modest; move to instancing before larger boards or multiple boards.
- MNA non-linearity: the Phase B LED uses a documented piecewise-linear iteration, not a semiconductor-accurate SPICE model.
- Mechanical interaction: snapping/occupancy is discrete. It prevents contradictory terminal occupancy but is not a rigid-body engine.
- SQLite concurrency: a synchronous connection is sufficient for a local single-user app. A collaborative service will need a transactional async design.
- Project evolution: migrations are mandatory whenever persisted shapes change.

## Milestones

1. Architecture and versioned project model.
2. Physical breadboard, camera controls, hole topology.
3. Resistor/LED/switch/wire placement, rotation, occupancy and rendering.
4. Circuit extraction and DC MNA solver.
5. SQLite repository and project lifecycle UI.
6. Integrated verification and accessibility/browser smoke testing.
