# Instruments

Phase A/B exposes DC measurements through the measurement layer in the inspector and analysis workspace. It derives values from circuit extraction plus `SimulationResult`, never directly from renderer/UI state. Every reading has a typed state: `valid`, `unavailable`, `disconnected`, or `simulation-error`. Missing branch currents are shown as unavailable rather than fabricated as zero.

Oscilloscope, signal-generator, timebase, and sampled-waveform abstractions belong to later transient phases; they do not exist yet and no waveform is faked in this milestone.
