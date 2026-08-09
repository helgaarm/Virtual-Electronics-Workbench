import type {
  Circuit,
  ElectricalComponent,
  ElectricalSubcircuit,
} from '../domain/circuit/types';
import { electricalComponentNodeIds } from '../domain/circuit/types';

const flattenedCircuitCache = new WeakMap<Circuit, Circuit>();

/** `@` is deliberately outside the persisted component-ID alphabet, keeping
 * generated internal identifiers collision-free from visible project parts. */
export function subcircuitScopedId(instanceId: string, localId: string): string {
  return `@sub/${encodeURIComponent(instanceId)}/${encodeURIComponent(localId)}`;
}

function mapNode(component: ElectricalSubcircuit, nodeId: string): string {
  return component.externalNodes[nodeId] ?? subcircuitScopedId(component.id, nodeId);
}

function mapPrimitive(
  instance: ElectricalSubcircuit,
  primitive: Exclude<ElectricalComponent, ElectricalSubcircuit>,
): Exclude<ElectricalComponent, ElectricalSubcircuit> {
  const id = subcircuitScopedId(instance.id, primitive.id);
  if (primitive.kind === 'bjt') {
    return {
      ...primitive,
      id,
      collectorNodeId: mapNode(instance, primitive.collectorNodeId),
      baseNodeId: mapNode(instance, primitive.baseNodeId),
      emitterNodeId: mapNode(instance, primitive.emitterNodeId),
    };
  }
  if (primitive.kind === 'smooth-transconductance') {
    return {
      ...primitive,
      id,
      outputPositiveNodeId: mapNode(instance, primitive.outputPositiveNodeId),
      outputNegativeNodeId: mapNode(instance, primitive.outputNegativeNodeId),
      controlPositiveNodeId: mapNode(instance, primitive.controlPositiveNodeId),
      controlNegativeNodeId: mapNode(instance, primitive.controlNegativeNodeId),
    };
  }
  if (primitive.kind === 'smooth-switch') {
    return {
      ...primitive,
      id,
      positiveNodeId: mapNode(instance, primitive.positiveNodeId),
      negativeNodeId: mapNode(instance, primitive.negativeNodeId),
      controlPositiveNodeId: mapNode(instance, primitive.controlPositiveNodeId),
      controlNegativeNodeId: mapNode(instance, primitive.controlNegativeNodeId),
    };
  }
  return {
    ...primitive,
    id,
    positiveNodeId: mapNode(instance, primitive.positiveNodeId),
    negativeNodeId: mapNode(instance, primitive.negativeNodeId),
  };
}

function validateInstance(instance: ElectricalSubcircuit): void {
  const definition = instance.definition;
  const declaredNodeIds = [...definition.externalNodeIds, ...definition.internalNodeIds];
  if (new Set(declaredNodeIds).size !== declaredNodeIds.length) {
    throw new Error(`Subcircuit ${instance.id} declares duplicate node IDs.`);
  }
  for (const externalNodeId of definition.externalNodeIds) {
    if (!Object.hasOwn(instance.externalNodes, externalNodeId)) {
      throw new Error(`Subcircuit ${instance.id} is missing external pin ${externalNodeId}.`);
    }
  }
  const componentIds = definition.components.map((component) => component.id);
  if (new Set(componentIds).size !== componentIds.length) {
    throw new Error(`Subcircuit ${instance.id} declares duplicate component IDs.`);
  }
  const declared = new Set(declaredNodeIds);
  for (const component of definition.components) {
    const nodeIds = component.kind === 'subcircuit'
      ? Object.values(component.externalNodes)
      : electricalComponentNodeIds(component);
    const unknownNodeId = nodeIds.find((nodeId) => !declared.has(nodeId));
    if (unknownNodeId) {
      throw new Error(`Subcircuit ${instance.id} component ${component.id} uses undeclared node ${unknownNodeId}.`);
    }
  }
}

function flattenInstance(
  instance: ElectricalSubcircuit,
  ancestorDefinitions: ReadonlySet<ElectricalSubcircuit['definition']> = new Set(),
): ElectricalComponent[] {
  if (ancestorDefinitions.has(instance.definition)) {
    throw new Error(`Subcircuit ${instance.id} contains a cyclic definition.`);
  }
  validateInstance(instance);
  const descendants = new Set(ancestorDefinitions).add(instance.definition);
  return instance.definition.components.flatMap((component) => {
    if (component.kind !== 'subcircuit') return [mapPrimitive(instance, component)];
    const nested: ElectricalSubcircuit = {
      ...component,
      id: subcircuitScopedId(instance.id, component.id),
      externalNodes: Object.fromEntries(
        Object.entries(component.externalNodes).map(([localPin, parentNode]) => [
          localPin,
          mapNode(instance, parentNode),
        ]),
      ),
    };
    return flattenInstance(nested, descendants);
  });
}

/** Expands visible subcircuit instances into ordinary solver primitives. */
export function flattenCircuit(circuit: Circuit): Circuit {
  const cached = flattenedCircuitCache.get(circuit);
  if (cached) return cached;
  if (!circuit.components.some((component) => component.kind === 'subcircuit')) {
    flattenedCircuitCache.set(circuit, circuit);
    return circuit;
  }
  const components = circuit.components.flatMap((component) => (
    component.kind === 'subcircuit' ? flattenInstance(component) : [component]
  ));
  const nodeIds = new Set(circuit.nodes.map((node) => node.id));
  for (const component of components) {
    for (const nodeId of electricalComponentNodeIds(component)) nodeIds.add(nodeId);
  }
  const flattened = {
    ...circuit,
    nodes: [...nodeIds].map((id) => ({ id })),
    components,
  };
  flattenedCircuitCache.set(circuit, flattened);
  return flattened;
}
