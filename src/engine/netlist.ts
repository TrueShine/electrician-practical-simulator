/**
 * 단자·전선 → 노드(등전위) 병합.
 * 전선으로 연결된 단자들을 Union-Find 로 하나의 노드로 묶는다.
 */
import { buildComponent, type SocketPinmaps } from '../components/library';
import {
  POWER_L,
  POWER_N,
  type Circuit,
  type ComponentSpec,
  type ContactElement,
  type EngineError,
  type LoadElement,
} from './types';

export class UnionFind {
  private parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }

  find(x: number): number {
    let root = x;
    while (this.parent[root] !== root) root = this.parent[root];
    // 경로 압축
    while (this.parent[x] !== root) {
      const next = this.parent[x];
      this.parent[x] = root;
      x = next;
    }
    return root;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    // 결정성을 위해 항상 작은 번호를 루트로
    if (ra < rb) this.parent[rb] = ra;
    else if (rb < ra) this.parent[ra] = rb;
  }
}

/** 노드 번호로 변환된 부하 */
export interface NetLoad {
  owner: string;
  role: LoadElement['role'];
  nodes: [number, number];
}

/** 노드 번호로 변환된 접점 */
export interface NetContact {
  owner: string;
  form: ContactElement['form'];
  nodes: [number, number];
}

export interface Netlist {
  components: ComponentSpec[];
  /** 단자 ID → 노드 번호 */
  nodeOf: Map<string, number>;
  nodeCount: number;
  lNode: number;
  nNode: number;
  loads: NetLoad[];
  contacts: NetContact[];
  errors: EngineError[];
}

export function buildNetlist(circuit: Circuit, socketPinmaps?: SocketPinmaps): Netlist {
  const errors: EngineError[] = [];
  const terminalIndex = new Map<string, number>();
  const addTerminal = (id: string) => {
    if (!terminalIndex.has(id)) terminalIndex.set(id, terminalIndex.size);
  };
  addTerminal(POWER_L);
  addTerminal(POWER_N);

  const loadEls: LoadElement[] = [];
  const contactEls: ContactElement[] = [];

  for (const spec of circuit.components) {
    const built = buildComponent(spec, socketPinmaps);
    errors.push(...built.errors);
    for (const term of built.terminals) addTerminal(term);
    for (const el of built.elements) {
      if (el.type === 'load') loadEls.push(el);
      else contactEls.push(el);
    }
  }

  const uf = new UnionFind(terminalIndex.size);
  for (const [a, b] of circuit.wires) {
    const ia = terminalIndex.get(a);
    const ib = terminalIndex.get(b);
    if (ia === undefined || ib === undefined) {
      const missing = [a, b].filter((x) => !terminalIndex.has(x)).join(', ');
      errors.push({ code: 'unknown_terminal', message: `존재하지 않는 단자에 전선이 연결되어 있습니다: ${missing}` });
      continue;
    }
    uf.union(ia, ib);
  }

  // 루트 번호를 0..n-1 의 조밀한 노드 번호로 재매핑 (단자 등록 순서 기준 → 결정적)
  const rootToNode = new Map<number, number>();
  const nodeOf = new Map<string, number>();
  for (const [term, idx] of terminalIndex) {
    const root = uf.find(idx);
    let node = rootToNode.get(root);
    if (node === undefined) {
      node = rootToNode.size;
      rootToNode.set(root, node);
    }
    nodeOf.set(term, node);
  }

  const n = (term: string) => nodeOf.get(term)!;

  return {
    components: circuit.components,
    nodeOf,
    nodeCount: rootToNode.size,
    lNode: n(POWER_L),
    nNode: n(POWER_N),
    loads: loadEls.map((el) => ({ owner: el.owner, role: el.role, nodes: [n(el.terminals[0]), n(el.terminals[1])] })),
    contacts: contactEls.map((el) => ({
      owner: el.owner,
      form: el.form,
      nodes: [n(el.terminals[0]), n(el.terminals[1])],
    })),
    errors,
  };
}
