import { PCB_FOOTPRINTS } from './footprints';
import { distanceMm, padPosition, pointToSegmentDistanceMm, polylineSegments, segmentToSegmentDistanceMm } from './geometry';
import type { PcbNet, PcbPointMm, PcbProject } from './types';

export interface ResolvedPad { key: string; netId: string; positionMm: PcbPointMm; radiusMm: number }

export function resolvedPads(pcb: PcbProject): ResolvedPad[] {
  const padNets = new Map(pcb.nets.flatMap((net) => net.pads.map((pad) => [`${pad.componentId}:${pad.padNumber}`, net.id] as const)));
  return pcb.components.flatMap((component) => {
    const footprint = PCB_FOOTPRINTS[component.footprintId];
    if (!footprint) return [];
    return footprint.pads.flatMap((pad) => {
      const positionMm = padPosition(component, pad.number); const netId = padNets.get(`${component.id}:${pad.number}`);
      return positionMm && netId ? [{ key: `${component.id}:${pad.number}`, netId, positionMm, radiusMm: Math.max(pad.sizeMm.widthMm, pad.sizeMm.heightMm) / 2 }] : [];
    });
  });
}

export function connectedPadCount(pcb: PcbProject, net: PcbNet): number {
  const pads = resolvedPads(pcb).filter((pad) => pad.netId === net.id);
  if (pads.length < 2) return 0;
  const parent = pads.map((_, index) => index); const find = (value: number): number => parent[value] === value ? value : (parent[value] = find(parent[value]));
  const union = (a: number, b: number) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent[rb] = ra; };
  const traces = pcb.traces.filter((trace) => trace.netId === net.id);
  for (let a = 0; a < pads.length; a += 1) for (let b = a + 1; b < pads.length; b += 1) {
    if (distanceMm(pads[a].positionMm, pads[b].positionMm) <= pads[a].radiusMm + pads[b].radiusMm) union(a, b);
  }
  const traceParent = traces.map((_, index) => index); const traceFind = (value: number): number => traceParent[value] === value ? value : (traceParent[value] = traceFind(traceParent[value]));
  for (let a = 0; a < traces.length; a += 1) for (let b = a + 1; b < traces.length; b += 1) if (polylineSegments(traces[a].pointsMm).some((sa) => polylineSegments(traces[b].pointsMm).some((sb) => segmentToSegmentDistanceMm(sa, sb) <= (traces[a].widthMm + traces[b].widthMm) / 2))) traceParent[traceFind(b)] = traceFind(a);
  for (let p = 0; p < pads.length; p += 1) {
    const touched = traces.map((trace, index) => ({ index, touches: polylineSegments(trace.pointsMm).some((segment) => pointToSegmentDistanceMm(pads[p].positionMm, segment) <= pads[p].radiusMm + trace.widthMm / 2) })).filter((entry) => entry.touches).map((entry) => entry.index);
    for (const otherPad of pads.slice(p + 1).map((_, offset) => p + 1 + offset)) if (touched.some((traceIndex) => polylineSegments(traces[traceIndex].pointsMm).some((segment) => pointToSegmentDistanceMm(pads[otherPad].positionMm, segment) <= pads[otherPad].radiusMm + traces[traceIndex].widthMm / 2))) union(p, otherPad);
    for (let a = 0; a < touched.length; a += 1) for (let b = a + 1; b < touched.length; b += 1) traceParent[traceFind(touched[b])] = traceFind(touched[a]);
  }
  for (let a = 0; a < pads.length; a += 1) for (let b = a + 1; b < pads.length; b += 1) {
    const ta = traces.findIndex((trace) => polylineSegments(trace.pointsMm).some((segment) => pointToSegmentDistanceMm(pads[a].positionMm, segment) <= pads[a].radiusMm + trace.widthMm / 2));
    const tb = traces.findIndex((trace) => polylineSegments(trace.pointsMm).some((segment) => pointToSegmentDistanceMm(pads[b].positionMm, segment) <= pads[b].radiusMm + trace.widthMm / 2));
    if (ta >= 0 && tb >= 0 && traceFind(ta) === traceFind(tb)) union(a, b);
  }
  return pads.length - new Set(pads.map((_, index) => find(index))).size;
}
