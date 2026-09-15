import type { ElectricalSubcircuit } from '../../domain/circuit/types';

/** A bounded educational LM358 stage. It models finite output drive and clamps
 * through the supply rails; frequency response and input bias are omitted. */
export function createLm358Subcircuit(
  id: string,
  pins: Record<`pin${number}`, string>,
): ElectricalSubcircuit {
  const components: ElectricalSubcircuit['definition']['components'] = [];
  for (const [suffix, output, negative, positive] of [['a', 'pin1', 'pin2', 'pin3'], ['b', 'pin7', 'pin6', 'pin5']] as const) {
    components.push(
      { id: `${suffix}:pull-down`, kind: 'resistor', positiveNodeId: output, negativeNodeId: 'pin4', resistanceOhms: 100 },
      { id: `${suffix}:gain`, kind: 'smooth-transconductance', outputPositiveNodeId: 'pin8', outputNegativeNodeId: output, controlPositiveNodeId: positive, controlNegativeNodeId: negative, maximumCurrentA: 0.04, transitionVoltageV: 0.002 },
    );
  }
  return { id, kind: 'subcircuit', externalNodes: { ...pins }, definition: { externalNodeIds: ['pin1','pin2','pin3','pin4','pin5','pin6','pin7','pin8'], internalNodeIds: [], components } };
}

/** Four independent NAND stages. Pull-ups and two series input-controlled
 * switches preserve electrical loading while keeping the logic model generic. */
export function create74hc00Subcircuit(id: string, pins: Record<`pin${number}`, string>): ElectricalSubcircuit {
  const gates = [['pin1','pin2','pin3'], ['pin4','pin5','pin6'], ['pin9','pin10','pin8'], ['pin12','pin13','pin11']] as const;
  const components: ElectricalSubcircuit['definition']['components'] = [];
  const internalNodeIds: string[] = [];
  gates.forEach(([inputA, inputB, output], index) => {
    const middle = `gate-${index + 1}-series`;
    internalNodeIds.push(middle);
    components.push(
      { id: `gate-${index + 1}:pull-up`, kind: 'resistor', positiveNodeId: 'pin14', negativeNodeId: output, resistanceOhms: 50 },
      { id: `gate-${index + 1}:a`, kind: 'smooth-switch', positiveNodeId: output, negativeNodeId: middle, controlPositiveNodeId: inputA, controlNegativeNodeId: 'pin7', onResistanceOhms: 25, transitionVoltageV: 0.35 },
      { id: `gate-${index + 1}:b`, kind: 'smooth-switch', positiveNodeId: middle, negativeNodeId: 'pin7', controlPositiveNodeId: inputB, controlNegativeNodeId: 'pin7', onResistanceOhms: 25, transitionVoltageV: 0.35 },
    );
  });
  return { id, kind: 'subcircuit', externalNodes: { ...pins }, definition: { externalNodeIds: Array.from({ length: 14 }, (_, index) => `pin${index + 1}`), internalNodeIds, components } };
}
