# Instruments

## Phase C multimeter

The Test & Analysis workspace exposes a voltmeter through the measurement layer. A project can contain multiple named readings. Every probe belongs to the multimeter and stores optional positive and COM breadboard-hole IDs; a deliberately disconnected lead is therefore valid persisted state.

Users can attach either lead by clicking a real hole in the live 3D board or by choosing the same printed hole label from a standard select control. Probe leads do not occupy holes and do not alter circuit topology. Their small 3D markers are a rendering projection of project state and remain visible when switching between Build and Test & Analysis.

The meter derives voltage from circuit extraction plus `SimulationResult`, never directly from React or renderer state. With a capacitor present it reads the latest accepted transient solution; otherwise it reads the DC operating point. Component telemetry uses the same boundary for voltage, current, and power. Every reading has a typed state: `valid`, `unavailable`, `disconnected`, or `simulation-error`. Missing ideal-connector branch currents are shown as unavailable rather than fabricated as zero.

Instrument selection, active lead, selected reading, names, probe connections, and transient settings are stored in schema version 4 and persist through SQLite. Versions 1 through 3 migrate automatically.

Transient timestep and speed persist, but the live clock, run/pause state, and capacitor charge history do not. Opening a project begins a fresh transient session at zero seconds.

## Deferred instruments

Oscilloscope and signal-generator UI remain deferred to Phase E. Phase D now provides the verified shared simulation timeline they require, so future instruments can render actual solver samples without synthesizing or faking waveforms.
