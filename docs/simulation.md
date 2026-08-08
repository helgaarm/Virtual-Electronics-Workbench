# DC simulation

The solver uses Modified Nodal Analysis (MNA). Non-ground node voltages and ideal voltage-source currents are unknowns. Resistors stamp conductance into the nodal matrix; voltage sources add one current unknown and a constraint equation.

Open switches add no stamp. Closed ideal switches and jumper wires are collapsed into the same node by circuit extraction. A voltage source whose terminals collapse to the same node is reported as `DIRECT_SHORT` instead of being sent to the matrix solver.

LEDs use a deliberately simplified piecewise-linear model:

- off below the configured forward voltage;
- on as a forward-voltage offset in series with a small dynamic resistance;
- iterated until the on/off state stabilizes.

A very small conductance to ground keeps disconnected user-created nodes numerically defined. This is appropriate for the interactive educational scope but is not a replacement for SPICE. Unsupported reactive and semiconductor behavior is not silently approximated.
