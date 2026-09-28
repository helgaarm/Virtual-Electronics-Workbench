import { useEffect, useMemo, useState } from 'react';
import { BrowserProjectRepository } from '../persistence/browserProjectRepository';
import { importBrowserProjects } from '../persistence/importBrowserProjects';
import type { ProjectRepository } from '../persistence/projectRepository';

export function BrowserProjectImport({ target, onImported }: { target: ProjectRepository; onImported: () => Promise<void> }) {
  const source = useMemo(() => new BrowserProjectRepository(), []);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    void source.list().then((projects) => { if (active) setCount(projects.length); }).catch(() => {
      // Legacy browser storage may be disabled; it must not block cloud projects.
    });
    return () => { active = false; };
  }, [source]);
  if (!count) return null;
  const copy = async () => {
    setBusy(true);
    setMessage('Copying browser projects to Sites…');
    try {
      const result = await importBrowserProjects(source, target);
      setMessage(`${result.copied} copied, ${result.alreadyCopied} already in Sites. Browser originals kept.`
        + (result.failures.length ? ` ${result.failures.length} failed: ${result.failures[0].message} Retry to finish.` : ''));
      await onImported();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Copy failed. Browser originals kept.');
    } finally { setBusy(false); }
  };
  return <div className="browser-project-import">
    <span>{count} project{count === 1 ? '' : 's'} saved in this browser</span>
    <button type="button" disabled={busy} onClick={() => void copy()}>Copy browser projects to Sites</button>
    <span role="status">{message}</span>
  </div>;
}
