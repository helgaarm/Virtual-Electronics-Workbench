# Virtual Electronics Workbench

A runnable Phase A/B foundation for physically building and simulating breadboard circuits in the browser.

The application opens with a working **Light an LED** example: a 5 V source, closed switch, 220 Ω axial resistor, red LED, ground reference, and curved return jumper. Turn output off, operate the switch, change resistance, rotate or re-snap parts, inspect live current/voltage, switch to DC analysis, and save/reopen the complete project from SQLite.

## Included in this milestone

### Phase A — physical workbench

- True Three.js scene with orbit, pan, zoom, top, 3D, fit, and reset views.
- 30-column solderless breadboard generated at a real 2.54 mm pitch.
- Separate A–E and F–J terminal strips, centre groove, split positive/negative rails, real hole entities, and optional connection highlighting.
- Procedural axial resistor with calculated four-band markings, physical leads, selection, discrete rotation, re-snapping, and occupancy protection.
- Physical 5 mm LED, power source, ground, tactile switch, and naturally raised jumper wire.
- Empty workbench, parts drawer, property inspector, delete, undo, and redo.

### Phase B — DC electronics

- Physical-hole/strip/wire/switch topology extraction into an independent electrical circuit.
- Modified Nodal Analysis solver for ideal DC voltage sources and resistors.
- Piecewise-linear educational LED model with subtle current-driven illumination.
- Open/closed switch behavior, live component V/I/P values, probe voltage, and structured direct-short errors.
- Shared Build and Test & Analysis project state.
- Versioned project documents stored in a real SQLite database through a small local API.
- New, Save, Save As, list, and Open flows.

Oscilloscope, signal generation, capacitors, and transient waveforms intentionally remain later phases. No waveform is fabricated.

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

This runs strict linting, 18 unit/integration tests, TypeScript project checking, and the Vite production build. Tests cover breadboard topology, rail splits, occupancy, resistor bands, physical rotation/snapping, Ohm’s law, voltage division, source shorts, switch/LED behavior, document versioning, SQLite CRUD, and the HTTP API.

## Interaction notes

- Drag empty space to orbit; wheel/trackpad zooms; the camera controls also support pan.
- Add parts from the left drawer. The editor chooses compatible free holes.
- Select a part in 3D, then change values or exact terminal holes in the inspector.
- **Rotate** moves the second lead to a physically compatible hole at the same spacing; it refuses an impossible or occupied target.
- Select a hole with **Show breadboard connections** enabled to highlight its internal metal strip.
- `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, and `Delete/Backspace` provide history and deletion.

## Persistence and sleep

SQLite data is durable on disk once Save is used. A normal computer sleep state suspends local processes, including this server; when the computer wakes, an already-running server normally resumes. No application can continue CPU work during true system sleep without changing the operating system power policy. This project does not change that policy.

## Architecture and limitations

Start with [docs/architecture.md](docs/architecture.md) and [AGENTS.md](AGENTS.md). Solver assumptions are in [docs/simulation.md](docs/simulation.md); physical scale/topology is in [docs/physical-model.md](docs/physical-model.md).

This is an educational simulator foundation, not SPICE and not a safety tool. The LED is simplified, disconnected nodes use a tiny numerical conductance, mechanical collision is discrete, and reactive/transient behavior is not part of Phase B.
