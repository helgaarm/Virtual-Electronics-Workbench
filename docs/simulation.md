# Simulation

## DC operating point

The solver uses Modified Nodal Analysis (MNA). Non-ground node voltages and ideal voltage-source currents are unknowns. Resistors stamp conductance into the nodal matrix; voltage sources add one current unknown and a constraint equation.

Open switches add no stamp. Closed ideal switches and jumper wires are collapsed into the same node by circuit extraction. A voltage source whose terminals collapse to the same node is reported as `DIRECT_SHORT` instead of being sent to the matrix solver.

LEDs use a deliberately simplified piecewise-linear model:

- off below the configured forward voltage;
- on as a forward-voltage offset in series with a small dynamic resistance;
- iterated until the on/off state stabilizes.

A very small conductance to ground keeps disconnected user-created nodes numerically defined. Capacitors are open circuits in the DC operating-point solver. This is appropriate for the interactive educational scope but is not a replacement for SPICE.

## Phase D transient simulation

Transient simulation reuses the same MNA matrix and component extraction boundary. A capacitor is represented for each fixed timestep with the backward-Euler companion model:

`G = C / Δt`

`Ipositive→negative = −G × Vprevious`, where `Vprevious = V+ − V−`

The conductance is stamped between the capacitor terminals and the history current source preserves its voltage from the preceding accepted step. Component IDs key the transient state, so unrelated edits cannot silently transfer charge between capacitors. Invalid capacitance or timestep values produce structured simulation errors.

The application advances simulation from a shared fixed-step clock rather than render frames. Wall-clock time is scaled by the selected speed, accumulated, and converted into whole simulation steps with a bounded catch-up count. To avoid a runaway workload after browser throttling or system sleep, elapsed input is clamped and excess whole-step backlog beyond the catch-up limit is discarded while the fractional remainder is retained. Run, pause, single-step, and reset all use this same clock and solver state. Reset returns to zero seconds in a paused state; changing speed or timestep does not advance a paused circuit. Powering the source off changes its voltage to zero without clearing capacitor history, which permits a physical discharge path to be observed.

The RC starter circuit uses 10 kΩ and 100 µF, giving `τ = RC = 1 s`. Automated tests compare simulated charging with `V(t) = Vs(1 − e^(−t/RC))` at one and five time constants and verify that the same starter circuit discharges after its output is set to zero volts.

## Deliberate limits

The capacitor model is ideal: equivalent series resistance, leakage, dielectric absorption, tolerance, temperature, and voltage-dependent effects are not modeled. Inductors, AC/signal sources, frequency-domain analysis, and semiconductor-accurate behavior remain unsupported rather than being silently approximated. Phase E instruments will consume actual samples from this simulation timeline; the application does not synthesize display-only waveforms.
