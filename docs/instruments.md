# Instruments

## Phase C multimeter

The Test & Analysis workspace exposes a DC voltmeter through the measurement layer. A project can contain multiple named readings. Every probe belongs to the multimeter and stores optional positive and COM breadboard-hole IDs; a deliberately disconnected lead is therefore valid persisted state.

Users can attach either lead by clicking a real hole in the live 3D board or by choosing the same printed hole label from a standard select control. Probe leads do not occupy holes and do not alter circuit topology. Their small 3D markers are a rendering projection of project state and remain visible when switching between Build and Test & Analysis.

The meter derives voltage from circuit extraction plus `SimulationResult`, never directly from React or renderer state. Component telemetry uses the same boundary for voltage, current, and power. Every reading has a typed state: `valid`, `unavailable`, `disconnected`, or `simulation-error`. Missing ideal-connector branch currents are shown as unavailable rather than fabricated as zero.

Instrument selection, active lead, selected reading, names, and probe connections are stored in schema version 3 and persist through SQLite. Version 1 and 2 projects migrate automatically to the multimeter model.

## Deferred instruments

Oscilloscope, signal generator, timebase, and sampled-waveform abstractions remain deferred until the transient engine is verified. Phase C does not synthesize or fake waveforms. Phase D adds capacitor/transient behavior; Phase E can then render only samples produced by that shared simulation timeline.
