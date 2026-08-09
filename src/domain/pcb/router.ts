import { padPosition } from './geometry';
import type { PcbNet, PcbPointMm, PcbProject, PcbTrace } from './types';

export interface RouteDiagnostic { netId: string; message: string }
export interface RouteResult { pcb: PcbProject; diagnostics: RouteDiagnostic[] }

const POSITION_TOLERANCE_MM = 1e-6;

function samePoint(left: PcbPointMm, right: PcbPointMm): boolean {
  return Math.abs(left.xMm - right.xMm) <= POSITION_TOLERANCE_MM
    && Math.abs(left.yMm - right.yMm) <= POSITION_TOLERANCE_MM;
}

function netPadPositions(pcb: PcbProject, net: PcbNet): PcbPointMm[] {
  return net.pads.flatMap((ref) => {
    const component = pcb.components.find((candidate) => candidate.id === ref.componentId);
    const position = component ? padPosition(component, ref.padNumber) : undefined;
    return position ? [position] : [];
  });
}

function endpointPadIndex(positions: readonly PcbPointMm[], point: PcbPointMm): number {
  return positions.findIndex((candidate) => samePoint(candidate, point));
}

function connectedPadRoots(pcb: PcbProject, net: PcbNet): {
  positions: PcbPointMm[];
  find: (index: number) => number;
  union: (left: number, right: number) => void;
} {
  const positions = netPadPositions(pcb, net);
  const parents = positions.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parents[root] !== root) root = parents[root];
    while (parents[index] !== index) {
      const parent = parents[index];
      parents[index] = root;
      index = parent;
    }
    return root;
  };
  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
  };
  const connectEndpoints = (start: PcbPointMm, end: PcbPointMm) => {
    const startIndex = endpointPadIndex(positions, start);
    const endIndex = endpointPadIndex(positions, end);
    if (startIndex >= 0 && endIndex >= 0) union(startIndex, endIndex);
  };
  for (const trace of pcb.traces.filter((candidate) => candidate.netId === net.id)) {
    const start = trace.pointsMm[0];
    const end = trace.pointsMm.at(-1);
    if (start && end) connectEndpoints(start, end);
  }
  for (const jumper of pcb.jumpers.filter((candidate) => candidate.netId === net.id)) {
    connectEndpoints(jumper.startMm, jumper.endMm);
  }
  return { positions, find, union };
}

export function routedConnectionsForNet(pcb: PcbProject, net: PcbNet): number {
  const { positions, find } = connectedPadRoots(pcb, net);
  const connectedGroups = new Set(positions.map((_, index) => find(index))).size;
  return Math.max(0, positions.length - connectedGroups);
}

export function isNetFullyRouted(pcb: PcbProject, net: PcbNet): boolean {
  return routedConnectionsForNet(pcb, net) >= Math.max(0, net.pads.length - 1);
}

function validAutoTrace(pcb: PcbProject, trace: PcbTrace): boolean {
  if (trace.ownership !== 'auto') return true;
  const net = pcb.nets.find((candidate) => candidate.id === trace.netId);
  const start = trace.pointsMm[0];
  const end = trace.pointsMm.at(-1);
  if (!net || !start || !end) return false;
  const positions = netPadPositions(pcb, net);
  return endpointPadIndex(positions, start) >= 0 && endpointPadIndex(positions, end) >= 0;
}

function uniqueAutoTraceId(traces: readonly PcbTrace[], netId: string, connectionIndex: number): string {
  const base = `auto-${netId}-${connectionIndex}`;
  if (!traces.some((trace) => trace.id === base)) return base;
  let suffix = 2;
  while (traces.some((trace) => trace.id === `${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export function routeRemainingConnections(pcb: PcbProject): RouteResult {
  const traces = pcb.traces.filter((trace) => validAutoTrace(pcb, trace));
  const diagnostics: RouteDiagnostic[] = [];
  for (const net of pcb.nets) {
    const { positions, find, union } = connectedPadRoots({ ...pcb, traces }, net);
    if (positions.length < 2) { diagnostics.push({ netId: net.id, message: `${net.name} has fewer than two resolved pads.` }); continue; }
    for (let index = 1; index < positions.length; index += 1) {
      if (find(index - 1) === find(index)) continue;
      const start = positions[index - 1]; const end = positions[index];
      const trace: PcbTrace = { id: uniqueAutoTraceId(traces, net.id, index), netId: net.id, widthMm: /GND|VCC|\+\dV/i.test(net.name) ? 0.8 : 0.4, layer: 'B.Cu', ownership: 'auto', pointsMm: [start, { xMm: end.xMm, yMm: start.yMm }, end] };
      traces.push(trace);
      union(index - 1, index);
    }
  }
  return { pcb: { ...pcb, traces }, diagnostics };
}

export function clearAutoRoutes(pcb: PcbProject): PcbProject {
  return { ...pcb, traces: pcb.traces.filter((trace) => trace.ownership !== 'auto') };
}

