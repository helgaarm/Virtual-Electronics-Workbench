# Virtual Electronics Workbench

A runnable Phase A–D foundation for physically building, simulating, and measuring breadboard circuits in the browser.

The application opens with a working **Light an LED** example: a 5 V source, closed switch, 220 Ω axial resistor, red LED, ground reference, and curved return jumper. Turn output off, operate the switch, change resistance, rotate or re-snap parts, attach multimeter probes, inspect live readings, and save/reopen the complete project from SQLite.

## Included in this milestone

### Phase A — physical workbench

- True Three.js scene with orbit, pan, zoom, top, 3D, fit, and reset views.
- 30-column solderless breadboard generated at a real 2.54 mm pitch.
- Separate A–E and F–J terminal strips, centre groove, split positive/negative rails, real hole entities, and optional connection highlighting.
- Procedural axial resistor with calculated four-band markings (including gold/silver low-ohm multipliers), fixed package dimensions, physical leads, selection, drag-to-snap, discrete rotation, and occupancy protection.
- Physical 5 mm LED, power source, ground, tactile switch, and obstacle-aware raised jumper wires that bend around component packages.
- Empty workbench, parts drawer, property inspector, delete, undo, and redo.

### Phase B — DC electronics

- Physical-hole/strip/wire/switch topology extraction into an independent electrical circuit.
- Modified Nodal Analysis solver for ideal DC voltage sources and resistors.
- Piecewise-linear educational LED model with subtle current-driven illumination.
- Open/closed switch behavior, typed component V/I/P measurements, probe voltage, unavailable/disconnected states, and structured direct-short errors.
- Shared Build and Test & Analysis project state.
- Four built-in classic starter projects: switched LED, voltage divider, series LEDs, and parallel indicators.
- Exhaustively validated, versioned project documents stored in a real SQLite database through a small local API.
- Optimistic revisions that reject stale-tab writes instead of silently replacing newer work.
- New, Save, Save As, list, and Open flows.

### Phase C — Test & Analysis

- Multiple named DC voltage readings with independently persisted probe connections.
- Explicit positive and COM lead workflow: select a lead, then click a real breadboard hole or use the accessible printed-hole selector.
- Non-occupying 3D probe markers and consistent `+`/`COM` hole labels in Build and Test views.
- Live disconnected/error guidance and a saved-reading rack for quickly comparing nodes.
- Component telemetry showing available voltage, current, and power without fabricating unsupported ideal-connector currents.
- Automatic migration of Phase A/B version 1 and 2 projects into the current project schema.

### Phase D — capacitors and transients

- Polarized radial electrolytic capacitor with authentic package proportions, polarity markings, fixed lead geometry, configurable capacitance, and displayed voltage-rating metadata.
- Shared transient solver using Modified Nodal Analysis and a backward-Euler capacitor companion model.
- Deterministic fixed-step simulation clock with run, pause, single-step, reset, timestep, and speed controls.
- Capacitor state is preserved while the circuit runs and across output on/off changes, enabling charge and discharge experiments.
- Built-in **RC charge and discharge** starter project with a 10 kΩ resistor, 100 µF capacitor, and capacitor-voltage probe.
- Schema version 4 persists capacitor data and transient settings through SQLite; older projects migrate automatically.
- Verified RC response against the analytical time constant, including charge at one and five time constants and source-off discharge.

Oscilloscope and signal generation intentionally remain a later phase. No waveform is fabricated.

## Requirements

- Node.js 24 or newer (tested with Node 26.7).
- npm 11 or newer.
- A browser with WebGL 2 support.

## Run in development

```powershell
npm install
npm run dev
```

Open <http://127.0.0.1:5173>. Vite proxies `/api` to the SQLite service at port 8787.

## Run the production build

```powershell
npm run build
npm start
```

Open <http://127.0.0.1:8787>. The API serves the built frontend and stores projects in `data/workbench.sqlite` by default.

Optional environment variables:

- `PORT` — API/static server port; default `8787`.
- `WORKBENCH_DB` — SQLite file path; default `data/workbench.sqlite`.

## Verify

```powershell
npm run check
```

This runs strict linting, third-party-license inventory verification, the unit/integration test suite, TypeScript project checking, and the Vite production build. Tests cover breadboard topology, rail splits, occupancy, jumper obstacle routing, starter-project validity, drag/rotation snapping, resistor bands, capacitor packages, fixed-step timing, analytical RC charge/discharge response, measurement states, extraction, Ohm’s law, voltage division, source behavior, switch/LED behavior, document migration and validation, save races, API validation, stale-write conflicts, and in-memory plus on-disk SQLite durability.

## Interaction notes

- Drag empty space to orbit; wheel/trackpad zooms; the camera controls also support pan.
- Add parts from the left drawer. The editor chooses compatible free holes.
- Choose a classic circuit under **Start projects** and load it as a fresh unsaved workbench.
- Load **RC charge and discharge**, then use the footer controls to run, pause, single-step, reset, or change the transient timestep and speed. Turn output off to watch the capacitor discharge through the resistor.
- Drag a part in 3D to preview compatible snapped holes, then release to commit a valid placement.
- Components are anchored by default so selection cannot move them. Use **Unanchor** in the inspector before dragging, rotating, or changing terminal holes, then anchor the part again when finished.
- Select a part in 3D, then change values or exact terminal holes in the inspector.
- **Rotate** moves the second lead to a physically compatible hole at the same spacing; it refuses an impossible or occupied target.
- Select a hole with **Show breadboard connections** enabled to highlight its internal metal strip.
- In **Test & Analysis**, add or choose a saved reading, choose `Positive (+)` or `Common (COM)`, then click a hole in the live board. The hole selectors provide an equivalent keyboard-accessible workflow.
- `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, and `Delete/Backspace` provide history and deletion.

## Persistence and sleep

SQLite data is durable on disk once Save is used. A normal computer sleep state suspends local processes, including this server; when the computer wakes, an already-running server normally resumes. No application can continue CPU work during true system sleep without changing the operating system power policy. This project does not change that policy.

Saved projects retain components and transient timestep/speed settings. Elapsed simulation time, run/pause state, and capacitor charge history are intentionally session-only and restart when a project is opened. Long browser stalls and system sleep do not trigger an unbounded simulation catch-up after wake.

## Architecture and limitations

Start with [docs/architecture.md](docs/architecture.md) and [AGENTS.md](AGENTS.md). Solver assumptions are in [docs/simulation.md](docs/simulation.md); physical scale/topology is in [docs/physical-model.md](docs/physical-model.md).

This is an educational simulator foundation, not SPICE and not a safety tool. The LED is simplified, the capacitor is idealized, disconnected nodes use a tiny numerical conductance, and mechanical collision is discrete. Phase D supports capacitor transients only; inductors, AC sources, frequency-domain analysis, and semiconductor-accurate models are not yet supported. Jumper routing provides visual clearance around component packages; it is not a general collision solver and does not route around other jumper wires.

## License and dependencies

The application source is licensed under the [MIT License](LICENSE). The installed production dependency graph uses permissive MIT, ISC, Apache-2.0, and BSD-3-Clause terms; one package omits its package metadata but includes an MIT license file. Redistributable dependency notices and terms are collected in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) and can be refreshed with `npm run licenses:generate`. See [docs/dependency-review.md](docs/dependency-review.md) for the dated security, freshness, and license review.
