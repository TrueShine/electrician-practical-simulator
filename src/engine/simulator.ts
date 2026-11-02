/**
 * 상태를 가진 시뮬레이터. UI·채점기가 공통으로 사용한다.
 * 모든 조작 후 즉시 solve() 로 안정 상태까지 계산한다.
 * 시간은 advance(ms) 로만 흐른다 (가상 시계).
 */
import { VirtualClock } from './clock';
import { buildNetlist, type Netlist } from './netlist';
import { emptyDynamicState, nextEventTime, nodePotentials, solve, type SolveResult } from './solver';
import type { Circuit, EngineError, FlsLevel } from './types';
import type { SocketPinmaps } from '../components/library';

/** advance() 한 번에 처리할 최대 이벤트 수 (플리커 주기가 너무 짧을 때 보호) */
const MAX_EVENTS_PER_ADVANCE = 100_000;

export interface SimulatorState {
  now: number;
  power: boolean;
  pressed: ReadonlySet<string>;
  toggled: ReadonlySet<string>;
  levels: ReadonlyMap<string, FlsLevel>;
  coils: ReadonlySet<string>;
  /** 코일 ID → 여자 시작 시각(ms) */
  since: ReadonlyMap<string, number>;
  outputs: ReadonlyMap<string, boolean>;
  /** 노드별 전위 (1 = L, -1 = N, 0 = 없음). netlist.nodeOf 로 단자 → 노드 */
  potentials: Int8Array;
  /** 마지막 조작에서 발생한 오류 (단락·발진) */
  errors: EngineError[];
  /** 회로 구성 오류 (없는 단자, 핀맵 미확인 등) */
  netlistErrors: EngineError[];
}

export class Simulator {
  readonly netlist: Netlist;
  private readonly clock = new VirtualClock();
  private power = false;
  private pressed = new Set<string>();
  private toggled = new Set<string>();
  private levels = new Map<string, FlsLevel>();
  private last: SolveResult;
  private errors: EngineError[] = [];

  constructor(circuit: Circuit, socketPinmaps?: SocketPinmaps) {
    this.netlist = buildNetlist(circuit, socketPinmaps);
    this.last = solve(this.netlist, this.inputs(), emptyDynamicState(), 0);
  }

  private inputs() {
    return { power: this.power, pressed: this.pressed, toggled: this.toggled, levels: this.levels };
  }

  private mccbIds(): string[] {
    return this.netlist.components.filter((c) => c.kind === 'MCCB').map((c) => c.id);
  }

  /** 현재 시각에서 안정 상태를 다시 계산. 발생한 오류는 누적 */
  private resolve(): void {
    this.last = solve(this.netlist, this.inputs(), this.last, this.clock.now);
    this.errors.push(...this.last.errors);
    if (this.last.tripped) {
      // 트립: MCCB 를 OFF 로 내리고 전원이 끊긴 상태로 다시 계산
      for (const id of this.mccbIds()) this.toggled.delete(id);
      if (this.mccbIds().length === 0) this.power = false;
      this.last = solve(this.netlist, this.inputs(), this.last, this.clock.now);
      this.errors.push(...this.last.errors);
    }
  }

  /** 조작 하나를 적용하고 상태를 돌려준다. errors 는 이 조작에서 생긴 것만 담는다. */
  private act(fn: () => void): SimulatorState {
    this.errors = [];
    fn();
    this.resolve();
    return this.getState();
  }

  /** 전원 투입: 시험 전원 공급 + 모든 MCCB ON */
  powerOn(): SimulatorState {
    return this.act(() => {
      this.power = true;
      for (const id of this.mccbIds()) this.toggled.add(id);
    });
  }

  powerOff(): SimulatorState {
    return this.act(() => {
      this.power = false;
    });
  }

  press(id: string): SimulatorState {
    return this.act(() => this.pressed.add(id));
  }

  release(id: string): SimulatorState {
    return this.act(() => this.pressed.delete(id));
  }

  /** 유지형 입력 지정: MCCB ON, LS 감지, SS 두 번째 위치, EOCR 트립 */
  setToggle(id: string, on: boolean): SimulatorState {
    return this.act(() => {
      if (on) this.toggled.add(id);
      else this.toggled.delete(id);
    });
  }

  setLevel(id: string, level: FlsLevel): SimulatorState {
    return this.act(() => this.levels.set(id, level));
  }

  /** 가상 시간을 ms 만큼 진행. 그 사이의 타이머·플리커 이벤트를 순서대로 처리한다. */
  advance(ms: number): SimulatorState {
    this.errors = [];
    const target = this.clock.now + Math.max(0, ms);
    for (let i = 0; i < MAX_EVENTS_PER_ADVANCE; i++) {
      const next = nextEventTime(this.netlist, this.last, this.clock.now);
      if (next === undefined || next > target) break;
      this.clock.set(next);
      this.resolve();
    }
    this.clock.set(target);
    this.resolve();
    return this.getState();
  }

  getState(): SimulatorState {
    return {
      now: this.clock.now,
      power: this.power,
      pressed: new Set(this.pressed),
      toggled: new Set(this.toggled),
      levels: new Map(this.levels),
      coils: new Set(this.last.coils),
      since: new Map(this.last.since),
      outputs: new Map(this.last.outputs),
      potentials: nodePotentials(this.netlist, this.inputs(), this.last, this.clock.now),
      errors: [...this.errors],
      netlistErrors: [...this.netlist.errors],
    };
  }

  /** 기구 동작 여부: 코일은 여자, 램프·부저는 점등/울림 */
  isOn(id: string): boolean {
    return this.last.coils.has(id) || this.last.outputs.get(id) === true;
  }
}
