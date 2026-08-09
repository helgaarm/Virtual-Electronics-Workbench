import { resolvedPads, connectedPadCount } from './connectivity';
import { pointToSegmentDistanceMm, polylineSegments } from './geometry';
import type { PcbNet, PcbPointMm, PcbProject, PcbTrace } from './types';

export interface RouteDiagnostic { netId: string; message: string }
export interface RouteResult { pcb: PcbProject; diagnostics: RouteDiagnostic[] }
const GRID_MM = 0.5;

export function routedConnectionsForNet(pcb: PcbProject, net: PcbNet): number { return connectedPadCount(pcb, net); }
export function isNetFullyRouted(pcb: PcbProject, net: PcbNet): boolean { return connectedPadCount(pcb, net) >= Math.max(0, net.pads.length - 1); }

function nearestTreePair(pcb: PcbProject, net: PcbNet): [PcbPointMm, PcbPointMm] | undefined {
  const pads = resolvedPads(pcb).filter((pad) => pad.netId === net.id);
  const touched = (point: PcbPointMm) => pcb.traces.filter((trace) => trace.netId === net.id).some((trace) => polylineSegments(trace.pointsMm).some((segment) => pointToSegmentDistanceMm(point, segment) <= trace.widthMm / 2 + 0.91));
  const tree = pads.filter((pad) => touched(pad.positionMm)); const outside = pads.filter((pad) => !touched(pad.positionMm));
  const starts = tree.length ? tree : pads.slice(0, 1); const ends = tree.length ? outside : pads.slice(1);
  return starts.flatMap((a) => ends.map((b) => [a.positionMm, b.positionMm] as [PcbPointMm, PcbPointMm]))
    .sort((a, b) => Math.abs(a[0].xMm - a[1].xMm) + Math.abs(a[0].yMm - a[1].yMm) - Math.abs(b[0].xMm - b[1].xMm) - Math.abs(b[0].yMm - b[1].yMm))[0];
}

function findPath(pcb: PcbProject, netId: string, start: PcbPointMm, end: PcbPointMm, widthMm: number, reverse = false): PcbPointMm[] | undefined {
  const clearance = pcb.rules.copperClearanceMm + widthMm / 2; const pads = resolvedPads(pcb); const foreignPads = pads.filter((pad) => pad.netId !== netId);
  const foreignSegments = pcb.traces.filter((trace) => trace.netId !== netId).flatMap((trace) => polylineSegments(trace.pointsMm).map((segment) => ({ segment, radius: trace.widthMm / 2 })));
  const key = (x: number, y: number) => `${x},${y}`; const fromKey = (value: string): [number, number] => value.split(',').map(Number) as [number, number];
  const sx = Math.round(start.xMm / GRID_MM); const sy = Math.round(start.yMm / GRID_MM); const ex = Math.round(end.xMm / GRID_MM); const ey = Math.round(end.yMm / GRID_MM);
  const blocked = (x: number, y: number): boolean => {
    const p = { xMm: x * GRID_MM, yMm: y * GRID_MM };
    if (p.xMm < pcb.rules.copperToEdgeMm + widthMm / 2 || p.yMm < pcb.rules.copperToEdgeMm + widthMm / 2 || p.xMm > pcb.board.widthMm - pcb.rules.copperToEdgeMm - widthMm / 2 || p.yMm > pcb.board.heightMm - pcb.rules.copperToEdgeMm - widthMm / 2) return true;
    if ((x === sx && y === sy) || (x === ex && y === ey)) return false;
    return foreignPads.some((pad) => Math.hypot(p.xMm - pad.positionMm.xMm, p.yMm - pad.positionMm.yMm) < pad.radiusMm + clearance)
      || foreignSegments.some((item) => pointToSegmentDistanceMm(p, item.segment) < item.radius + clearance);
  };
  const open: Array<{ x: number; y: number; g: number; f: number }> = [{ x: sx, y: sy, g: 0, f: 0 }]; const best = new Map([[key(sx, sy), 0]]); const previous = new Map<string, string>();
  const dirs = reverse ? [[0,-1],[-1,0],[0,1],[1,0]] : [[1,0],[0,1],[-1,0],[0,-1]];
  while (open.length) {
    open.sort((a, b) => a.f - b.f || a.g - b.g || a.y - b.y || a.x - b.x); const current = open.shift()!; const currentKey = key(current.x, current.y);
    if (current.x === ex && current.y === ey) {
      const grid: PcbPointMm[] = []; let cursor = currentKey; while (cursor) { const [x, y] = fromKey(cursor); grid.push({ xMm: x * GRID_MM, yMm: y * GRID_MM }); cursor = previous.get(cursor)!; } grid.reverse();
      const points = [start, ...grid.slice(1, -1), end].filter((point, index, all) => index === 0 || point.xMm !== all[index - 1].xMm || point.yMm !== all[index - 1].yMm);
      return points.filter((point, index, all) => index === 0 || index === all.length - 1 || !((all[index - 1].xMm === point.xMm && point.xMm === all[index + 1].xMm) || (all[index - 1].yMm === point.yMm && point.yMm === all[index + 1].yMm)));
    }
    for (const [dx, dy] of dirs) { const x = current.x + dx; const y = current.y + dy; if (blocked(x, y)) continue; const nextKey = key(x, y); const g = current.g + 1; if (g >= (best.get(nextKey) ?? Infinity)) continue; best.set(nextKey, g); previous.set(nextKey, currentKey); open.push({ x, y, g, f: g + Math.abs(x - ex) + Math.abs(y - ey) }); }
  }
  return undefined;
}

export function routeRemainingConnections(pcb: PcbProject): RouteResult {
  let working: PcbProject = { ...pcb, traces: pcb.traces.filter((trace) => trace.ownership !== 'auto') }; const diagnostics: RouteDiagnostic[] = [];
  const nets = [...working.nets].filter((net) => net.pads.length > 1).sort((a, b) => b.pads.length - a.pads.length || a.id.localeCompare(b.id));
  for (const net of nets) {
    let connection = 0;
    while (!isNetFullyRouted(working, net) && connection < net.pads.length - 1) {
      const pair = nearestTreePair(working, net); if (!pair) break; const widthMm = /GND|VCC|\+\dV/i.test(net.name) ? 0.8 : 0.4;
      const pointsMm = findPath(working, net.id, pair[0], pair[1], widthMm, connection % 2 === 1);
      if (!pointsMm) { diagnostics.push({ netId: net.id, message: `${net.name}: no clearance-safe bottom-copper path; a jumper or placement change is required.` }); break; }
      const trace: PcbTrace = { id: `auto-${net.id}-${connection + 1}`, netId: net.id, widthMm, layer: 'B.Cu', ownership: 'auto', pointsMm };
      working = { ...working, traces: [...working.traces, trace] }; connection += 1;
    }
  }
  return { pcb: working, diagnostics };
}

export function clearAutoRoutes(pcb: PcbProject): PcbProject { return { ...pcb, traces: pcb.traces.filter((trace) => trace.ownership !== 'auto') }; }
