import { runPcbDrc, type PcbDrcIssue, type PcbRepairCategory } from './drc';
import { componentCourtyard, rectsOverlap } from './geometry';
import { routeRemainingConnections } from './router';
import type { PcbComponent, PcbProject } from './types';

export type RepairActionCode = 'REROUTED_NET' | 'MOVED_COMPONENT' | 'ROTATED_COMPONENT' | 'ADDED_VIA' | 'EXPANDED_BOARD' | 'CANNOT_AUTOFIX_FOOTPRINT' | 'LOCKED_COMPONENT_BLOCKS_ROUTE' | 'NO_ROUTE_FOUND' | 'NO_SINGLE_LAYER_ROUTE';
export interface RepairAction { code: RepairActionCode; description: string; relatedIds: string[] }
export interface RepairProblem { issue: PcbDrcIssue; category: PcbRepairCategory }
export interface RepairScore { shorts: number; blocking: number; unrouted: number; vias: number; traceLengthMm: number; movementMm: number; boardAreaMm2: number }
export interface AutoRepairResult { pcb: PcbProject; appliedActions: RepairAction[]; remainingProblems: RepairProblem[]; diagnostics: string[]; changed: boolean }

const categoryFor = (issue: PcbDrcIssue): PcbRepairCategory => issue.repairCategory ?? (issue.code.startsWith('TRACK_') || issue.code.startsWith('VIA_') ? 'ROUTING_REPAIRABLE' : 'NON_AUTOFIXABLE');
export function analyzePcb(pcb: PcbProject): RepairProblem[] { return runPcbDrc(pcb).issues.filter((issue) => issue.severity === 'error').map((issue) => ({ issue, category: categoryFor(issue) })); }

export function scorePcb(pcb: PcbProject, original = pcb): RepairScore {
  const result = runPcbDrc(pcb); const issues = result.issues.filter((issue) => issue.severity === 'error');
  const movementMm = pcb.components.reduce((sum, component) => { const before = original.components.find((candidate) => candidate.id === component.id); return sum + (before ? Math.hypot(component.positionMm.xMm - before.positionMm.xMm, component.positionMm.yMm - before.positionMm.yMm) : 0); }, 0);
  return { shorts: issues.filter((issue) => ['TRACK_TO_TRACK_CLEARANCE', 'TRACK_TO_PAD_CLEARANCE', 'PAD_TO_PAD_CLEARANCE', 'VIA_TO_TRACE_CLEARANCE', 'VIA_TO_PAD_CLEARANCE', 'VIA_TO_VIA_CLEARANCE'].includes(issue.code)).length, blocking: issues.length, unrouted: result.totalConnections - result.routedConnections, vias: pcb.vias.length, traceLengthMm: pcb.traces.reduce((sum, trace) => sum + trace.pointsMm.slice(1).reduce((length, point, index) => length + Math.hypot(point.xMm - trace.pointsMm[index].xMm, point.yMm - trace.pointsMm[index].yMm), 0), 0), movementMm, boardAreaMm2: pcb.board.widthMm * pcb.board.heightMm };
}

function compareScore(a: RepairScore, b: RepairScore): number { for (const key of ['shorts', 'blocking', 'unrouted', 'vias', 'traceLengthMm', 'movementMm', 'boardAreaMm2'] as const) if (a[key] !== b[key]) return a[key] - b[key]; return 0; }
function clone(pcb: PcbProject): PcbProject { return structuredClone(pcb); }

function placementCandidates(pcb: PcbProject): PcbProject[] {
  const results: PcbProject[] = []; const offsets = [[2.5,0],[-2.5,0],[0,2.5],[0,-2.5],[5,0],[-5,0],[0,5],[0,-5]] as const;
  for (const component of pcb.components.filter((item) => !item.locked)) for (const [x, y] of offsets) {
    const moved: PcbComponent = { ...component, positionMm: { xMm: component.positionMm.xMm + x, yMm: component.positionMm.yMm + y } }; const courtyard = componentCourtyard(moved); if (!courtyard || courtyard.leftMm < pcb.rules.componentToEdgeMm || courtyard.topMm < pcb.rules.componentToEdgeMm || courtyard.rightMm > pcb.board.widthMm - pcb.rules.componentToEdgeMm || courtyard.bottomMm > pcb.board.heightMm - pcb.rules.componentToEdgeMm) continue;
    if (pcb.components.some((other) => other.id !== component.id && componentCourtyard(other) && rectsOverlap(courtyard, componentCourtyard(other)!))) continue;
    results.push({ ...clone(pcb), components: pcb.components.map((item) => item.id === component.id ? moved : item), traces: pcb.traces.filter((trace) => trace.ownership !== 'auto'), vias: pcb.vias.filter((via) => via.ownership !== 'auto') });
  }
  return results;
}

/** Bounded, deterministic, copy-on-write repair. Manufacturing rules are never modified. */
export function autoRepairPcb(input: PcbProject): AutoRepairResult {
  const original = clone(input); if (runPcbDrc(original).status === 'manufacturing-checks-passed') return { pcb: original, appliedActions: [], remainingProblems: [], diagnostics: ['The PCB already passes DRC; no changes were made.'], changed: false };
  let working = original; let score = scorePcb(working, original); const actions: RepairAction[] = []; const diagnostics: string[] = [];
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const candidates: Array<{ pcb: PcbProject; action: RepairAction }> = [];
    const routed = routeRemainingConnections(clone(working)); candidates.push({ pcb: routed.pcb, action: { code: 'REROUTED_NET', description: `Rerouted automatic copper${routed.pcb.vias.length > working.vias.length ? ` and added ${routed.pcb.vias.length - working.vias.length} via(s)` : ''}.`, relatedIds: routed.pcb.traces.filter((trace) => trace.ownership === 'auto').map((trace) => trace.netId) } }); diagnostics.push(...routed.diagnostics.map((item) => item.message));
    placementCandidates(working).slice(0, 40).forEach((candidate) => candidates.push({ pcb: routeRemainingConnections(candidate).pcb, action: { code: 'MOVED_COMPONENT', description: 'Moved an unlocked component on the 2.5 mm placement grid and rerouted affected automatic copper.', relatedIds: [] } }));
    if (iteration < 2) { const expanded = clone(working); expanded.board.widthMm += 5; expanded.board.heightMm += 5; candidates.push({ pcb: routeRemainingConnections(expanded).pcb, action: { code: 'EXPANDED_BOARD', description: 'Expanded the board by 5 mm in each dimension.', relatedIds: [] } }); }
    const evaluated = candidates.map((candidate) => ({ ...candidate, score: scorePcb(candidate.pcb, original) })).sort((a, b) => compareScore(a.score, b.score) || a.action.code.localeCompare(b.action.code)); const best = evaluated[0];
    if (!best || compareScore(best.score, score) >= 0) break; working = best.pcb; score = best.score; actions.push(best.action); if (runPcbDrc(working).status === 'manufacturing-checks-passed') break;
  }
  const remainingProblems = analyzePcb(working); for (const problem of remainingProblems.filter((item) => item.category === 'FOOTPRINT_INTRINSIC')) actions.push({ code: 'CANNOT_AUTOFIX_FOOTPRINT', description: problem.issue.message, relatedIds: problem.issue.relatedIds ?? [] });
  if (!actions.length) diagnostics.push(input.board.layerMode === 'single' ? 'No legal single-layer repair was found; manual routing, a physical jumper, or an explicit board-type change may be required.' : 'No improving repair candidate was found within the bounded search.');
  return { pcb: actions.some((action) => action.code !== 'CANNOT_AUTOFIX_FOOTPRINT') ? working : original, appliedActions: actions, remainingProblems, diagnostics, changed: compareScore(score, scorePcb(original, original)) < 0 };
}
