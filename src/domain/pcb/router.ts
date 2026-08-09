import { padPosition } from './geometry';
import type { PcbProject, PcbTrace } from './types';

export interface RouteDiagnostic { netId: string; message: string }
export interface RouteResult { pcb: PcbProject; diagnostics: RouteDiagnostic[] }

export function routeRemainingConnections(pcb: PcbProject): RouteResult {
  const traces = [...pcb.traces];
  const diagnostics: RouteDiagnostic[] = [];
  for (const net of pcb.nets) {
    if (traces.some((trace) => trace.netId === net.id)) continue;
    const positions = net.pads.map((ref) => {
      const component = pcb.components.find((candidate) => candidate.id === ref.componentId);
      return component ? padPosition(component, ref.padNumber) : undefined;
    }).filter((point) => point !== undefined);
    if (positions.length < 2) { diagnostics.push({ netId: net.id, message: `${net.name} has fewer than two resolved pads.` }); continue; }
    for (let index = 1; index < positions.length; index += 1) {
      const start = positions[index - 1]; const end = positions[index];
      const trace: PcbTrace = { id: `auto-${net.id}-${index}`, netId: net.id, widthMm: /GND|VCC|\+\dV/i.test(net.name) ? 0.8 : 0.4, layer: 'B.Cu', ownership: 'auto', pointsMm: [start, { xMm: end.xMm, yMm: start.yMm }, end] };
      traces.push(trace);
    }
  }
  return { pcb: { ...pcb, traces }, diagnostics };
}

export function clearAutoRoutes(pcb: PcbProject): PcbProject {
  return { ...pcb, traces: pcb.traces.filter((trace) => trace.ownership !== 'auto') };
}

