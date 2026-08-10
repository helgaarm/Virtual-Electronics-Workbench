import { connectedPadCount, copperConnectivity, resolvedPads } from './connectivity';
import { pointToSegmentDistanceMm, polylineSegments } from './geometry';
import type { PcbCopperLayer, PcbNet, PcbPointMm, PcbProject, PcbTrace, PcbVia } from './types';

export interface RouteDiagnostic { netId: string; message: string }
export interface RouteResult { pcb: PcbProject; diagnostics: RouteDiagnostic[] }
const GRID_MM = 0.5; const VIA_DRILL_MM = 0.6; const VIA_COPPER_MM = 1.2; const VIA_COST = 16; const BEND_COST = 0.25;

export function routedConnectionsForNet(pcb: PcbProject, net: PcbNet): number { return connectedPadCount(pcb, net); }
export function isNetFullyRouted(pcb: PcbProject, net: PcbNet): boolean { return connectedPadCount(pcb, net) >= Math.max(0, net.pads.length - 1); }

function nearestDisconnectedPair(pcb: PcbProject, net: PcbNet): readonly [PcbPointMm, PcbPointMm] | undefined {
  const graph = copperConnectivity(pcb); const pads = graph.pads.map((pad, index) => ({ pad, index })).filter(({ pad }) => pad.netId === net.id);
  const pairs = pads.flatMap((a, index) => pads.slice(index + 1).filter((b) => graph.padRoot(a.index) !== graph.padRoot(b.index)).map((b) => [a.pad.positionMm, b.pad.positionMm] as const));
  return pairs.sort((a, b) => Math.abs(a[0].xMm - a[1].xMm) + Math.abs(a[0].yMm - a[1].yMm) - Math.abs(b[0].xMm - b[1].xMm) - Math.abs(b[0].yMm - b[1].yMm) || a[0].xMm - b[0].xMm || a[0].yMm - b[0].yMm)[0];
}

type State = { x: number; y: number; layer: PcbCopperLayer; direction: number; g: number; f: number };
type RoutedPath = Array<{ point: PcbPointMm; layer: PcbCopperLayer }>;

function findPath(pcb: PcbProject, netId: string, start: PcbPointMm, end: PcbPointMm, widthMm: number): RoutedPath | undefined {
  const pads = resolvedPads(pcb); const foreignPads = pads.filter((pad) => pad.netId !== netId);
  const foreignSegments = pcb.traces.filter((trace) => trace.netId !== netId).flatMap((trace) => polylineSegments(trace.pointsMm).map((segment) => ({ segment, radius: trace.widthMm / 2, layer: trace.layer })));
  const foreignVias = pcb.vias.filter((via) => via.netId !== netId);
  const sx = Math.round(start.xMm / GRID_MM); const sy = Math.round(start.yMm / GRID_MM); const ex = Math.round(end.xMm / GRID_MM); const ey = Math.round(end.yMm / GRID_MM);
  const key = (x: number, y: number, layer: PcbCopperLayer, direction: number) => `${x},${y},${layer},${direction}`;
  const blocked = (x: number, y: number, layer: PcbCopperLayer, forVia = false): boolean => {
    const point = { xMm: x * GRID_MM, yMm: y * GRID_MM }; const radius = forVia ? VIA_COPPER_MM / 2 : widthMm / 2;
    if (point.xMm < pcb.rules.copperToEdgeMm + radius || point.yMm < pcb.rules.copperToEdgeMm + radius || point.xMm > pcb.board.widthMm - pcb.rules.copperToEdgeMm - radius || point.yMm > pcb.board.heightMm - pcb.rules.copperToEdgeMm - radius) return true;
    if ((x === sx && y === sy) || (x === ex && y === ey)) return false;
    return foreignPads.some((pad) => Math.hypot(point.xMm - pad.positionMm.xMm, point.yMm - pad.positionMm.yMm) < pad.radiusMm + radius + pcb.rules.copperClearanceMm)
      || foreignSegments.some((item) => (forVia || item.layer === layer) && pointToSegmentDistanceMm(point, item.segment) < item.radius + radius + pcb.rules.copperClearanceMm)
      || foreignVias.some((via) => Math.hypot(point.xMm - via.positionMm.xMm, point.yMm - via.positionMm.yMm) < via.copperDiameterMm / 2 + radius + pcb.rules.copperClearanceMm);
  };
  const layers: PcbCopperLayer[] = pcb.board.layerMode === 'double' ? ['B.Cu', 'F.Cu'] : ['B.Cu'];
  const open: State[] = layers.map((layer) => ({ x: sx, y: sy, layer, direction: -1, g: 0, f: 0 })); const best = new Map<string, number>(); const previous = new Map<string, string>(); const states = new Map<string, State>();
  open.forEach((state) => { const id = key(state.x, state.y, state.layer, state.direction); best.set(id, 0); states.set(id, state); });
  const dirs = [[1,0],[0,1],[-1,0],[0,-1]] as const; let visited = 0;
  while (open.length && visited < 150_000) {
    open.sort((a, b) => a.f - b.f || a.g - b.g || a.layer.localeCompare(b.layer) || a.y - b.y || a.x - b.x || a.direction - b.direction); const current = open.shift()!; visited += 1;
    const currentKey = key(current.x, current.y, current.layer, current.direction);
    if (current.x === ex && current.y === ey) {
      const path: RoutedPath = []; let cursor: string | undefined = currentKey;
      while (cursor) { const state = states.get(cursor)!; path.push({ point: { xMm: state.x * GRID_MM, yMm: state.y * GRID_MM }, layer: state.layer }); cursor = previous.get(cursor); }
      path.reverse(); path[0] = { ...path[0], point: start }; path[path.length - 1] = { ...path[path.length - 1], point: end }; return path;
    }
    dirs.forEach(([dx, dy], direction) => {
      const x = current.x + dx; const y = current.y + dy; if (blocked(x, y, current.layer)) return;
      const g = current.g + 1 + (current.direction >= 0 && current.direction !== direction ? BEND_COST : 0); const id = key(x, y, current.layer, direction); if (g >= (best.get(id) ?? Infinity)) return;
      const state = { x, y, layer: current.layer, direction, g, f: g + Math.abs(x - ex) + Math.abs(y - ey) }; best.set(id, g); previous.set(id, currentKey); states.set(id, state); open.push(state);
    });
    if (pcb.board.layerMode === 'double' && !blocked(current.x, current.y, current.layer, true)) {
      const layer: PcbCopperLayer = current.layer === 'B.Cu' ? 'F.Cu' : 'B.Cu'; const g = current.g + VIA_COST; const id = key(current.x, current.y, layer, current.direction);
      if (g < (best.get(id) ?? Infinity)) { const state = { ...current, layer, g, f: g + Math.abs(current.x - ex) + Math.abs(current.y - ey) }; best.set(id, g); previous.set(id, currentKey); states.set(id, state); open.push(state); }
    }
  }
  return undefined;
}

function addPath(pcb: PcbProject, netId: string, path: RoutedPath, widthMm: number, ordinal: number): PcbProject {
  const traces: PcbTrace[] = []; const vias: PcbVia[] = []; let points: PcbPointMm[] = [path[0].point]; let layer = path[0].layer; let part = 1;
  for (let index = 1; index < path.length; index += 1) {
    const step = path[index];
    if (step.layer !== layer) { if (points.length > 1) traces.push({ id: `auto-${netId}-${ordinal}-${part++}`, netId, widthMm, layer, ownership: 'auto', pointsMm: points }); vias.push({ id: `auto-via-${netId}-${ordinal}-${vias.length + 1}`, netId, positionMm: step.point, drillDiameterMm: VIA_DRILL_MM, copperDiameterMm: VIA_COPPER_MM, fromLayer: 'F.Cu', toLayer: 'B.Cu', ownership: 'auto' }); layer = step.layer; points = [step.point]; } else points.push(step.point);
  }
  if (points.length > 1) traces.push({ id: `auto-${netId}-${ordinal}-${part}`, netId, widthMm, layer, ownership: 'auto', pointsMm: points });
  return { ...pcb, traces: [...pcb.traces, ...traces], vias: [...pcb.vias, ...vias] };
}

export function routeRemainingConnections(pcb: PcbProject): RouteResult {
  let working: PcbProject = { ...pcb, traces: pcb.traces.filter((trace) => trace.ownership !== 'auto'), vias: pcb.vias.filter((via) => via.ownership !== 'auto') }; const diagnostics: RouteDiagnostic[] = [];
  const nets = [...working.nets].filter((net) => net.pads.length > 1).sort((a, b) => b.pads.length - a.pads.length || a.id.localeCompare(b.id));
  for (const net of nets) for (let attempt = 0; attempt < net.pads.length - 1 && !isNetFullyRouted(working, net); attempt += 1) {
    const pair = nearestDisconnectedPair(working, net); if (!pair) break; const widthMm = /GND|VCC|\+\dV/i.test(net.name) ? 0.8 : 0.4; const path = findPath(working, net.id, pair[0], pair[1], widthMm);
    if (!path) { diagnostics.push({ netId: net.id, message: `${net.name}: no clearance-safe ${pcb.board.layerMode === 'double' ? 'two-layer' : 'bottom-copper'} path was found.` }); break; }
    working = addPath(working, net.id, path, widthMm, attempt + 1);
  }
  return { pcb: working, diagnostics };
}

export function clearAutoRoutes(pcb: PcbProject): PcbProject { return { ...pcb, traces: pcb.traces.filter((trace) => trace.ownership !== 'auto'), vias: pcb.vias.filter((via) => via.ownership !== 'auto') }; }
