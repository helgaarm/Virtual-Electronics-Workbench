import { PCB_FOOTPRINTS } from './footprints';
import { padPosition } from './geometry';
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
  for (const trace of pcb.traces) {
    if (trace.layer !== 'B.Cu') issues.push({ id: `layer-${trace.id}`, severity: 'error', code: 'INVALID_COPPER_LAYER', message: 'Single-sided boards may only contain B.Cu traces.' });
    if (trace.widthMm < pcb.rules.minimumTrackWidthMm) issues.push({ id: `width-${trace.id}`, severity: 'error', code: 'MINIMUM_TRACK_WIDTH', message: `${trace.id} is narrower than ${pcb.rules.minimumTrackWidthMm} mm.` });
    if (trace.pointsMm.some((point) => point.xMm < pcb.rules.copperToEdgeMm || point.yMm < pcb.rules.copperToEdgeMm || point.xMm > pcb.board.widthMm - pcb.rules.copperToEdgeMm || point.yMm > pcb.board.heightMm - pcb.rules.copperToEdgeMm)) issues.push({ id: `trace-edge-${trace.id}`, severity: 'error', code: 'TRACE_EDGE_CLEARANCE', message: `${trace.id} is too close to the board edge.` });
  }
  const totalConnections = pcb.nets.reduce((sum, net) => sum + Math.max(0, net.pads.length - 1), 0);
  const routedConnections = Math.min(totalConnections, pcb.traces.length + pcb.jumpers.length);
  if (routedConnections < totalConnections) issues.push({ id: 'unrouted', severity: 'error', code: 'UNROUTED_CONNECTIONS', message: `${totalConnections - routedConnections} required connection(s) remain unrouted.` });
  const blocking = issues.some((issue) => issue.severity === 'error');
  return { issues, routedConnections, totalConnections, status: blocking ? 'not-ready' : routedConnections === totalConnections ? 'manufacturing-checks-passed' : 'electrically-complete' };
}
