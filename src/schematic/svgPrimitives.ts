export function escapeXml(value: string): string {
  return Array.from(value).filter((character) => {
    const code = character.codePointAt(0)!;
    return code === 9 || code === 10 || code === 13
      || (code >= 32 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd) || code >= 0x10000;
  }).join('')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

export function text(x: number, y: number, value: string, size = 12, color = '#273c35'): string {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${color}">${escapeXml(value)}</text>`;
}

export function path(d: string, color = '#273c35'): string {
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
}

export function wrappedText(x: number, y: number, value: string, maxCharacters: number, size = 12): { svg: string; lines: number } {
  const lines: string[] = [];
  let remaining = value;
  while (remaining.length > maxCharacters) {
    const space = remaining.lastIndexOf(' ', maxCharacters);
    const end = space > maxCharacters / 2 ? space : maxCharacters;
    lines.push(remaining.slice(0, end));
    remaining = remaining.slice(end).trimStart();
  }
  lines.push(remaining);
  return { svg: lines.map((line, index) => text(x, y + index * (size + 4), line, size)).join(''), lines: lines.length };
}
