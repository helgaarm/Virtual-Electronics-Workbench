/** A bounded, deterministic grid router. Different nets may cross straight wires,
 * but can never share a segment, a bend, an endpoint or a junction. */
export interface GridPoint { x: number; y: number }
export interface RoutingPort extends GridPoint { net: string; direction: number }
export interface RoutingBox { left: number; top: number; right: number; bottom: number }
export interface RoutedNet { net: string; paths: GridPoint[][]; junctions: GridPoint[] }
const directions = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
const key = ({ x, y }: GridPoint) => `${x},${y}`;

interface QueueEntry { state: number; cost: number; score: number }
class MinHeap {
  private entries: QueueEntry[] = [];
  push(entry: QueueEntry) {
    let index = this.entries.length;
    this.entries.push(entry);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.entries[parent].score <= entry.score) break;
      this.entries[index] = this.entries[parent]; index = parent;
    }
    this.entries[index] = entry;
  }
  pop(): QueueEntry | undefined {
    const result = this.entries[0]; const last = this.entries.pop();
    if (!this.entries.length || !last) return result;
    let index = 0;
    while (index * 2 + 1 < this.entries.length) {
      let child = index * 2 + 1;
      if (child + 1 < this.entries.length && this.entries[child + 1].score < this.entries[child].score) child++;
      if (last.score <= this.entries[child].score) break;
      this.entries[index] = this.entries[child]; index = child;
    }
    this.entries[index] = last;
    return result;
  }
}

export function routeOrthogonalNets(ports: RoutingPort[], boxes: RoutingBox[], width: number, height: number,
  rails: Map<string, number>): RoutedNet[] | undefined {
  const columns = width / 20 + 1; const rows = height / 20 + 1;
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 5 || rows < 5 || columns * rows > 40_000 || ports.length > 192) return undefined;
  // A shared expansion budget bounds work across all pins, including dense ICs.
  let expansionsLeft = 800_000;
  const blocked = new Set<string>();
  for (const box of boxes) {
    for (let x = Math.ceil(box.left / 20); x <= Math.floor(box.right / 20); x++) {
      for (let y = Math.ceil(box.top / 20); y <= Math.floor(box.bottom / 20); y++) blocked.add(key({ x, y }));
    }
  }
  const gridPorts = ports.map((port) => ({ ...port, x: port.x / 20, y: port.y / 20 }));
  if (gridPorts.some((port) => !Number.isInteger(port.x) || !Number.isInteger(port.y) || !directions[port.direction]
    || port.x < 2 || port.y < 2 || port.x >= columns - 2 || port.y >= rows - 2)) return undefined;
  const reserved = new Map<string, string>();
  for (const port of gridPorts) {
    const delta = directions[port.direction];
    for (const point of [port, { x: port.x + delta.x, y: port.y + delta.y }]) {
      if (reserved.has(key(point)) && reserved.get(key(point)) !== port.net) return undefined;
      reserved.set(key(point), port.net);
    }
  }
  const used = new Map<string, Map<string, number>>();
  const groups = new Map<string, RoutingPort[]>();
  for (const port of gridPorts) groups.set(port.net, [...(groups.get(port.net) ?? []), port]);
  const output: RoutedNet[] = [];
  // Establish the supply/return rails first, then the small local connections.
  const entries = [...groups].sort(([a, ap], [b, bp]) => Number(rails.has(b)) - Number(rails.has(a)) || ap.length - bp.length || a.localeCompare(b));
  for (const [net, terminals] of entries) {
    const tree = new Map<string, GridPoint>();
    const paths: GridPoint[][] = [];
    const masks = new Map<string, number>();
    const addMask = (point: GridPoint, mask: number) => {
      const id = key(point); const value = (masks.get(id) ?? 0) | mask;
      masks.set(id, value);
      const owners = used.get(id) ?? new Map<string, number>(); owners.set(net, value); used.set(id, owners);
      tree.set(id, point);
    };
    const addPath = (points: GridPoint[]) => {
      paths.push(points);
      for (let i = 0; i < points.length; i++) {
        let mask = 0;
        for (const neighbor of [points[i - 1], points[i + 1]]) {
          if (!neighbor) continue;
          const direction = directions.findIndex((d) => points[i].x + d.x === neighbor.x && points[i].y + d.y === neighbor.y);
          mask |= 1 << direction;
        }
        addMask(points[i], mask);
      }
    };
    const rail = rails.get(net);
    if (rail !== undefined && terminals.length > 1) {
      const y = rail / 20;
      const minX = Math.min(...terminals.map((p) => p.x)); const maxX = Math.max(...terminals.map((p) => p.x));
      if (!Number.isInteger(y) || y < 2 || y >= rows - 2) return undefined;
      const points = Array.from({ length: maxX - minX + 1 }, (_, offset) => ({ x: minX + offset, y }));
      if (points.some((point) => blocked.has(key(point)) || used.has(key(point))
        || reserved.has(key(point)) && reserved.get(key(point)) !== net)) return undefined;
      addPath(points);
    } else {
      const first = terminals[0]; const d = directions[first.direction];
      const end = { x: first.x + d.x, y: first.y + d.y };
      if (blocked.has(key(end)) || reserved.get(key(end)) !== net || used.has(key(first)) || used.has(key(end))) return undefined;
      addPath([first, end]);
    }
    for (const terminal of terminals) {
      if (tree.has(key(terminal))) { addMask(terminal, 1 << ((terminal.direction + 2) % 4)); continue; }
      const targets = [...tree.values()].filter((point) => used.get(key(point))?.size === 1);
      const minX = Math.min(...targets.map((p) => p.x)); const maxX = Math.max(...targets.map((p) => p.x));
      const minY = Math.min(...targets.map((p) => p.y)); const maxY = Math.max(...targets.map((p) => p.y));
      const heuristic = (x: number, y: number) => Math.max(minX - x, 0, x - maxX) + Math.max(minY - y, 0, y - maxY);
      const costs = new Float64Array(columns * rows * 4).fill(Infinity);
      const previous = new Int32Array(costs.length).fill(-1);
      const encode = (x: number, y: number, d: number) => (y * columns + x) * 4 + d;
      const decode = (state: number) => ({ x: Math.floor(state / 4) % columns, y: Math.floor(state / (columns * 4)), direction: state % 4 });
      const start = encode(terminal.x, terminal.y, terminal.direction);
      costs[start] = 0;
      const queue = new MinHeap(); queue.push({ state: start, cost: 0, score: heuristic(terminal.x, terminal.y) });
      let finish: number | undefined;
      // Each grid/direction state has a nonnegative cost; at most 160,000 states.
      for (let entry = queue.pop(); entry; entry = queue.pop()) {
        if (entry.cost !== costs[entry.state]) continue;
        if (--expansionsLeft < 0) return undefined;
        const point = decode(entry.state); const id = key(point);
        const foreign = [...(used.get(id) ?? [])].filter(([owner]) => owner !== net);
        if (tree.has(id) && !foreign.length) { finish = entry.state; break; }
        for (const [direction, delta] of directions.entries()) {
          if (direction === (point.direction + 2) % 4 || foreign.length && direction !== point.direction) continue;
          const next = { x: point.x + delta.x, y: point.y + delta.y }; const nextId = key(next);
          if (nextId === key(terminal)) continue;
          if (next.x < 2 || next.y < 2 || next.x >= columns - 2 || next.y >= rows - 2 || blocked.has(nextId)) continue;
          if (reserved.has(nextId) && reserved.get(nextId) !== net) continue;
          const other = [...(used.get(nextId) ?? [])].filter(([owner]) => owner !== net);
          // A horizontal line has mask 0101; a vertical line has mask 1010.
          if (other.some(([, mask]) => mask !== (direction % 2 === 0 ? 10 : 5))) continue;
          const nextState = encode(next.x, next.y, direction);
          const cost = entry.cost + 1 + (direction === point.direction ? 0 : 3) + other.length * 12;
          if (cost >= costs[nextState]) continue;
          costs[nextState] = cost; previous[nextState] = entry.state;
          queue.push({ state: nextState, cost, score: cost + heuristic(next.x, next.y) });
        }
      }
      if (finish === undefined) return undefined;
      const points: GridPoint[] = [];
      for (let state = finish; state !== -1; state = previous[state]) points.push(decode(state));
      addPath(points.reverse());
      addMask(terminal, 1 << ((terminal.direction + 2) % 4));
    }
    // A terminal can join another branch before reaching a supply rail. Trim
    // unused rail ends so that they do not look like additional open leads.
    if (rail !== undefined && terminals.length > 1) {
      const y = rail / 20;
      const contacts = [...paths.slice(1).flat(), ...terminals].filter((point) => point.y === y);
      const firstX = Math.min(...contacts.map((point) => point.x));
      const lastX = Math.max(...contacts.map((point) => point.x));
      const original = paths[0];
      if (contacts.length) {
        paths[0] = original.filter((point) => point.x >= firstX && point.x <= lastX);
        for (const point of original) {
          const id = key(point); let mask = masks.get(id)!;
          if (point.x < firstX || point.x > lastX) {
            masks.delete(id); tree.delete(id); used.get(id)!.delete(net);
            if (!used.get(id)!.size) used.delete(id);
          } else {
            if (point.x === firstX && firstX > original[0].x) mask &= ~4;
            if (point.x === lastX && lastX < original.at(-1)!.x) mask &= ~1;
            masks.set(id, mask); used.get(id)!.set(net, mask);
          }
        }
      }
    }
    const scale = (point: GridPoint) => ({ x: point.x * 20, y: point.y * 20 });
    output.push({ net, paths: paths.map((points) => points.map(scale)), junctions: [...masks]
      .filter(([, mask]) => [7, 11, 13, 14, 15].includes(mask)).map(([id]) => scale(tree.get(id)!)) });
  }
  return output;
}

export function orthogonalPath(points: GridPoint[]): string {
  let d = `M${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const before = points[i - 1]; const point = points[i]; const after = points[i + 1];
    if (after && (before.x === point.x && point.x === after.x && (point.y - before.y) * (after.y - point.y) > 0
      || before.y === point.y && point.y === after.y && (point.x - before.x) * (after.x - point.x) > 0)) continue;
    d += before.x === point.x ? `V${point.y}` : `H${point.x}`;
  }
  return d;
}
