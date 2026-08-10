# Virtual Electronics Workbench

[![CI](https://github.com/helgaarm/Virtual-Electronics-Workbench/actions/workflows/ci.yml/badge.svg)](https://github.com/helgaarm/Virtual-Electronics-Workbench/actions/workflows/ci.yml)

## Learn, Build, and Test Circuits

Virtual Electronics Workbench is first and foremost a place to learn electronics by physically
building breadboard circuits, predicting their behavior, testing them with simulated instruments,
and refining the design from evidence. PCB design is an optional, experimental follow-on exercise,
not the primary workflow and not a fabrication tool.

The application opens with **Light an LED**, a working 5 V circuit that learners can inspect,
modify, simulate, and measure. The breadboard's physical strips, holes, component leads, and jumper
wires are the source of connectivity; the 3D view only presents that project state.

## What learners can do

### Build and understand circuits

- Assemble components on a true Three.js solderless breadboard with real millimetre dimensions and
  2.54 mm terminal pitch.
- Snap, rotate, anchor, move, and wire parts while occupancy rules prevent contradictory placements.
- Highlight the internal metal strip connected to a selected hole and use starter projects to study
  series, parallel, divider, RC, transistor, digital, and NE555 circuits.
- Work with sources, switches, resistors, LEDs, capacitors, diodes, NPN/PNP transistors,
  potentiometers, TMP36, seven-segment displays, 74HC595, ATtiny85, and reusable DIP packages.

### Simulate circuit behavior

- Extract an electrical circuit from physical breadboard connectivity, then solve it independently
  of React and Three.js rendering.
- Use deterministic DC Modified Nodal Analysis, nonlinear diode/BJT iteration, internal subcircuits,
  and fixed-step transient capacitor simulation.
- Drive circuits with a square or sine signal generator and explore charge, discharge, switching,
  thresholds, and timing on one shared simulation clock.
- Receive structured errors for invalid or non-convergent circuits instead of invented measurements.

The models are intentionally educational rather than SPICE-complete. The behavioural 74HC595 and
incremental AVR runtime are independently tested foundations, but the application does not yet run a
validated end-to-end sensor → firmware → shift register → display chain. See the
[standard component-pack status](docs/standard-component-pack.md) before designing a mixed-signal
lesson around those parts.

### Test and measure

- Attach persisted multimeter leads to actual breadboard holes and compare multiple named readings.
- Inspect component voltage, current, and power when the solver can provide them.
- Observe solver samples with a two-channel oscilloscope; measure Vpp, mean, RMS, frequency, and
  period without display-only waveforms.
- Use a frequency counter and eight-channel logic analyser on the same deterministic sample history,
  including explicit LOW, HIGH, and undefined TTL regions.
- Run, pause, single-step, reset, and adjust timestep/speed while keeping elapsed time and transient
  state separate from animation frames.

### Save and revisit experiments

- Create, save, save as, list, and reopen complete versioned projects through a loopback-only API and
  SQLite database.
- Preserve stable component and instrument IDs and reject stale-tab writes with optimistic revisions.
- Migrate supported older project documents through the current schema while rejecting unsupported
  future formats explicitly.

### Continue to an optional PCB exercise

**PCB design is secondary to circuit learning and testing.** After a breadboard circuit works, the
experimental **Design PCB** workspace can convert its simulator-backed physical nets into a
through-hole board exercise with placement, a ratsnest, deterministic routing, DRC, and KiCad/CSV
exports. It is not fabrication-ready, and boards must not be manufactured from its output. Read the
[PCB warning and limitations](docs/pcb-designer.md) before using it.

## Requirements

- Node.js 24 or newer (tested with Node 26.7).
- npm 11 or newer.
- A browser with WebGL 2 support.

## Run in development

```console
npm install
npm run dev
```

Open <http://127.0.0.1:5173>. Vite proxies `/api` to the SQLite service at port 8787.

## Run the production build

```console
npm run build
npm start
```

Open <http://127.0.0.1:8787>. The API serves the built frontend and stores projects in `data/workbench.sqlite` by default.

Optional environment variables:

- `PORT` — API/static server port; default `8787`.
- `WORKBENCH_DB` — SQLite file path; default `data/workbench.sqlite`.

The API intentionally listens only on loopback and has no authentication; do not expose it as a network service. See [project persistence, backup, and recovery](docs/persistence-and-recovery.md).

## Verify

```console
npm run check
```

This runs repository-security, architecture-boundary, and local-documentation-link validation, strict linting, third-party-license inventory verification, the unit/integration test suite, TypeScript project checking, and the Vite production build. Tests cover breadboard topology, occupancy, jumper routing, DIP-8 placement, starter projects, resistor/LED/capacitor packages, nonlinear diode and NPN/PNP behavior, transistor reference circuits, NE555 control/reset/astable behavior, fixed-step timing, analytical RC response, source timing, oscilloscope measurements, extraction, document migration/validation, save races, API conflicts, and SQLite durability.

## Interaction notes

- Drag empty space to orbit; wheel/trackpad zooms; the camera controls also support pan.
- Add parts from the left drawer. The editor chooses compatible free holes.
- Choose a classic circuit under **Start projects** and load it as a fresh unsaved workbench.
- Load **RC charge and discharge**, then use the footer controls to run, pause, single-step, reset, or change the transient timestep and speed. The generator’s 0–5 V square wave alternately charges and discharges the capacitor through the resistor.
- In **Test & Analysis**, select **Oscilloscope** to compare CH1 and CH2, **Signal generator** to drive a square/sine signal, **Frequency counter** to measure an input edge stream, or **Logic analyser** to inspect up to eight threshold-aware digital channels. Every lead can be attached by a board click or printed-hole selector. For high frequencies, reduce the footer Step until the sampling warning disappears. At the 50 µs step, speed is limited to 2× so the clock can keep pace.
- Select a capacitor and use **Hard reset charge to 0 V** to force only that capacitor to an uncharged state; the simulation pauses and other capacitors retain their charge. **Reset all** clears every capacitor and returns transient time to zero.
- Load **NE555 astable oscillator**, open **Test & Analysis**, select the oscilloscope, and run the transient simulation. CH1 shows pin 3 output while CH2 shows the timing capacitor on pins 2/6. Changing RA, RB, or C changes the simulated frequency naturally.
- Drag a part in 3D to preview compatible snapped holes, then release to commit a valid placement.
- Components are anchored by default so selection cannot move them. Use **Unanchor** in the inspector before dragging, rotating, or changing terminal holes, then anchor the part again when finished.
- Select a part in 3D, then change values or exact terminal holes in the inspector.
- **Rotate** moves the second lead to a physically compatible hole at the same spacing; it refuses an impossible or occupied target.
- Select a hole with **Show breadboard connections** enabled to highlight its internal metal strip.
- In **Test & Analysis**, add or choose a saved reading, choose `Positive (+)` or `Common (COM)`, then click a hole in the live board. The hole selectors provide an equivalent keyboard-accessible workflow.
- `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, and `Delete/Backspace` provide history and deletion.

## Persistence and sleep

SQLite data is durable on disk once Save is used. A normal computer sleep state suspends local processes, including this server; when the computer wakes, an already-running server normally resumes. No application can continue CPU work during true system sleep without changing the operating system power policy. This project does not change that policy.

Saved projects retain components, transient timestep/speed, oscilloscope, signal-generator, frequency-counter, and logic-analyser setup. Elapsed simulation time, run/pause state, captured samples, and capacitor charge history are intentionally session-only and restart when a project is opened. Long browser stalls and system sleep do not trigger an unbounded simulation catch-up after wake.

## Architecture and limitations

Start with the [documentation index](docs/README.md), [architecture reference](docs/architecture.md), and [AGENTS.md](AGENTS.md). Solver assumptions are in [docs/simulation.md](docs/simulation.md), NE555 sources and limits are in [docs/ne555.md](docs/ne555.md), physical scale/topology is in [docs/physical-model.md](docs/physical-model.md), and the extension workflow is in [docs/component-authoring.md](docs/component-authoring.md). The cross-document findings and follow-up status are recorded in [docs/documentation-review.md](docs/documentation-review.md).

This is an educational simulator foundation, not SPICE and not a safety tool. The LED, capacitor, signal source, BJT model, and NE555 internals are deliberately simplified; disconnected nodes use a tiny numerical conductance, and mechanical collision is discrete. The NE555 is a hybrid analogue subcircuit, not a proprietary die-level transistor replica. Inductors, frequency-domain analysis, semiconductor capacitances, temperature sweeps, and arbitrary SPICE import remain unsupported. Jumper routing provides visual clearance around component packages and previously routed jumper spans, but remains a deterministic visual router rather than a general-purpose mechanical solver.

## License and dependencies

The application source is licensed under the [MIT License](LICENSE). The installed production dependency graph uses permissive MIT, ISC, Apache-2.0, and BSD-3-Clause terms; one package omits its package metadata but includes an MIT license file. Redistributable dependency notices and terms are collected in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) and can be refreshed with `npm run licenses:generate`. See [docs/dependency-review.md](docs/dependency-review.md) for the dated security, freshness, and license review.

## Contributing and security

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Please report suspected vulnerabilities privately as described in [SECURITY.md](SECURITY.md), not through a public issue.
