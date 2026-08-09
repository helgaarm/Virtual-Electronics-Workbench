import { PCB_FOOTPRINTS } from './footprints';
import { componentCourtyard, padPosition, pointToSegmentDistanceMm, polylineSegments, rectsOverlap, segmentToSegmentDistanceMm } from './geometry';
import { resolvedPads } from './connectivity';
import { routedConnectionsForNet } from './router';
import type { PcbPointMm, PcbProject } from './types';

export type PcbDrcSeverity = 'error' | 'warning' | 'information';
export interface PcbDrcIssue { id: string; severity: PcbDrcSeverity; code: string; message: string; locationMm?: PcbPointMm }
export interface PcbDrcResult { issues: PcbDrcIssue[]; routedConnections: number; totalConnections: number; status: 'not-ready' | 'electrically-complete' | 'manufacturing-checks-passed' }

export function runPcbDrc(pcb: PcbProject): PcbDrcResult {
  const issues: PcbDrcIssue[] = [];
  if (pcb.board.widthMm <= 0 || pcb.board.heightMm <= 0) issues.push({ id: 'board-size', severity: 'error', code: 'INVALID_BOARD', message: 'Board outline must have positive dimensions.' });
  for (const component of pcb.components) {
    const footprint = PCB_FOOTPRINTS[component.footprintId];
    if (!footprint) { issues.push({ id: `fp-${component.id}`, severity: 'error', code: 'MISSING_FOOTPRINT', message: `${component.reference} has no supported footprint.` }); continue; }
    if (!footprint.verified) issues.push({ id: `unverified-${component.id}`, severity: 'error', code: 'UNVERIFIED_FOOTPRINT', message: `${component.reference} footprint requires verification.` });
    for (const pad of footprint.pads) {
      const point = padPosition(component, pad.number)!;
      if (pad.drillDiameterMm < pcb.rules.minimumDrillMm) issues.push({ id: `drill-${component.id}-${pad.number}`, severity: 'error', code: 'MINIMUM_DRILL', message: `${component.reference} pad ${pad.number} drill is too small.`, locationMm: point });
      if (point.xMm < pcb.rules.copperToEdgeMm || point.yMm < pcb.rules.copperToEdgeMm || point.xMm > pcb.board.widthMm - pcb.rules.copperToEdgeMm || point.yMm > pcb.board.heightMm - pcb.rules.copperToEdgeMm) issues.push({ id: `edge-${component.id}-${pad.number}`, severity: 'error', code: 'PAD_OUTSIDE_BOARD', message: `${component.reference} pad ${pad.number} is outside the copper edge clearance.`, locationMm: point });
    }
  }
  for (let left = 0; left < pcb.components.length; left += 1) for (let right = left + 1; right < pcb.components.length; right += 1) {
    const a = componentCourtyard(pcb.components[left]); const b = componentCourtyard(pcb.components[right]);
    if (a && b && rectsOverlap(a, b)) issues.push({ id: `courtyard-${pcb.components[left].id}-${pcb.components[right].id}`, severity: 'error', code: 'FOOTPRINT_OVERLAP', message: `${pcb.components[left].reference} and ${pcb.components[right].reference} courtyards overlap.` });
  }
  for (const trace of pcb.traces) {
    if (trace.layer !== 'B.Cu') issues.push({ id: `layer-${trace.id}`, severity: 'error', code: 'INVALID_COPPER_LAYER', message: 'Single-sided boards may only contain B.Cu traces.' });
    if (trace.widthMm < pcb.rules.minimumTrackWidthMm) issues.push({ id: `width-${trace.id}`, severity: 'error', code: 'MINIMUM_TRACK_WIDTH', message: `${trace.id} is narrower than ${pcb.rules.minimumTrackWidthMm} mm.` });
    if (trace.pointsMm.length < 2) issues.push({ id: `geometry-${trace.id}`, severity: 'error', code: 'INVALID_TRACE', message: `${trace.id} has no usable copper segments.` });
    if (trace.pointsMm.some((point) => point.xMm < pcb.rules.copperToEdgeMm + trace.widthMm / 2 || point.yMm < pcb.rules.copperToEdgeMm + trace.widthMm / 2 || point.xMm > pcb.board.widthMm - pcb.rules.copperToEdgeMm - trace.widthMm / 2 || point.yMm > pcb.board.heightMm - pcb.rules.copperToEdgeMm - trace.widthMm / 2)) issues.push({ id: `trace-edge-${trace.id}`, severity: 'error', code: 'TRACE_EDGE_CLEARANCE', message: `${trace.id} is too close to the board edge.` });
  }
  const pads = resolvedPads(pcb);
  for (let left = 0; left < pcb.traces.length; left += 1) for (let right = left + 1; right < pcb.traces.length; right += 1) {
    const a = pcb.traces[left]; const b = pcb.traces[right]; if (a.netId === b.netId || a.layer !== b.layer) continue;
    const required = (a.widthMm + b.widthMm) / 2 + pcb.rules.copperClearanceMm;
    if (polylineSegments(a.pointsMm).some((sa) => polylineSegments(b.pointsMm).some((sb) => segmentToSegmentDistanceMm(sa, sb) < required))) issues.push({ id: `trace-clearance-${a.id}-${b.id}`, severity: 'error', code: 'TRACK_TO_TRACK_CLEARANCE', message: `${a.id} and ${b.id} from different nets touch or violate copper clearance.` });
  }
  for (const trace of pcb.traces) for (const pad of pads) {
    if (trace.netId === pad.netId) continue;
    if (polylineSegments(trace.pointsMm).some((segment) => pointToSegmentDistanceMm(pad.positionMm, segment) < pad.radiusMm + trace.widthMm / 2 + pcb.rules.copperClearanceMm)) issues.push({ id: `trace-pad-${trace.id}-${pad.key}`, severity: 'error', code: 'TRACK_TO_PAD_CLEARANCE', message: `${trace.id} touches or passes too close to foreign-net pad ${pad.key}.`, locationMm: pad.positionMm });
  }
  for (let left = 0; left < pads.length; left += 1) for (let right = left + 1; right < pads.length; right += 1) if (pads[left].netId !== pads[right].netId && Math.hypot(pads[left].positionMm.xMm - pads[right].positionMm.xMm, pads[left].positionMm.yMm - pads[right].positionMm.yMm) < pads[left].radiusMm + pads[right].radiusMm + pcb.rules.copperClearanceMm) issues.push({ id: `pad-clearance-${pads[left].key}-${pads[right].key}`, severity: 'error', code: 'PAD_TO_PAD_CLEARANCE', message: `Pads ${pads[left].key} and ${pads[right].key} violate clearance.` });
  for (const trace of pcb.traces) {
    if (!pcb.nets.some((net) => net.id === trace.netId)) issues.push({ id: `unknown-net-${trace.id}`, severity: 'error', code: 'UNKNOWN_TRACE_NET', message: `${trace.id} references a missing net.` });
    if (trace.ownership === 'auto') {
      const netPads = pads.filter((pad) => pad.netId === trace.netId); const endpoints = [trace.pointsMm[0], trace.pointsMm.at(-1)].filter((point): point is PcbPointMm => Boolean(point));
      if (endpoints.some((point) => !netPads.some((pad) => Math.hypot(point.xMm - pad.positionMm.xMm, point.yMm - pad.positionMm.yMm) <= pad.radiusMm))) issues.push({ id: `stale-${trace.id}`, severity: 'error', code: 'STALE_TRACE_ENDPOINT', message: `${trace.id} no longer terminates on its assigned pads.` });
    }
  }
  const totalConnections = pcb.nets.reduce((sum, net) => sum + Math.max(0, net.pads.length - 1), 0);
  const routedConnections = pcb.nets.reduce(
    (sum, net) => sum + routedConnectionsForNet(pcb, net),
    0,
  );
  if (routedConnections < totalConnections) issues.push({ id: 'unrouted', severity: 'error', code: 'UNROUTED_CONNECTIONS', message: `${totalConnections - routedConnections} required connection(s) remain unrouted.` });
  const blocking = issues.some((issue) => issue.severity === 'error');
  return { issues, routedConnections, totalConnections, status: blocking ? 'not-ready' : routedConnections === totalConnections ? 'manufacturing-checks-passed' : 'electrically-complete' };
}
