# Virtual Electronics Workbench

[![CI](https://github.com/helgaarm/Virtual-Electronics-Workbench/actions/workflows/ci.yml/badge.svg)](https://github.com/helgaarm/Virtual-Electronics-Workbench/actions/workflows/ci.yml)

## From Breadboard to Real PCB

Build and test a circuit, then open **Design PCB** to convert its simulator-backed electrical nets
into an approachable single-sided through-hole board. The current milestone provides realistic
millimetre footprints, initial placement, a ratsnest, deterministic bottom-copper routing, board
flipping, DRC, stable project persistence, KiCad PCB export, a CSV BOM and a manufacturing summary.
It deliberately reports missing footprints and keeps manufacturing ZIP unavailable rather than
creating unvalidated fabrication data. See [the PCB designer documentation](docs/pcb-designer.md)
for supported packages and current limitations.

A runnable Phase A–F foundation, completed through the original instrument phases 14–15, for physically building, simulating, generating, and measuring breadboard circuits in the browser.

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
- Schema version 8 persists capacitors, NE555/DIP-8 placements, transient settings, and every instrument setup through SQLite; older projects migrate automatically.
- Verified RC response against the analytical time constant, including charge at one and five time constants and source-off discharge.

### Phase E — oscilloscope and signal generation

- Two-channel oscilloscope with independent CH1/CH2 probes, grounds, visibility, and volts/div controls.
- Shared time/div and rising/falling-edge display-stabilization source/level controls, Run, Stop, single-screen capture, and Auto scaling/centering.
- Live Vpp, mean, RMS, frequency, and period-derived measurements calculated from captured solver samples.
- Square and sine function generator with frequency, Vpp amplitude, DC offset, output enable, and physical output/COM breadboard connections.
- Time-dependent generator voltage is stamped into MNA at every fixed timestep; the display never fabricates a waveform.
- A bounded capture buffer stores only the electrical nodes used by the oscilloscope channels.
- The **RC charge and discharge** starter opens with generator output, CH1 input, and CH2 capacitor voltage already connected.

### Phase F — nonlinear semiconductors and NE555N

- Generic Newton iteration integrates safe Shockley diodes, simplified Ebers–Moll NPN/PNP BJTs, and reusable analogue primitives with DC and transient MNA.
- Accepted transient node voltages seed the next nonlinear step; bounded half-step retries preserve the last valid state when a requested step does not converge.
- Visible devices can own recursively flattened electrical subcircuits whose internal nodes never occupy breadboard holes.
- Reusable, manufacturer-dimensioned DIP-8 package geometry supplies correct 2.54 mm pin pitch, 7.62 mm row spacing, notch, pin-1 marker, metallic leads, and top markings.
- The NE555N is a breadboard-ready DIP-8 component with standard pin mapping, centre-channel placement rules, 180-degree rotation, anchoring, undo/redo, and save/reload support.
- Its educational hybrid analogue subcircuit uses a physical three-resistor reference divider, smooth comparator stages, an analogue latch, and finite-resistance output/discharge stages. It does not contain a decorative waveform or a 555 oscillator equation.
- The built-in **NE555 astable oscillator** connects genuine timing resistors/capacitor and preconfigures scope channels for the output and timing-capacitor voltage.

### Original phases 14–15 — digital timing instruments

- Frequency counter with physical input/reference leads, selectable rising/falling edge and threshold, and frequency/period derived from the shared captured waveform.
- Eight-channel logic analyser with named and independently visible inputs, shared reference, sample-rate control, Run/Stop/Single, edge trigger, and time zoom.
- Explicit 5 V TTL classification: below 0.8 V is LOW, above 2.0 V is HIGH, and the region between is retained as undefined.
- Oscilloscope, counter, and logic analyser capture the same simulated nodes on one deterministic clock; none contains its own circuit or display-only waveform generator.

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

This runs strict linting, third-party-license inventory verification, the unit/integration test suite, TypeScript project checking, and the Vite production build. Tests cover breadboard topology, occupancy, jumper routing, DIP-8 placement, starter projects, resistor/LED/capacitor packages, nonlinear diode and NPN/PNP behavior, transistor reference circuits, NE555 control/reset/astable behavior, fixed-step timing, analytical RC response, source timing, oscilloscope measurements, extraction, document migration/validation, save races, API conflicts, and SQLite durability.

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

Start with [docs/architecture.md](docs/architecture.md) and [AGENTS.md](AGENTS.md). Solver assumptions are in [docs/simulation.md](docs/simulation.md), NE555 sources and limits are in [docs/ne555.md](docs/ne555.md), physical scale/topology is in [docs/physical-model.md](docs/physical-model.md), and the extension workflow is in [docs/component-authoring.md](docs/component-authoring.md).

This is an educational simulator foundation, not SPICE and not a safety tool. The LED, capacitor, signal source, BJT model, and NE555 internals are deliberately simplified; disconnected nodes use a tiny numerical conductance, and mechanical collision is discrete. The NE555 is a hybrid analogue subcircuit, not a proprietary die-level transistor replica. Inductors, frequency-domain analysis, semiconductor capacitances, temperature sweeps, and arbitrary SPICE import remain unsupported. Jumper routing provides visual clearance around component packages and previously routed jumper spans, but remains a deterministic visual router rather than a general-purpose mechanical solver.

## License and dependencies

The application source is licensed under the [MIT License](LICENSE). The installed production dependency graph uses permissive MIT, ISC, Apache-2.0, and BSD-3-Clause terms; one package omits its package metadata but includes an MIT license file. Redistributable dependency notices and terms are collected in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) and can be refreshed with `npm run licenses:generate`. See [docs/dependency-review.md](docs/dependency-review.md) for the dated security, freshness, and license review.

## Contributing and security

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Please report suspected vulnerabilities privately as described in [SECURITY.md](SECURITY.md), not through a public issue.
