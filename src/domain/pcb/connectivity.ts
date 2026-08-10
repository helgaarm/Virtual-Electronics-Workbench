import { PCB_FOOTPRINTS } from './footprints';
import { distanceMm, padPosition, pointToSegmentDistanceMm, polylineSegments, segmentToSegmentDistanceMm } from './geometry';
import type { PcbCopperLayer, PcbNet, PcbPointMm, PcbProject } from './types';

export interface ResolvedPad { key: string; netId: string; positionMm: PcbPointMm; radiusMm: number; plated: boolean }

export function resolvedPads(pcb: PcbProject): ResolvedPad[] {
  const padNets = new Map(pcb.nets.flatMap((net) => net.pads.map((pad) => [`${pad.componentId}:${pad.padNumber}`, net.id] as const)));
  return pcb.components.flatMap((component) => {
    const footprint = PCB_FOOTPRINTS[component.footprintId];
    if (!footprint) return [];
    return footprint.pads.flatMap((pad) => {
      const positionMm = padPosition(component, pad.number); const netId = padNets.get(`${component.id}:${pad.number}`);
      return positionMm && netId ? [{ key: `${component.id}:${pad.number}`, netId, positionMm, radiusMm: Math.max(pad.sizeMm.widthMm, pad.sizeMm.heightMm) / 2, plated: pad.plated }] : [];
    });
  });
}

type CopperNode = { kind: 'pad'; index: number; layer: PcbCopperLayer } | { kind: 'trace'; index: number } | { kind: 'via'; index: number; layer: PcbCopperLayer } | { kind: 'jumper'; index: number };

/** Builds connectivity from actual copper. XY coincidence on opposite layers is deliberately not a connection. */
export function copperConnectivity(pcb: PcbProject): { pads: ResolvedPad[]; padRoot: (padIndex: number) => number } {
  const pads = resolvedPads(pcb); const layers: PcbCopperLayer[] = ['F.Cu', 'B.Cu']; const nodes: CopperNode[] = [];
  for (let index = 0; index < pads.length; index += 1) for (const layer of layers) nodes.push({ kind: 'pad', index, layer });
  pcb.traces.forEach((_, index) => nodes.push({ kind: 'trace', index }));
  pcb.vias.forEach((_, index) => layers.forEach((layer) => nodes.push({ kind: 'via', index, layer })));
  pcb.jumpers.forEach((_, index) => nodes.push({ kind: 'jumper', index }));
  const parent = nodes.map((_, index) => index); const find = (value: number): number => parent[value] === value ? value : (parent[value] = find(parent[value]));
  const union = (a: number, b: number) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent[rb] = ra; };
  const padNode = (index: number, layer: PcbCopperLayer) => index * 2 + (layer === 'B.Cu' ? 1 : 0);
  const traceOffset = pads.length * 2; const viaOffset = traceOffset + pcb.traces.length; const jumperOffset = viaOffset + pcb.vias.length * 2;
  pads.forEach((pad, index) => { if (pad.plated) union(padNode(index, 'F.Cu'), padNode(index, 'B.Cu')); });
  pcb.vias.forEach((_, index) => union(viaOffset + index * 2, viaOffset + index * 2 + 1));
  pcb.traces.forEach((trace, traceIndex) => {
    const segments = polylineSegments(trace.pointsMm); const node = traceOffset + traceIndex;
    pads.forEach((pad, padIndex) => { if (segments.some((segment) => pointToSegmentDistanceMm(pad.positionMm, segment) <= pad.radiusMm + trace.widthMm / 2)) union(node, padNode(padIndex, trace.layer)); });
    pcb.vias.forEach((via, viaIndex) => { if (segments.some((segment) => pointToSegmentDistanceMm(via.positionMm, segment) <= via.copperDiameterMm / 2 + trace.widthMm / 2)) union(node, viaOffset + viaIndex * 2 + (trace.layer === 'B.Cu' ? 1 : 0)); });
    pcb.jumpers.forEach((jumper, jumperIndex) => { if ([jumper.startMm, jumper.endMm].some((point) => segments.some((segment) => pointToSegmentDistanceMm(point, segment) <= jumper.copperDiameterMm / 2 + trace.widthMm / 2))) union(node, jumperOffset + jumperIndex); });
  });
  for (let a = 0; a < pcb.traces.length; a += 1) for (let b = a + 1; b < pcb.traces.length; b += 1) if (pcb.traces[a].layer === pcb.traces[b].layer && polylineSegments(pcb.traces[a].pointsMm).some((sa) => polylineSegments(pcb.traces[b].pointsMm).some((sb) => segmentToSegmentDistanceMm(sa, sb) <= (pcb.traces[a].widthMm + pcb.traces[b].widthMm) / 2))) union(traceOffset + a, traceOffset + b);
  pads.forEach((a, ai) => pads.slice(ai + 1).forEach((b, offset) => { if (distanceMm(a.positionMm, b.positionMm) <= a.radiusMm + b.radiusMm) { const bi = ai + 1 + offset; layers.forEach((layer) => union(padNode(ai, layer), padNode(bi, layer))); } }));
  pcb.jumpers.forEach((jumper, jumperIndex) => pads.forEach((pad, padIndex) => { if ([jumper.startMm, jumper.endMm].some((point) => distanceMm(point, pad.positionMm) <= pad.radiusMm + jumper.copperDiameterMm / 2)) union(jumperOffset + jumperIndex, padNode(padIndex, 'B.Cu')); }));
  return { pads, padRoot: (padIndex) => find(padNode(padIndex, 'B.Cu')) };
}

export function connectedPadCount(pcb: PcbProject, net: PcbNet): number {
  return connectedPadCountsByNet(pcb).get(net.id) ?? 0;
}

/** Computes every net's connected-pad count from one copper graph. */
export function connectedPadCountsByNet(pcb: PcbProject): Map<string, number> {
  const graph = copperConnectivity(pcb);
  const indicesByNet = new Map<string, number[]>();
  graph.pads.forEach((pad, index) => {
    const indices = indicesByNet.get(pad.netId) ?? [];
    indices.push(index);
    indicesByNet.set(pad.netId, indices);
  });
  return new Map(pcb.nets.map((net) => {
    const indices = indicesByNet.get(net.id) ?? [];
    return [net.id, Math.max(0, indices.length - new Set(indices.map(graph.padRoot)).size)];
  }));
}
