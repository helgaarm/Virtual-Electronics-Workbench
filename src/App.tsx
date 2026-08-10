import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentKind, PlacedComponent } from './domain/components/types';
import { isComponentAnchored, terminalEntries } from './domain/components/types';
import { signalSourceVoltageAtTime } from './domain/circuit/types';
import { connectedHoleIds, createBreadboardDefinition } from './domain/physical/breadboard';
import { buildOccupancy, validateOccupancy, validatePackageOverlaps } from './domain/physical/occupancy';
import {
  createEmptyProject,
  SIMULATION_SPEEDS,
  SIMULATION_TIME_STEPS_SECONDS,
  type WorkbenchProject,
} from './domain/project';
import {
  createStarterProject,
  STARTER_PROJECTS,
  type StarterProjectId,
} from './domain/starterProjects';
import { measureComponent } from './measurement/dcMeasurements';
import { ApiProjectRepository } from './persistence/apiProjectRepository';
import type { ProjectSummary } from './persistence/projectRepository';
import { simulateProject } from './simulation';
import { connectionLearningTarget } from './state/connectionLearning';
import {
  activeInstrumentMarkerId,
  instrumentProbeMarkers,
  instrumentSampleNodeIds,
} from './state/instrumentSelectors';
import { useTransientRuntime } from './state/useTransientRuntime';
import { createPlacedComponent, movePlacedComponent, rotatePlacedComponent } from './state/workbenchActions';
import {
  isProjectDirty,
  projectBaseline,
  reconcileSavedProject,
  type SavedBaseline,
} from './state/projectSaveState';
import { AnalysisWorkspace } from './ui/AnalysisWorkspace';
import { Inspector } from './ui/Inspector';
import { Palette } from './ui/Palette';
import { PcbDesigner } from './ui/PcbDesigner';
import { convertBreadboardToPcb, circuitFingerprint } from './domain/pcb/converter';
import { routeRemainingConnections } from './domain/pcb/router';
import { WorkbenchCanvas } from './workbench/scene/WorkbenchCanvas';
import './styles.css';

type SaveState = 'idle' | 'saving' | 'error';

function nextEditTimestamp(previous: string): string {
  return new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString();
}

export default function App() {
  const repository = useMemo(() => new ApiProjectRepository(), []);
  const [project, setProject] = useState<WorkbenchProject>(() => createStarterProject('switched-led'));
  const [selectedComponentId, setSelectedComponentId] = useState<string>('R1');
  const [selectedHoleId, setSelectedHoleId] = useState<string>();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [openProjectId, setOpenProjectId] = useState('');
  const [starterProjectId, setStarterProjectId] = useState<StarterProjectId>('switched-led');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedBaseline, setSavedBaseline] = useState<SavedBaseline>();
  const [notice, setNotice] = useState('Example loaded — the LED is powered through 220 Ω.');
  const [cameraResetKey, setCameraResetKey] = useState(0);
  const [draggingComponentId, setDraggingComponentId] = useState<string>();
  const [dragCandidateHoleId, setDragCandidateHoleId] = useState<string>();
  const [transientResetKey, setTransientResetKey] = useState(0);
  const past = useRef<WorkbenchProject[]>([]);
  const future = useRef<WorkbenchProject[]>([]);
  const projectNameInputRef = useRef<HTMLInputElement>(null);
  const projectNameAtFocusRef = useRef(project.name);

  const board = useMemo(
    () => createBreadboardDefinition(project.board.id, project.board.columns),
    [project.board.columns, project.board.id],
  );
  const dcSimulation = useMemo(() => simulateProject(project), [project]);
  const circuitKey = useMemo(
    () => JSON.stringify({
      board: project.board,
      powerOn: project.powerOn,
      components: project.components,
      signalGenerator: project.signalGenerator,
    }),
    [project.board, project.components, project.powerOn, project.signalGenerator],
  );
  const sampleNodeIds = useMemo(
    () => instrumentSampleNodeIds(project, dcSimulation.extraction.holeToNodeId),
    [dcSimulation.extraction.holeToNodeId, project],
  );
  const circuitTopologyKey = useMemo(
    () => JSON.stringify(dcSimulation.extraction.holeToNodeId),
    [dcSimulation.extraction.holeToNodeId],
  );
  const transientRuntime = useTransientRuntime(
    dcSimulation.extraction.circuit,
    circuitKey,
    project.simulation,
    transientResetKey,
    sampleNodeIds,
    circuitTopologyKey,
  );
  const simulation = useMemo(() => {
    if (
      !transientRuntime.hasTransientDevices
      || !transientRuntime.frame
      || dcSimulation.extraction.errors.length > 0
    ) return dcSimulation;
    const warnings = [
      ...dcSimulation.extraction.warnings,
      ...transientRuntime.frame.result.warnings,
    ];
    return {
      extraction: dcSimulation.extraction,
      result: {
        ...transientRuntime.frame.result,
        warnings,
        status: transientRuntime.frame.result.status === 'error'
          ? 'error' as const
          : warnings.length > 0
            ? 'warning' as const
            : 'ok' as const,
      },
    };
  }, [dcSimulation, transientRuntime.frame, transientRuntime.hasTransientDevices]);
  const probeMarkers = useMemo(() => instrumentProbeMarkers(project), [project]);
  const selectedMarkerId = activeInstrumentMarkerId(project);
  const selectedComponent = project.components.find((component) => component.id === selectedComponentId);
  const selectedMeasurement = useMemo(
    () => selectedComponent
      ? measureComponent(selectedComponent, simulation.extraction, simulation.result)
      : undefined,
    [selectedComponent, simulation],
  );
  const isDirty = isProjectDirty(project, savedBaseline);
  const dragPreview = useMemo(() => {
    if (!draggingComponentId || !dragCandidateHoleId) return undefined;
    const component = project.components.find((candidate) => candidate.id === draggingComponentId);
    return component
      ? movePlacedComponent(board, component, dragCandidateHoleId, project.components)
      : undefined;
  }, [board, dragCandidateHoleId, draggingComponentId, project.components]);
  const renderedComponents = useMemo(
    () => dragPreview
      ? project.components.map((component) => component.id === dragPreview.id ? dragPreview : component)
      : project.components,
    [dragPreview, project.components],
  );
  const occupiedHoleIds = useMemo(
    () => new Set(buildOccupancy(renderedComponents).keys()),
    [renderedComponents],
  );
  const highlightedHoleIds = useMemo(
    () => new Set([
      ...(project.view.showConnections && selectedHoleId ? connectedHoleIds(board, selectedHoleId) : []),
      ...(dragPreview ? terminalEntries(dragPreview).map(([, holeId]) => holeId) : []),
    ]),
    [board, dragPreview, project.view.showConnections, selectedHoleId],
  );
  const connectionGuideHoleIds = useMemo(
    () => new Set(
      project.view.showConnections && selectedHoleId
        ? connectedHoleIds(board, selectedHoleId)
        : [],
    ),
    [board, project.view.showConnections, selectedHoleId],
  );

  const refreshProjects = useCallback(async () => {
    try {
      const list = await repository.list();
      setProjects(list);
      if (list[0]) setOpenProjectId((current) => current || list[0].id);
    } catch {
      setNotice('SQLite service is not reachable yet. Run npm run dev to enable Save and Open.');
    }
  }, [repository]);

  useEffect(() => {
    let active = true;
    void repository.list().then((list) => {
      if (!active) return;
      setProjects(list);
      if (list[0]) setOpenProjectId((current) => current || list[0].id);
    }).catch(() => {
      if (active) setNotice('SQLite service is not reachable yet. Run npm run dev to enable Save and Open.');
    });
    return () => { active = false; };
  }, [repository]);

  const applyProject = useCallback((updater: (current: WorkbenchProject) => WorkbenchProject) => {
    setProject((current) => {
      const next = { ...updater(current), updatedAt: nextEditTimestamp(current.updatedAt) };
      past.current = [...past.current.slice(-49), current];
      future.current = [];
      setSaveState('idle');
      return next;
    });
  }, []);

  const commitProjectName = useCallback((rawName: string) => {
    const name = rawName.trim() || 'Untitled workbench';
    if (name !== project.name) applyProject((current) => ({ ...current, name }));
    if (name !== projectNameAtFocusRef.current) {
      setNotice(`Project renamed to “${name}”. Select Save to store the new name in SQLite.`);
    }
    projectNameAtFocusRef.current = name;
  }, [applyProject, project.name]);

  const undo = useCallback(() => {
    const previous = past.current.at(-1);
    if (!previous) return;
    past.current = past.current.slice(0, -1);
    future.current = [project, ...future.current].slice(0, 50);
    setProject(previous);
  }, [project]);

  const redo = useCallback(() => {
    const next = future.current[0];
    if (!next) return;
    future.current = future.current.slice(1);
    past.current = [...past.current, project].slice(-50);
    setProject(next);
  }, [project]);

  const removeSelected = useCallback(() => {
    if (!selectedComponentId) return;
    applyProject((current) => ({
      ...current,
      components: current.components.filter((component) => component.id !== selectedComponentId),
    }));
    setSelectedComponentId('');
    setNotice('Component removed.');
  }, [applyProject, selectedComponentId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const editing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if (!editing && (event.key === 'Delete' || event.key === 'Backspace')) {
        removeSelected();
      } else if (event.key === 'Escape') {
        setDraggingComponentId(undefined);
        setDragCandidateHoleId(undefined);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [redo, removeSelected, undo]);

  const addComponent = (kind: ComponentKind) => {
    const component = createPlacedComponent(kind, board, project.components);
    if (!component) {
      setNotice('No compatible free holes were found for that part.');
      return;
    }
    const overlap = validatePackageOverlaps(board, [...project.components, component])
      .find((issue) => issue.componentId === component.id);
    if (overlap) {
      setNotice(overlap.message);
      return;
    }
    applyProject((current) => ({
      ...current,
      components: [...current.components, component],
      view: { ...current.view, showConnections: false },
    }));
    setSelectedComponentId(component.id);
    setSelectedHoleId(undefined);
    setNotice(`${component.label} snapped into available breadboard holes.`);
  };

  const createOrOpenPcb = () => {
    if (project.pcb) {
      applyProject((current) => ({ ...current, workspace: 'pcb' }));
      if (project.pcb.sourceCircuitFingerprint !== circuitFingerprint(project)) setNotice('Breadboard circuit has changed. Existing PCB work is preserved; update it deliberately.');
      return;
    }
    const converted = convertBreadboardToPcb(project);
    if (!converted.pcb) { setNotice(`PCB footprint required: ${converted.missing.map((item) => item.componentId).join(', ')}.`); return; }
    const routed = routeRemainingConnections(converted.pcb);
    applyProject((current) => ({ ...current, pcb: routed.pcb, workspace: 'pcb' }));
    setNotice(routed.diagnostics.length > 0
      ? `PCB created with ${routed.diagnostics.length} routing diagnostic(s).`
      : 'PCB created and required connections routed automatically.');
  };

  const selectComponent = (componentId: string) => {
    setSelectedComponentId(componentId);
    setSelectedHoleId(undefined);
    if (project.view.showConnections) {
      applyProject((current) => ({
        ...current,
        view: { ...current.view, showConnections: false },
      }));
    }
  };

  const updateComponent = (updated: PlacedComponent) => {
    const nextComponents = project.components.map((component) => component.id === updated.id ? updated : component);
    const issue = [...validateOccupancy(board, nextComponents), ...validatePackageOverlaps(board, nextComponents)]
      .find((candidate) => candidate.componentId === updated.id);
    if (issue?.code === 'HOLE_OCCUPIED') {
      setNotice(`${issue.holeId.split(':').at(-1)} is already occupied.`);
      return;
    }
    if (issue?.code === 'DUPLICATE_TERMINAL') {
      setNotice('Two leads cannot occupy the same hole.');
      return;
    }
    if (issue) {
      setNotice(issue.message);
      return;
    }
    applyProject((current) => ({
      ...current,
      components: current.components.map((component) => component.id === updated.id ? updated : component),
    }));
  };

  const rotateSelected = () => {
    if (!selectedComponent) return;
    if (isComponentAnchored(selectedComponent)) {
      setNotice('Unanchor the component before rotating it.');
      return;
    }
    const rotated = rotatePlacedComponent(board, selectedComponent, project.components);
    if (!rotated) {
      setNotice('Rotation needs a compatible free hole at the same lead spacing.');
      return;
    }
    updateComponent(rotated);
    const rotationStep = selectedComponent.kind === 'ne555' ? 180 : 90;
    setNotice(`${selectedComponent.label} rotated ${rotationStep}° and re-snapped.`);
  };

  const toggleConnectionLearning = (enabled: boolean) => {
    applyProject((current) => ({
      ...current,
      view: { ...current.view, showConnections: enabled },
    }));
    if (!enabled) {
      setNotice('Internal connection highlighting turned off.');
      return;
    }
    const targetHoleId = connectionLearningTarget(board, selectedHoleId, selectedComponent);
    if (targetHoleId) {
      setSelectedHoleId(targetHoleId);
      setSelectedComponentId('');
      const label = board.holes.find((hole) => hole.id === targetHoleId)?.label ?? targetHoleId;
      setNotice(`${label} selected — its internally connected holes are highlighted.`);
    }
  };

  const cancelDrag = useCallback(() => {
    setDraggingComponentId(undefined);
    setDragCandidateHoleId(undefined);
  }, []);

  const dropComponent = (holeId: string | undefined) => {
    const component = project.components.find((candidate) => candidate.id === draggingComponentId);
    const moved = component && holeId
      ? movePlacedComponent(board, component, holeId, project.components)
      : undefined;
    if (moved) {
      updateComponent(moved);
      setNotice(`${moved.label} snapped into place.`);
    } else {
      setNotice('That placement does not have compatible free holes.');
    }
    cancelDrag();
  };

  const save = async (value = project) => {
    setSaveState('saving');
    try {
      const saved = await repository.save(value);
      setProject((current) => reconcileSavedProject(current, value, saved));
      const advanceHistoryRevision = (entry: WorkbenchProject) =>
        entry.id === value.id && entry.revision === value.revision
          ? { ...entry, revision: saved.revision }
          : entry;
      past.current = past.current.map(advanceHistoryRevision);
      future.current = future.current.map(advanceHistoryRevision);
      setSavedBaseline(projectBaseline(saved));
      setSaveState('idle');
      setNotice(`Saved “${saved.name}” snapshot to SQLite.`);
      await refreshProjects();
    } catch (error) {
      setSaveState('error');
      setNotice(error instanceof Error ? error.message : 'Save failed.');
    }
  };

  const saveAs = async () => {
    const now = new Date().toISOString();
    const copy = {
      ...project,
      id: `project-${globalThis.crypto.randomUUID()}`,
      name: `${project.name} copy`,
      createdAt: now,
      updatedAt: now,
      revision: 0,
    };
    past.current = [];
    future.current = [];
    setProject(copy);
    await save(copy);
  };

  const openSaved = async () => {
    if (!openProjectId) return;
    if (isDirty && !window.confirm('Discard unsaved changes and open this project?')) return;
    if (saveState === 'saving') return;
    try {
      const loaded = await repository.get(openProjectId);
      if (!loaded) throw new Error('Project no longer exists.');
      past.current = [];
      future.current = [];
      setProject(loaded);
      setSavedBaseline(projectBaseline(loaded));
      setSaveState('idle');
      setSelectedComponentId(loaded.components[0]?.id ?? '');
      setSelectedHoleId(undefined);
      cancelDrag();
      setTransientResetKey((key) => key + 1);
      setNotice(`Opened “${loaded.name}” from SQLite.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Open failed.');
    }
  };

  const newWorkbench = () => {
    if (isDirty && !window.confirm('Discard unsaved changes and create a new workbench?')) return;
    if (saveState === 'saving') return;
    past.current = [];
    future.current = [];
    setProject(createEmptyProject());
    setSavedBaseline(undefined);
    setSaveState('idle');
    setSelectedComponentId('');
    setSelectedHoleId(undefined);
    cancelDrag();
    setTransientResetKey((key) => key + 1);
    setNotice('New empty workbench created. Add a part to begin.');
  };

  const loadStarterProject = () => {
    if (saveState === 'saving') return;
    if (isDirty && !window.confirm('Discard unsaved changes and load this starter project?')) return;
    const loaded = createStarterProject(starterProjectId);
    const definition = STARTER_PROJECTS.find((candidate) => candidate.id === starterProjectId);
    past.current = [];
    future.current = [];
    setProject(loaded);
    setSavedBaseline(undefined);
    setSaveState('idle');
    setSelectedComponentId(loaded.components.find((component) => component.kind === 'resistor')?.id ?? loaded.components[0]?.id ?? '');
    setSelectedHoleId(undefined);
    cancelDrag();
    setCameraResetKey((key) => key + 1);
    setTransientResetKey((key) => key + 1);
    setNotice(`${definition?.name ?? 'Starter project'} loaded as a new unsaved workbench.`);
  };

  const statusText = simulation.result.errors[0]?.message ?? notice;
  const activeVoltageSource = project.components.find((component) => component.kind === 'voltage-source');
  const sourceStatusText = project.signalGenerator.enabled
    ? `${project.signalGenerator.frequencyHz.toLocaleString()} Hz ${project.signalGenerator.waveform} · ${signalSourceVoltageAtTime(project.signalGenerator, transientRuntime.clock.timeSeconds).toFixed(2)} V now`
    : project.powerOn && activeVoltageSource
      ? `${activeVoltageSource.voltageV.toFixed(2)} V DC`
      : '0 V';

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand"><span className="brand-mark"><i /><i /><i /></span><div><strong>Virtual Electronics</strong><small>WORKBENCH</small></div></div>
        <nav className="workspace-switcher" aria-label="Workspace">
          <button className={project.workspace === 'build' ? 'active' : ''} onClick={() => applyProject((current) => ({ ...current, workspace: 'build' }))}>Build</button>
          <button className={project.workspace === 'analysis' ? 'active' : ''} onClick={() => applyProject((current) => ({ ...current, workspace: 'analysis' }))}>Test &amp; Analysis</button>
          <button className={project.workspace === 'pcb' ? 'active' : ''} onClick={createOrOpenPcb}>Design PCB</button>
        </nav>
        <div className="header-actions">
          <button className="icon-button" onClick={undo} title="Undo (Ctrl+Z)">↶</button>
          <button className="icon-button" onClick={redo} title="Redo (Ctrl+Shift+Z)">↷</button>
          <button className="quiet-button" onClick={newWorkbench} disabled={saveState === 'saving'}>New</button>
          <button className="quiet-button" onClick={() => void saveAs()} disabled={saveState === 'saving'}>Save as</button>
          <button className="save-button" onClick={() => void save()} disabled={saveState === 'saving' || !isDirty}>{saveState === 'saving' ? 'Saving…' : isDirty ? 'Save' : 'Saved ✓'}</button>
        </div>
        <button className={project.powerOn ? 'power-toggle on' : 'power-toggle'} onClick={() => applyProject((current) => ({ ...current, powerOn: !current.powerOn }))} aria-pressed={project.powerOn}>
          <span className="power-icon">⏻</span><span><small>OUTPUT</small><strong>{project.powerOn ? 'ON' : 'OFF'}</strong></span>
        </button>
      </header>

      <div className="project-bar">
        <div className="project-name">
          <label htmlFor="project-name-input">Project name</label>
          <span className="project-name-control">
            <input
              ref={projectNameInputRef}
              id="project-name-input"
              value={project.name}
              maxLength={200}
              autoComplete="off"
              aria-invalid={!project.name.trim()}
              title="Enter a project name, then select Save to persist it in SQLite."
              onFocus={() => { projectNameAtFocusRef.current = project.name; }}
              onChange={(event) => applyProject((current) => ({
                ...current,
                name: event.target.value,
              }))}
              onBlur={(event) => commitProjectName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
            />
            <button
              type="button"
              onClick={() => {
                projectNameInputRef.current?.focus();
                projectNameInputRef.current?.select();
              }}
              title="Rename this project"
            >Rename</button>
          </span>
        </div>
        <div className="project-loaders">
          <div className="starter-project">
            <label htmlFor="starter-projects">Start projects</label>
            <select
              id="starter-projects"
              value={starterProjectId}
              title={STARTER_PROJECTS.find((item) => item.id === starterProjectId)?.description}
              onChange={(event) => setStarterProjectId(event.target.value as StarterProjectId)}
            >
              {STARTER_PROJECTS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <button onClick={loadStarterProject} disabled={saveState === 'saving'}>Load</button>
          </div>
          <div className="open-project"><label htmlFor="saved-projects">SQLite projects</label><select id="saved-projects" value={openProjectId} onChange={(event) => setOpenProjectId(event.target.value)}><option value="">No saved projects</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button onClick={() => void openSaved()} disabled={!openProjectId || saveState === 'saving'}>Open</button></div>
        </div>
      </div>

      {project.workspace === 'build' ? (
        <main className="build-layout">
          <Palette onAdd={addComponent} />
          <section className="workbench-stage" aria-label="3D breadboard workbench">
            <div className="stage-toolbar">
              <div className="view-buttons"><button className={project.view.cameraPreset === 'top' ? 'active' : ''} onClick={() => applyProject((current) => ({ ...current, view: { ...current.view, cameraPreset: 'top' } }))}>Top</button><button className={project.view.cameraPreset === '3d' ? 'active' : ''} onClick={() => applyProject((current) => ({ ...current, view: { ...current.view, cameraPreset: '3d' } }))}>3D</button><button onClick={() => { applyProject((current) => ({ ...current, view: { ...current.view, cameraPreset: '3d' } })); setCameraResetKey((key) => key + 1); }}>Fit</button><button onClick={() => setCameraResetKey((key) => key + 1)}>Reset view</button></div>
              <label className="learning-toggle" title="Highlights every hole joined by the breadboard's internal metal strip."><input type="checkbox" checked={project.view.showConnections} onChange={(event) => toggleConnectionLearning(event.target.checked)} /> Highlight connected holes</label>
            </div>
            <div className="canvas-wrap" data-reset-key={cameraResetKey}>
              <WorkbenchCanvas
                key={cameraResetKey}
                board={board}
                components={renderedComponents}
                result={simulation.result}
                cameraPreset={project.view.cameraPreset}
                selectedComponentId={selectedComponentId}
                selectedHoleId={selectedHoleId}
                highlightedHoleIds={highlightedHoleIds}
                connectionGuideHoleIds={connectionGuideHoleIds}
                occupiedHoleIds={occupiedHoleIds}
                probes={probeMarkers}
                selectedProbeId={selectedMarkerId}
                onSelectComponent={selectComponent}
                onSelectHole={(id) => { setSelectedHoleId(id); setSelectedComponentId(''); setNotice(`${id.split(':').at(-1)} selected.`); }}
                onClearSelection={() => { setSelectedComponentId(''); setSelectedHoleId(undefined); }}
                draggingComponentId={draggingComponentId}
                onBeginDrag={(id) => { setDraggingComponentId(id); setDragCandidateHoleId(undefined); }}
                onDragCandidate={setDragCandidateHoleId}
                onDropComponent={dropComponent}
                onCancelDrag={cancelDrag}
              />
              {project.components.length === 0 && <div className="empty-workbench"><strong>Build something.</strong><span>Add a component from the parts drawer to start.</span></div>}
              <div className="board-scale">2.54 mm pitch <span /> real-world scale</div>
            </div>
          </section>
          <Inspector
            component={selectedComponent}
            board={board}
            measurement={selectedMeasurement}
            onUpdate={updateComponent}
            onRotate={rotateSelected}
            onDelete={removeSelected}
            onHardResetCapacitor={(componentId) => {
              transientRuntime.hardResetCapacitor(componentId);
              const capacitor = project.components.find((component) => component.id === componentId);
              setNotice(`${capacitor?.label ?? 'Capacitor'} charge hard-reset to 0 V. Simulation paused.`);
            }}
          />
        </main>
      ) : project.workspace === 'analysis' ? (
        <AnalysisWorkspace
          project={project}
          board={board}
          simulation={simulation}
          transientRuntime={transientRuntime}
          onEditProject={applyProject}
          onSwitchToBuild={() => applyProject((current) => ({ ...current, workspace: 'build' }))}
        />
      ) : project.pcb ? <PcbDesigner pcb={project.pcb} onChange={(pcb) => applyProject((current) => ({ ...current, pcb }))} onBack={() => applyProject((current) => ({ ...current, workspace: 'build' }))} /> : null}

      <footer className={`status-bar status-${simulation.result.status}`}>
        <span className="status-dot" />
        <strong>{transientRuntime.hasTransientDevices
          ? `Transient ${transientRuntime.clock.status}`
          : project.powerOn ? 'Simulation active' : 'Output off'}</strong>
        <span className="status-separator" />
        <span>{sourceStatusText}</span>
        {transientRuntime.hasTransientDevices && (
          <div className="transient-controls" role="group" aria-label="Transient simulation clock">
            <button onClick={transientRuntime.toggleRunning}>
              {transientRuntime.clock.status === 'running' ? 'Pause' : 'Run'}
            </button>
            <button onClick={transientRuntime.stepOnce} disabled={transientRuntime.clock.status === 'running'}>Step</button>
            <button
              onClick={transientRuntime.reset}
              title="Clear every capacitor charge and return transient time to 0 seconds"
            >Reset all</button>
            <output>{transientRuntime.clock.timeSeconds.toFixed(3)} s</output>
            <label>Step
              <select
                value={project.simulation.timeStepSeconds}
                onChange={(event) => {
                  const timeStepSeconds = Number(event.target.value);
                  applyProject((current) => ({
                    ...current,
                    simulation: {
                      ...current.simulation,
                      timeStepSeconds,
                      speed: timeStepSeconds <= 0.00005
                        ? Math.min(current.simulation.speed, 2)
                        : current.simulation.speed,
                    },
                  }));
                }}
              >
                {SIMULATION_TIME_STEPS_SECONDS.map((value) => (
                  <option key={value} value={value}>
                    {value < 0.001 ? `${value * 1e6} µs` : `${value * 1e3} ms`}
                  </option>
                ))}
              </select>
            </label>
            <label>Speed
              <select
                value={project.simulation.speed}
                onChange={(event) => applyProject((current) => ({
                  ...current,
                  simulation: { ...current.simulation, speed: Number(event.target.value) },
                }))}
              >
                {SIMULATION_SPEEDS.map((value) => (
                  <option
                    key={value}
                    value={value}
                    disabled={value === 4 && project.simulation.timeStepSeconds <= 0.00005}
                  >{value}×</option>
                ))}
              </select>
            </label>
          </div>
        )}
        <span className="status-message">{statusText}</span>
        <span className="sqlite-status">SQLite persistence</span>
      </footer>
    </div>
  );
}
