import type { Circuit, ElectricalResistor, SimulationResult } from '../../domain/circuit/types';
import { electricalComponentNodeIds } from '../../domain/circuit/types';

interface AnchorSource { id: string; child: string; parent: string; sign: number; voltageV: number }
export interface ResistivePinReduction {
  circuit: Circuit;
  fixedVoltages: Map<string, number>;
  restore(result: SimulationResult): SimulationResult;
}

/** Exact elimination of isolated resistor stars tied to ideal voltage anchors.
 * GPIO input loads are commonly such stars. Loaded LED/BJT nodes stay in MNA.
 * This optimization is independent of device identity and preserves source loading.
 */
export function reduceResistivePins(circuit: Circuit): ResistivePinReduction {
  const fixedVoltages = new Map<string, number>([[circuit.groundNodeId, 0]]);
  const anchorSources: AnchorSource[] = [];
  const sources = circuit.components.filter((part) => part.kind === 'voltage-source');
  for (let pass = 0; pass < sources.length; pass += 1) {
    let changed = false;
    for (const source of sources) {
      const positive = fixedVoltages.get(source.positiveNodeId);
      const negative = fixedVoltages.get(source.negativeNodeId);
      if ((positive === undefined) === (negative === undefined)) continue;
      const child = positive === undefined ? source.positiveNodeId : source.negativeNodeId;
      const parent = positive === undefined ? source.negativeNodeId : source.positiveNodeId;
      const sign = positive === undefined ? 1 : -1;
      fixedVoltages.set(child, fixedVoltages.get(parent)! + sign * source.voltageV);
      anchorSources.push({ id: source.id, child, parent, sign, voltageV: source.voltageV });
      changed = true;
    }
    if (!changed) break;
  }
  const incident = new Map<string, Circuit['components']>();
  for (const part of circuit.components) for (const node of new Set(electricalComponentNodeIds(part))) {
    incident.set(node, [...(incident.get(node) ?? []), part]);
  }
  const removed = new Map<string, ElectricalResistor>();
  const pinVoltages: Record<string, number> = {};
  for (const [node, parts] of incident) {
    if (fixedVoltages.has(node) || !parts.length) continue;
    if (!parts.every((part) => part.kind === 'resistor' && Number.isFinite(part.resistanceOhms) && part.resistanceOhms > 0 && part.positiveNodeId !== part.negativeNodeId
      && fixedVoltages.has(part.positiveNodeId === node ? part.negativeNodeId : part.positiveNodeId))) continue;
    let conductance = 1e-12; // Same global-ground GMIN as the MNA solver.
    let rhs = 0;
    for (const part of parts as ElectricalResistor[]) {
      const other = part.positiveNodeId === node ? part.negativeNodeId : part.positiveNodeId;
      conductance += 1 / part.resistanceOhms;
      rhs += fixedVoltages.get(other)! / part.resistanceOhms;
      removed.set(part.id, part);
    }
    pinVoltages[node] = rhs / conductance;
  }
  return {
    circuit: { ...circuit, components: circuit.components.filter((part) => !removed.has(part.id)) },
    fixedVoltages,
    restore: (result) => {
      if (result.status === 'error') return result;
      const nodeVoltages = { ...result.nodeVoltages, ...pinVoltages };
      const componentCurrents = { ...result.componentCurrents };
      const componentPowers = { ...result.componentPowers };
      const loads = new Map<string, number>();
      for (const part of removed.values()) {
        const drop = nodeVoltages[part.positiveNodeId] - nodeVoltages[part.negativeNodeId];
        const current = drop / part.resistanceOhms;
        componentCurrents[part.id] = current;
        componentPowers[part.id] = drop * current;
        if (fixedVoltages.has(part.positiveNodeId)) loads.set(part.positiveNodeId, (loads.get(part.positiveNodeId) ?? 0) + current);
        if (fixedVoltages.has(part.negativeNodeId)) loads.set(part.negativeNodeId, (loads.get(part.negativeNodeId) ?? 0) - current);
      }
      for (const source of [...anchorSources].reverse()) {
        const load = loads.get(source.child) ?? 0;
        componentCurrents[source.id] -= source.sign * load;
        componentPowers[source.id] = source.voltageV * componentCurrents[source.id];
        loads.set(source.parent, (loads.get(source.parent) ?? 0) + load);
      }
      return { ...result, nodeVoltages, componentCurrents, componentPowers };
    },
  };
}

/** A settled, unchanged autonomous circuit with only fixed-voltage capacitors
 * remains at its operating point. No alternate branch or earlier state is cached. */
export function canRetainOperatingPoint(circuit: Circuit, fixed: Map<string, number>, capacitorVoltages: Record<string, number>): boolean {
  return circuit.components.every((part) => part.kind !== 'signal-source' && part.kind !== 'subcircuit'
    && (part.kind !== 'capacitor' || (fixed.has(part.positiveNodeId) && fixed.has(part.negativeNodeId)
      && Math.abs((capacitorVoltages[part.id] ?? 0) - (fixed.get(part.positiveNodeId)! - fixed.get(part.negativeNodeId)!)) < 1e-9)));
}
