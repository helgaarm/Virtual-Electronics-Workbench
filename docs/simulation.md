# Simulation

## DC operating point

The solver uses Modified Nodal Analysis (MNA). Non-ground node voltages and ideal voltage-source currents are unknowns. Resistors stamp conductance into the nodal matrix; voltage sources add one current unknown and a constraint equation.

Open switches add no stamp. Closed ideal switches and jumper wires are collapsed into the same node by circuit extraction. A voltage source whose terminals collapse to the same node is reported as `DIRECT_SHORT` instead of being sent to the matrix solver.

LEDs use a deliberately simplified piecewise-linear model:

- off below the configured forward voltage;
- on as a forward-voltage offset in series with a small dynamic resistance;
- iterated until the on/off state stabilizes.

A very small conductance to ground keeps disconnected user-created nodes numerically defined. Capacitors are open circuits in the DC operating-point solver. This is appropriate for the interactive educational scope but is not a replacement for SPICE.

## Nonlinear solve

Diodes, NPN/PNP BJTs, and reusable analogue stages are solved inside the same MNA boundary with Newton iteration:

1. seed the node-voltage estimate from voltage sources or the previous accepted transient state;
2. evaluate every nonlinear device and its analytic Jacobian at that estimate;
3. stamp the equivalent linearized currents and conductances;
4. solve the MNA matrix;
5. limit diode/BJT junction-voltage movement, record the update delta, and test ideal-source constraints plus actual circuit KCL residual;
6. repeat up to the deterministic iteration limit.

The implementation uses a 1 mV absolute plus `1e-6` relative ideal-source-constraint tolerance, and a 5 nA absolute plus `1e-4` relative Kirchhoff-current residual. Voltage update delta is retained in diagnostics but is not a second acceptance gate when the actual circuit equations already satisfy those tolerances. It permits at most 500 Newton iterations. Exponential junction evaluation is capped at a normalized exponent of 27 and continued linearly beyond the cap so an extreme forward voltage cannot overflow JavaScript numbers or create an unbounded matrix coefficient. Diode/BJT junction changes are limited symmetrically to 100 mV per iteration, with grounded voltage-source nodes held fixed. Cross-coupled BJT circuits use deterministic backtracking candidates (`1`, `0.5`, `0.25`, `0.1`, `0.05`, and `0.02`) ranked by the actual circuit KCL/voltage-constraint residual. A failure returns `NONLINEAR_CONVERGENCE_FAILURE` and no measurements are fabricated. Invalid junction/gain parameters return `INVALID_SEMICONDUCTOR_PARAMETERS`.

The diode is the Shockley junction `I = Is × (exp(V/(nVt)) - 1)` at a parameterized temperature. The BJT is a compact Ebers–Moll model with forward and reverse transport factors derived from beta, two exponential base junctions, both NPN and PNP polarity, and analytic collector/base/emitter Jacobian stamps. It deliberately omits Early effect, high-injection effects, charge storage, junction capacitances, noise, tolerances, and self-heating. The parameter structures can be extended without changing the MNA interface.

The NE555 also uses two generic smooth nonlinear primitives: a saturating controlled current stage and a finite-resistance controlled analogue switch. Both are differentiable `tanh` functions stamped through the same device/Jacobian interface. These primitives are reusable model-building blocks; neither contains NE555 pin names, thresholds, state, timing equations, or waveform logic.

## Internal subcircuits

A visible subcircuit binds named external pins to circuit nodes and owns private internal nodes/components. Before solving, recursive flattening scopes each private identifier under a reserved internal namespace and expands the network into ordinary primitives. Internal elements participate fully in DC/transient MNA while remaining absent from breadboard occupancy and the normal parts tree. Nested subcircuits are supported; missing bindings, duplicate IDs/nodes, undeclared node references, and cyclic definitions are rejected before expansion.

The representation is intentionally compatible with a future limited SPICE import layer: `.SUBCKT` pins, internal nets, and R/C/D/Q elements have direct internal equivalents. A complete SPICE parser/model-card system is not implemented.

## Phase D transient simulation

Transient simulation reuses the same MNA matrix and component extraction boundary. A capacitor is represented for each fixed timestep with the backward-Euler companion model:

`G = C / Δt`

`Ipositive→negative = −G × Vprevious`, where `Vprevious = V+ − V−`

The conductance is stamped between the capacitor terminals and the history current source preserves its voltage from the preceding accepted step. Component IDs key the transient state, so unrelated edits cannot silently transfer charge between capacitors. Invalid capacitance or timestep values produce structured simulation errors.

For nonlinear transient circuits, the previous accepted node-voltage solution seeds the next requested step. Capacitor state and node state are committed only after convergence. Topology changes retain capacitor history by component ID but discard node-voltage guesses because extracted node IDs can be reassigned. If Newton iteration fails, the solver retries the interval as two half-steps, with at most eight subdivision levels; a failed retry returns the original accepted state. The user-facing error includes the approximate simulation time and recommends a smaller timestep or a wiring check.

The application advances simulation from a shared fixed-step clock rather than render frames. Wall-clock time is scaled by the selected speed, accumulated, and converted into whole simulation steps with a bounded catch-up count. To avoid a runaway workload after browser throttling or system sleep, elapsed input is clamped and excess whole-step backlog beyond the catch-up limit is discarded while the fractional remainder is retained. Run, pause, single-step, and reset all use this same clock and solver state. Reset all returns every capacitor to 0 V and transient time to zero in a paused state. A selected capacitor can also be hard-reset individually to 0 V at the current simulation time; this pauses the simulation without changing other capacitor states. Changing speed or timestep does not advance a paused circuit. Powering the source off changes its voltage to zero without clearing capacitor history, which permits a physical discharge path to be observed.

The RC starter circuit uses 10 kΩ and 100 µF, giving `τ = RC = 1 s`, and drives it with a 0–5 V square wave so charging and discharging can be observed repeatedly. Separate deterministic solver fixtures compare a DC-step response with `V(t) = Vs(1 − e^(−t/RC))` at one and five time constants and verify discharge after a DC source is set to zero volts.

## Phase E time-dependent sources and sampling

The function generator is represented in the extracted electrical circuit as an ideal time-dependent voltage source. For peak-to-peak amplitude `Vpp`, DC offset `Voffset`, frequency `f`, and simulation time `t`:

- sine: `V(t) = Voffset + Vpp/2 × sin(2πft)`;
- square: `V(t) = Voffset + Vpp/2` for the first half-cycle and `Voffset − Vpp/2` for the second half-cycle.

Transient MNA stamps the source value at each backward-Euler step endpoint. Disabling generator output omits the source from circuit extraction, so the output is open rather than clamped to 0 V. The oscilloscope consumes accepted node-voltage samples from this same solve. Its display and measurements therefore reflect timestep resolution, including numerical integration error and aliasing; they are not an independent signal generator. The runtime retains at most 20,000 samples and includes only nodes requested by CH1/CH2, so retained history spans `20,000 × timestep` seconds.

## Deliberate limits

The capacitor model is ideal: equivalent series resistance, leakage, dielectric absorption, tolerance, temperature, and voltage-dependent effects are not modeled. The signal generator is also ideal: it has no output impedance, current limit, noise, slew rate, or distortion. The BJT model is an educational compact model, and the NE555 is a hybrid analogue subcircuit rather than an exact manufacturer transistor network. Inductors, frequency-domain analysis, arbitrary waveforms, device charge storage, full Gummel–Poon models, and SPICE import remain unsupported rather than being silently approximated. The application does not synthesize display-only waveforms.
