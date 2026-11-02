/**
 * 통전 경로 계산, 코일 여자, 접점 갱신 반복.
 *
 * 규칙
 * - 닫힌 접점은 저항 0 의 도체(간선)로 본다.
 * - 부하(코일·램프·부저)는 한쪽 끝이 L, 다른 쪽 끝이 N 과 도체로 이어질 때만 동작한다.
 *   (부하 2개가 직렬이면 둘 다 동작하지 않는 것으로 본다.)
 * - 부하 없이 L 과 N 이 도체로 이어지면 단락 → MCCB 트립(전원 차단).
 * - 코일 상태 → 접점 갱신 → 재계산을 수렴할 때까지 반복한다.
 *   한 번에 코일 하나씩(기구 정의 순서상 앞의 것부터) 바꾸므로 결과가 결정적이다.
 *   MAX_ITERATIONS 를 넘으면 발진(채터링)으로 판정한다.
 */
import { UnionFind, type Netlist } from './netlist';
import type { ComponentKind, EngineError, Inputs } from './types';

export const MAX_ITERATIONS = 50;

export interface SolveResult {
  /** 여자된 코일의 기구 ID */
  coils: Set<string>;
  /** 표시등·부저 등 출력 부하 동작 여부 (기구 ID → 동작) */
  outputs: Map<string, boolean>;
  /** 단락으로 트립이 일어났는지 */
  tripped: boolean;
  oscillation: boolean;
  iterations: number;
  errors: EngineError[];
}

function kindMap(netlist: Netlist): Map<string, ComponentKind> {
  return new Map(netlist.components.map((c) => [c.id, c.kind]));
}

function isActuated(owner: string, kind: ComponentKind | undefined, coils: ReadonlySet<string>, inputs: Inputs): boolean {
  switch (kind) {
    case 'MC':
    case 'X':
      return coils.has(owner);
    case 'PB':
      return inputs.pressed.has(owner);
    case 'LS':
    case 'MCCB':
      return inputs.toggled.has(owner);
    case 'F':
      return true;
    default:
      return false;
  }
}

interface Evaluation {
  short: boolean;
  /** 동작하는 부하의 기구 ID */
  energized: Set<string>;
}

function evaluate(
  netlist: Netlist,
  kinds: Map<string, ComponentKind>,
  coils: ReadonlySet<string>,
  inputs: Inputs,
  powered: boolean,
): Evaluation {
  const uf = new UnionFind(netlist.nodeCount);
  for (const c of netlist.contacts) {
    const actuated = isActuated(c.owner, kinds.get(c.owner), coils, inputs);
    const closed = c.form === 'a' ? actuated : !actuated;
    if (closed) uf.union(c.nodes[0], c.nodes[1]);
  }

  const energized = new Set<string>();
  if (!powered) return { short: false, energized };

  const l = uf.find(netlist.lNode);
  const n = uf.find(netlist.nNode);
  if (l === n) return { short: true, energized };

  for (const load of netlist.loads) {
    const a = uf.find(load.nodes[0]);
    const b = uf.find(load.nodes[1]);
    if ((a === l && b === n) || (a === n && b === l)) energized.add(load.owner);
  }
  return { short: false, energized };
}

export function solve(netlist: Netlist, inputs: Inputs, prevCoils: ReadonlySet<string> = new Set()): SolveResult {
  const kinds = kindMap(netlist);
  const coilOwners = netlist.loads.filter((l) => l.role === 'coil').map((l) => l.owner);
  const coils = new Set([...prevCoils].filter((c) => coilOwners.includes(c)));
  const errors: EngineError[] = [];

  let powered = inputs.power;
  let tripped = false;
  let oscillation = false;
  let iterations = 0;
  let ev = evaluate(netlist, kinds, coils, inputs, powered);

  while (true) {
    if (ev.short) {
      tripped = true;
      powered = false;
      errors.push({ code: 'short', message: '단락: 부하 없이 L과 N이 연결되어 MCCB가 트립되었습니다.' });
      ev = evaluate(netlist, kinds, coils, inputs, powered);
      continue;
    }

    const changed = coilOwners.find((id) => ev.energized.has(id) !== coils.has(id));
    if (changed === undefined) break;

    if (iterations >= MAX_ITERATIONS) {
      oscillation = true;
      errors.push({
        code: 'oscillation',
        message: `발진(채터링): ${MAX_ITERATIONS}회 반복해도 코일 상태가 안정되지 않습니다. 자기 b접점으로 코일을 끊는 회로가 없는지 확인하세요.`,
      });
      break;
    }

    if (coils.has(changed)) coils.delete(changed);
    else coils.add(changed);
    iterations++;
    ev = evaluate(netlist, kinds, coils, inputs, powered);
  }

  const outputs = new Map<string, boolean>();
  for (const load of netlist.loads) {
    if (load.role !== 'coil') outputs.set(load.owner, ev.energized.has(load.owner));
  }

  return { coils, outputs, tripped, oscillation, iterations, errors };
}
