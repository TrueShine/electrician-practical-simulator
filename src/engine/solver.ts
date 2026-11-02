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
 *
 * 시간 요소 (now = 가상 시계 ms)
 * - T: 코일 여자 후 setMs 가 지나면 한시 접점 동작. 순시 접점은 즉시 동작.
 * - FR: 코일 여자 중 periodMs 마다 접점 반전. 여자 직후에는 a접점이 닫힌 상태로 시작.
 * - FLS: 전원(코일 단자) 공급 + 수위 조건으로 내부 릴레이 동작.
 *        고수위 → 동작, 저수위 → 복귀, 중간 수위 → 이전 상태 유지.
 * - EOCR: 접점은 트립 상태(inputs.toggled)로만 바뀐다. 트립 시 a 닫힘, b 열림.
 */
import { UnionFind, type Netlist } from './netlist';
import type { ComponentKind, ComponentSpec, EngineError, Inputs } from './types';

export const MAX_ITERATIONS = 50;
export const DEFAULT_TIMER_MS = 3000;
export const DEFAULT_FLICKER_MS = 500;

/** 코일 상태 + 여자 시작 시각 (시간 요소 계산용) */
export interface DynamicState {
  coils: Set<string>;
  /** 코일 ID → 여자 시작 시각(ms) */
  since: Map<string, number>;
}

export function emptyDynamicState(): DynamicState {
  return { coils: new Set(), since: new Map() };
}

export interface SolveResult extends DynamicState {
  /** 표시등·부저 등 출력 부하 동작 여부 (기구 ID → 동작) */
  outputs: Map<string, boolean>;
  /** 단락으로 트립이 일어났는지 */
  tripped: boolean;
  oscillation: boolean;
  iterations: number;
  errors: EngineError[];
}

function specMap(netlist: Netlist): Map<string, ComponentSpec> {
  return new Map(netlist.components.map((c) => [c.id, c]));
}

function contactActuated(
  owner: string,
  spec: ComponentSpec | undefined,
  timed: boolean,
  dyn: DynamicState,
  inputs: Inputs,
  now: number,
): boolean {
  const kind: ComponentKind | undefined = spec?.kind;
  switch (kind) {
    case 'MC':
    case 'X':
    case 'FLS':
      return dyn.coils.has(owner);
    case 'T': {
      if (!dyn.coils.has(owner)) return false;
      if (!timed) return true;
      const since = dyn.since.get(owner) ?? now;
      return now - since >= (spec?.setMs ?? DEFAULT_TIMER_MS);
    }
    case 'FR': {
      if (!dyn.coils.has(owner)) return false;
      const since = dyn.since.get(owner) ?? now;
      const period = Math.max(1, spec?.periodMs ?? DEFAULT_FLICKER_MS);
      return Math.floor((now - since) / period) % 2 === 0;
    }
    case 'EOCR':
      return inputs.toggled.has(owner);
    case 'PB':
      return inputs.pressed.has(owner);
    case 'LS':
    case 'SS':
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
  /** 양단에 전압이 걸린 부하의 기구 ID */
  energized: Set<string>;
}

function evaluate(
  netlist: Netlist,
  specs: Map<string, ComponentSpec>,
  dyn: DynamicState,
  inputs: Inputs,
  now: number,
  powered: boolean,
): Evaluation {
  const uf = new UnionFind(netlist.nodeCount);
  for (const c of netlist.contacts) {
    const actuated = contactActuated(c.owner, specs.get(c.owner), c.timed, dyn, inputs, now);
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

/** 코일 단자에 전압이 걸린 상태에서 실제로 동작(여자)해야 하는지 */
function desiredCoil(id: string, spec: ComponentSpec | undefined, supplied: boolean, dyn: DynamicState, inputs: Inputs) {
  if (!supplied) return false;
  if (spec?.kind === 'FLS') {
    const level = inputs.levels.get(id) ?? 'low';
    if (level === 'high') return true;
    if (level === 'low') return false;
    return dyn.coils.has(id); // 중간 수위: 유지
  }
  return true;
}

export function solve(
  netlist: Netlist,
  inputs: Inputs,
  prev: DynamicState = emptyDynamicState(),
  now = 0,
): SolveResult {
  const specs = specMap(netlist);
  const coilOwners = netlist.loads.filter((l) => l.role === 'coil').map((l) => l.owner);
  const dyn: DynamicState = {
    coils: new Set([...prev.coils].filter((c) => coilOwners.includes(c))),
    since: new Map([...prev.since].filter(([c]) => coilOwners.includes(c))),
  };
  const errors: EngineError[] = [];

  let powered = inputs.power;
  let tripped = false;
  let oscillation = false;
  let iterations = 0;
  let ev = evaluate(netlist, specs, dyn, inputs, now, powered);

  while (true) {
    if (ev.short) {
      tripped = true;
      powered = false;
      errors.push({ code: 'short', message: '단락: 부하 없이 L과 N이 연결되어 MCCB가 트립되었습니다.' });
      ev = evaluate(netlist, specs, dyn, inputs, now, powered);
      continue;
    }

    const changed = coilOwners.find(
      (id) => desiredCoil(id, specs.get(id), ev.energized.has(id), dyn, inputs) !== dyn.coils.has(id),
    );
    if (changed === undefined) break;

    if (iterations >= MAX_ITERATIONS) {
      oscillation = true;
      errors.push({
        code: 'oscillation',
        message: `발진(채터링): ${MAX_ITERATIONS}회 반복해도 코일 상태가 안정되지 않습니다. 자기 b접점으로 코일을 끊는 회로가 없는지 확인하세요.`,
      });
      break;
    }

    if (dyn.coils.has(changed)) {
      dyn.coils.delete(changed);
      dyn.since.delete(changed);
    } else {
      dyn.coils.add(changed);
      dyn.since.set(changed, now);
    }
    iterations++;
    ev = evaluate(netlist, specs, dyn, inputs, now, powered);
  }

  const outputs = new Map<string, boolean>();
  for (const load of netlist.loads) {
    if (load.role !== 'coil') outputs.set(load.owner, ev.energized.has(load.owner));
  }

  return { ...dyn, outputs, tripped, oscillation, iterations, errors };
}

/**
 * now 이후 처음으로 시간 요소(타이머 만료, 플리커 반전)가 바뀌는 시각.
 * 없으면 undefined.
 */
export function nextEventTime(netlist: Netlist, dyn: DynamicState, now: number): number | undefined {
  let next: number | undefined;
  const consider = (t: number) => {
    if (t > now && (next === undefined || t < next)) next = t;
  };
  for (const spec of netlist.components) {
    if (!dyn.coils.has(spec.id)) continue;
    const since = dyn.since.get(spec.id) ?? now;
    if (spec.kind === 'T') {
      consider(since + (spec.setMs ?? DEFAULT_TIMER_MS));
    } else if (spec.kind === 'FR') {
      const period = Math.max(1, spec.periodMs ?? DEFAULT_FLICKER_MS);
      consider(since + (Math.floor((now - since) / period) + 1) * period);
    }
  }
  return next;
}
