import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { convertBreadboardToPcb } from '../../src/domain/pcb/converter';
import { routeRemainingConnections } from '../../src/domain/pcb/router';
import { createStarterProject } from '../../src/domain/starterProjects';
import { PcbDesigner } from '../../src/ui/PcbDesigner';

function renderPcb(routed: boolean): string {
  const initial = convertBreadboardToPcb(createStarterProject('voltage-divider')).pcb!;
  const pcb = routed ? routeRemainingConnections(initial).pcb : initial;
  return renderToStaticMarkup(createElement(PcbDesigner, {
    pcb,
    onBack: () => undefined,
    onChange: () => undefined,
  }));
}

describe('PCB designer repair state', () => {
  it('offers an automatic repair beside an unrouted DRC error', () => {
    const output = renderPcb(false);
    expect(output).toContain('UNROUTED_CONNECTIONS');
    expect(output).toContain('Fix automatically');
    expect(output).toContain('Not Ready');
  });

  it('shows checks passed and removes the contextual repair after routing', () => {
    const output = renderPcb(true);
    expect(output).toContain('Checks Passed');
    expect(output).not.toContain('Fix automatically');
    expect(output).not.toContain('UNROUTED_CONNECTIONS');
  });
});
