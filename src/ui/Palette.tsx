import { useId, useRef, useState } from 'react';
import type { ComponentKind } from '../domain/components/types';
import { getPaletteFolders, type PaletteFolderId } from './paletteCatalog';

export function Palette({ onAdd }: { onAdd: (kind: ComponentKind) => void }) {
  const id = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [openFolders, setOpenFolders] = useState<Set<PaletteFolderId>>(() => new Set());
  const searching = query.trim().length > 0;
  const folders = getPaletteFolders(query);
  const resultCount = folders.reduce((total, folder) => total + folder.parts.length, 0);

  function toggleFolder(folderId: PaletteFolderId) {
    setOpenFolders((previous) => {
      const next = new Set(previous);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  return (
    <aside className="panel palette" aria-label="Component palette">
      <div className="panel-heading">
        <span className="eyebrow">Parts drawer</span>
        <h2>Components</h2>
      </div>
      <div className="palette-search">
        <label htmlFor={`${id}-search`}>Search components</label>
        <div className="palette-search-input">
          <input
            ref={searchRef}
            id={`${id}-search`}
            type="search"
            placeholder="Name, type or package…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && <button type="button" aria-label="Clear component search" onClick={() => {
            setQuery('');
            searchRef.current?.focus();
          }}>×</button>}
        </div>
      </div>
      <p className="palette-results" role="status">
        {searching ? `${resultCount} ${resultCount === 1 ? 'component' : 'components'} found` : 'Browse by folder'}
      </p>
      <div className="palette-folders">
        {folders.map((folder) => {
          const expanded = searching || openFolders.has(folder.id);
          const headingId = `${id}-${folder.id}-heading`;
          const contentId = `${id}-${folder.id}-parts`;
          const folderLabel = <>
            <svg className="palette-folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z" />
            </svg>
            <span className="palette-folder-name">{folder.name}</span>
            <span className="palette-folder-count" aria-label={`${folder.parts.length} components`}>{folder.parts.length}</span>
          </>;
          return (
            <section className="palette-folder" key={folder.id} aria-labelledby={headingId}>
              <h3 id={headingId}>
                {searching ? <span className="palette-folder-heading">{folderLabel}</span> : (
                  <button type="button" className="palette-folder-heading" aria-expanded={expanded} aria-controls={contentId} onClick={() => toggleFolder(folder.id)}>
                    {folderLabel}
                    <span className="palette-folder-chevron" aria-hidden="true">›</span>
                  </button>
                )}
              </h3>
              <div id={contentId} className="palette-list" hidden={!expanded}>
                {folder.parts.map(({ kind, icon, name, description }) => (
                  <button type="button" className="part-card" key={kind} onClick={() => onAdd(kind)} title={`Add ${name}`}>
                    <span className={`part-icon part-icon-${kind}`} aria-hidden="true">{icon}</span>
                    <span><strong>{name}</strong><small>{description}</small></span>
                    <span className="add-mark" aria-hidden="true">+</span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {resultCount === 0 && <p className="palette-empty">No matching components. Try a name like “555” or a type like “transistor”.</p>}
      <p className="palette-hint">Open a folder to add a part, then choose its breadboard holes in the inspector.</p>
    </aside>
  );
}
