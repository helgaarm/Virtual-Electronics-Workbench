# Instruments

Phase A/B exposes DC measurements in the inspector and analysis workspace. Values come from `SimulationResult`, never directly from renderer/UI state.

Future instruments will share `MeasurementProbe`, `MeasurementResult`, and `SimulationClock` abstractions. Oscilloscope and signal-generator work belongs to later transient phases; no waveform is faked in this milestone.
