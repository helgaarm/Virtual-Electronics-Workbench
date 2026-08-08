import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentKind, PlacedComponent } from './domain/components/types';
import { terminalEntries } from './domain/components/types';
import { connectedHoleIds, createBreadboardDefinition } from './domain/physical/breadboard';
import { buildOccupancy } from './domain/physical/occupancy';
import { createEmptyProject, createLedExampleProject, type WorkbenchProject } from './domain/project';
import { ApiProjectRepository } from './persistence/apiProjectRepository';
import type { ProjectSummary } from './persistence/projectRepository';
import { simulateProject } from './simulation';
import { createPlacedComponent, rotatePlacedComponent } from './state/workbenchActions';
import { AnalysisWorkspace } from './ui/AnalysisWorkspace';
import { Inspector } from './ui/Inspector';
import { Palette } from './ui/Palette';
import { WorkbenchCanvas } from './workbench/scene/WorkbenchCanvas';
import './styles.css';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function App() {
  const repository = useMemo(() => new ApiProjectRepository(), []);
  const [project, setProject] = useState<WorkbenchProject>(() => createLedExampleProject());
  const [selectedComponentId, setSelectedComponentId] = useState<string>('R1');
  const [selectedHoleId, setSelectedHoleId] = useState<string>();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [openProjectId, setOpenProjectId] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [notice, setNotice] = useState('Example loaded — the LED is powered through 220 Ω.');
  const [cameraResetKey, setCameraResetKey] = useState(0);
  const past = useRef<WorkbenchProject[]>([]);
  const future = useRef<WorkbenchProject[]>([]);

  const board = useMemo(
    () => createBreadboardDefinition(project.board.id, project.board.columns),
    [project.board.columns, project.board.id],
  );
  const simulation = useMemo(() => simulateProject(project), [project]);
  const selectedComponent = project.components.find((component) => component.id === selectedComponentId);
  const occupiedHoleIds = useMemo(
    () => new Set(buildOccupancy(project.components).keys()),
    [project.components],
  );
  const highlightedHoleIds = useMemo(
    () => new Set(project.view.showConnections && selectedHoleId ? connectedHoleIds(board, selectedHoleId) : []),
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
      const next = { ...updater(current), updatedAt: new Date().toISOString() };
      past.current = [...past.current.slice(-49), current];
      future.current = [];
      setSaveState('idle');
      return next;
    });
  }, []);

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
    applyProject((current) => ({ ...current, components: [...current.components, component] }));
    setSelectedComponentId(component.id);
    setNotice(`${component.label} snapped into available breadboard holes.`);
  };

  const updateComponent = (updated: PlacedComponent) => {
    const otherOccupancy = buildOccupancy(project.components.filter((component) => component.id !== updated.id));
    const conflicting = terminalEntries(updated).find(([, holeId]) => otherOccupancy.has(holeId));
    if (conflicting) {
      setNotice(`${conflicting[1].split(':').at(-1)} is already occupied.`);
      return;
    }
    const ownHoles = terminalEntries(updated).map(([, holeId]) => holeId);
    if (new Set(ownHoles).size !== ownHoles.length) {
      setNotice('Two leads cannot occupy the same hole.');
      return;
    }
    applyProject((current) => ({
      ...current,
      components: current.components.map((component) => component.id === updated.id ? updated : component),
    }));
  };

  const rotateSelected = () => {
    if (!selectedComponent) return;
    const rotated = rotatePlacedComponent(board, selectedComponent, project.components);
    if (!rotated) {
      setNotice('Rotation needs a compatible free hole at the same lead spacing.');
      return;
    }
    updateComponent(rotated);
    setNotice(`${selectedComponent.label} rotated 90° and re-snapped.`);
  };

  const save = async (value = project) => {
    setSaveState('saving');
    try {
      const updated = { ...value, updatedAt: new Date().toISOString() };
      const saved = await repository.save(updated);
      setProject(saved);
      setSaveState('saved');
      setNotice(`Saved “${saved.name}” to SQLite.`);
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
    };
    past.current = [];
    future.current = [];
    setProject(copy);
    await save(copy);
  };

  const openSaved = async () => {
    if (!openProjectId) return;
    try {
      const loaded = await repository.get(openProjectId);
      if (!loaded) throw new Error('Project no longer exists.');
      past.current = [];
      future.current = [];
      setProject(loaded);
      setSelectedComponentId(loaded.components[0]?.id ?? '');
      setNotice(`Opened “${loaded.name}” from SQLite.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Open failed.');
    }
  };

  const newWorkbench = () => {
    past.current = [];
    future.current = [];
    setProject(createEmptyProject());
    setSelectedComponentId('');
    setNotice('New empty workbench created. Add a part to begin.');
  };

  const statusText = simulation.result.errors[0]?.message ?? notice;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand"><span className="brand-mark"><i /><i /><i /></span><div><strong>Virtual Electronics</strong><small>WORKBENCH</small></div></div>
        <nav className="workspace-switcher" aria-label="Workspace">
          <button className={project.workspace === 'build' ? 'active' : ''} onClick={() => applyProject((current) => ({ ...current, workspace: 'build' }))}>Build</button>
          <button className={project.workspace === 'analysis' ? 'active' : ''} onClick={() => applyProject((current) => ({ ...current, workspace: 'analysis' }))}>Test &amp; Analysis</button>
        </nav>
        <div className="header-actions">
          <button className="icon-button" onClick={undo} title="Undo (Ctrl+Z)">↶</button>
          <button className="icon-button" onClick={redo} title="Redo (Ctrl+Shift+Z)">↷</button>
          <button className="quiet-button" onClick={newWorkbench}>New</button>
          <button className="quiet-button" onClick={() => void saveAs()}>Save as</button>
          <button className="save-button" onClick={() => void save()} disabled={saveState === 'saving'}>{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved ✓' : 'Save'}</button>
        </div>
        <button className={project.powerOn ? 'power-toggle on' : 'power-toggle'} onClick={() => applyProject((current) => ({ ...current, powerOn: !current.powerOn }))} aria-pressed={project.powerOn}>
          <span className="power-icon">⏻</span><span><small>OUTPUT</small><strong>{project.powerOn ? 'ON' : 'OFF'}</strong></span>
        </button>
      </header>

      <div className="project-bar">
        <label className="project-name"><span>Project</span><input value={project.name} onChange={(event) => applyProject((current) => ({ ...current, name: event.target.value }))} /></label>
        <div className="open-project"><label htmlFor="saved-projects">SQLite projects</label><select id="saved-projects" value={openProjectId} onChange={(event) => setOpenProjectId(event.target.value)}><option value="">No saved projects</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button onClick={() => void openSaved()} disabled={!openProjectId}>Open</button></div>
      </div>

      {project.workspace === 'build' ? (
        <main className="build-layout">
          <Palette onAdd={addComponent} />
          <section className="workbench-stage" aria-label="3D breadboard workbench">
            <div className="stage-toolbar">
              <div className="view-buttons"><button className={project.view.cameraPreset === 'top' ? 'active' : ''} onClick={() => applyProject((current) => ({ ...current, view: { ...current.view, cameraPreset: 'top' } }))}>Top</button><button className={project.view.cameraPreset === '3d' ? 'active' : ''} onClick={() => applyProject((current) => ({ ...current, view: { ...current.view, cameraPreset: '3d' } }))}>3D</button><button onClick={() => { applyProject((current) => ({ ...current, view: { ...current.view, cameraPreset: '3d' } })); setCameraResetKey((key) => key + 1); }}>Fit</button><button onClick={() => setCameraResetKey((key) => key + 1)}>Reset view</button></div>
              <label className="learning-toggle"><input type="checkbox" checked={project.view.showConnections} onChange={(event) => applyProject((current) => ({ ...current, view: { ...current.view, showConnections: event.target.checked } }))} /> Show breadboard connections</label>
            </div>
            <div className="canvas-wrap" data-reset-key={cameraResetKey}>
              <WorkbenchCanvas
                key={cameraResetKey}
                board={board}
                components={project.components}
                result={simulation.result}
                cameraPreset={project.view.cameraPreset}
                selectedComponentId={selectedComponentId}
                selectedHoleId={selectedHoleId}
                highlightedHoleIds={highlightedHoleIds}
                occupiedHoleIds={occupiedHoleIds}
                onSelectComponent={(id) => { setSelectedComponentId(id); setSelectedHoleId(undefined); }}
                onSelectHole={(id) => { setSelectedHoleId(id); setSelectedComponentId(''); setNotice(`${id.split(':').at(-1)} selected.`); }}
                onClearSelection={() => { setSelectedComponentId(''); setSelectedHoleId(undefined); }}
              />
              {project.components.length === 0 && <div className="empty-workbench"><strong>Build something.</strong><span>Add a component from the parts drawer to start.</span></div>}
              <div className="board-scale">2.54 mm pitch <span /> real-world scale</div>
            </div>
          </section>
          <Inspector
            component={selectedComponent}
            board={board}
            result={simulation.result}
            terminalNodes={selectedComponent ? simulation.extraction.componentTerminalNodes[selectedComponent.id] : undefined}
            onUpdate={updateComponent}
            onRotate={rotateSelected}
            onDelete={removeSelected}
          />
        </main>
      ) : (
        <AnalysisWorkspace project={project} board={board} simulation={simulation} cameraResetKey={cameraResetKey} onSwitchToBuild={() => applyProject((current) => ({ ...current, workspace: 'build' }))} />
      )}

      <footer className={`status-bar status-${simulation.result.status}`}>
        <span className="status-dot" />
        <strong>{project.powerOn ? 'Simulation active' : 'Output off'}</strong>
        <span className="status-separator" />
        <span>{project.powerOn ? '5 V DC' : '0 V'}</span>
        <span className="status-message">{statusText}</span>
        <span className="sqlite-status">SQLite persistence</span>
      </footer>
    </div>
  );
}
