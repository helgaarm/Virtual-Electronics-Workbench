# Instruments

## Phase C multimeter

The Test & Analysis workspace exposes a voltmeter through the measurement layer. A project can contain multiple named readings. Every probe belongs to the multimeter and stores optional positive and COM breadboard-hole IDs; a deliberately disconnected lead is therefore valid persisted state.

Users can attach either lead by clicking a real hole in the live 3D board or by choosing the same printed hole label from a standard select control. Probe leads do not occupy holes and do not alter circuit topology. Their small 3D markers are a rendering projection of project state and remain visible when switching between Build and Test & Analysis.

The meter derives voltage from circuit extraction plus `SimulationResult`, never directly from React or renderer state. When the shared timeline is active because of a capacitor, signal source, or connected oscilloscope channel, it reads the latest accepted transient solution; otherwise it reads the DC operating point. Component telemetry uses the same boundary for voltage, current, and power. Every reading has a typed state: `valid`, `unavailable`, `disconnected`, or `simulation-error`. Missing ideal-connector branch currents are shown as unavailable rather than fabricated as zero.

Instrument selection, active lead, selected reading, names, probe connections, and transient settings are stored in schema version 8 and persist through SQLite. Versions 1 through 7 migrate automatically.

Transient timestep and speed persist, but the live clock, run/pause state, and capacitor charge history do not. Opening a project begins a fresh transient session at zero seconds.

## Phase E oscilloscope

The oscilloscope has two independently connectable channels. Each channel persists its probe hole, reference hole, visibility, volts/div, and vertical offset. Time/div, active channel/lead, rising/falling display-stabilization edge, source, and level are shared settings. Run/Stop controls the same transient clock used by the capacitor model. Single clears the capture, records one current ten-division screen span, and stops. Auto chooses a nearby persisted scale and center from actual captured measurements.

The runtime records only the electrical nodes currently needed by the oscilloscope, frequency counter, and logic analyser and bounds the shared capture at 20,000 samples. Its time span is therefore `20,000 × timestep`; a wide time/div setting can show only the history that has actually been retained. Waveform paths, Vpp, mean, RMS, frequency, and period are derived from these samples, while display paths are extrema-preserving decimated to the screen resolution. Selected rising or falling threshold crossings are linearly interpolated for display stabilization; rising crossings also determine period and frequency. Stabilization aligns an existing edge and does not gate acquisition. Changing an instrument connection clears incompatible history so disconnected intervals are never bridged as waveform data. Disconnected channels and an empty capture have explicit states; no display-only waveform is generated.

## Phase E signal generator

The signal generator is an ideal time-dependent voltage source with square and sine modes, frequency, peak-to-peak amplitude, DC offset, output enable, and physical OUT/COM hole connections. Circuit extraction resolves those holes to electrical nodes. MNA evaluates source voltage at the endpoint of every fixed transient step, so downstream RC behavior emerges from the solver. Turning generator output off removes that source from the circuit, representing an open output rather than forcing 0 V. Connected oscilloscope probes also activate the shared timeline for DC-only circuits, producing an honest flat trace.

The generator accepts 0.01 Hz–1 kHz, 0–200 Vpp, and −100–100 V for persistence validation, but this range is educational rather than a hardware safety claim. The UI warns when the selected timestep gives fewer than 20 samples per cycle; the 50 µs footer option resolves that warning at the 1 kHz maximum. Frequency-domain analysis, output impedance, current limiting, noise, slew rate, and arbitrary waveforms remain unsupported.

## Original Phase 14 frequency counter

The counter stores optional input/reference breadboard holes, an edge direction, and a voltage threshold. It reads the same bounded transient samples as the scope, finds linearly interpolated crossings, and averages the intervals between matching edges. At least two crossings are required; disconnected, empty, and insufficient captures remain explicit instead of displaying a guessed value.

## Original Phase 15 logic analyser

The initial analyser provides eight persisted channels with independent names, visibility, and input holes plus one shared reference. Its selectable acquisition rate is a post-capture sampling interval on the common simulation timeline, not a second solver clock. Run/Stop and Single therefore control the same runtime used by the scope and counter. Time/div supplies zoom, and the selected channel plus rising/falling edge supplies display triggering.

Digital classification uses configurable TTL-style bands. The defaults are LOW below 0.8 V and HIGH above 2.0 V; equality and every value between the thresholds remain `undefined`. Trigger detection carries the last definite state across undefined samples, but never reclassifies the undefined region as HIGH or LOW. Other named logic families and protocol decoders remain future extensions.
