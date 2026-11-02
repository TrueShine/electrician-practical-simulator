/**
 * 상태를 가진 시뮬레이터. UI·채점기가 공통으로 사용한다.
 * 모든 조작 후 즉시 solve() 로 안정 상태까지 계산한다.
 */
import { buildNetlist, type Netlist } from './netlist';
import { solve, type SolveResult } from './solver';
import type { Circuit, EngineError } from './types';
import type { SocketPinmaps } from '../components/library';

export interface SimulatorState {
  power: boolean;
  pressed: ReadonlySet<string>;
  toggled: ReadonlySet<string>;
  coils: ReadonlySet<string>;
  outputs: ReadonlyMap<string, boolean>;
  /** 이번 조작에서 발생한 오류 (단락·발진) */
  errors: EngineError[];
  /** 회로 구성 오류 (없는 단자, 핀맵 미확인 등) */
  netlistErrors: EngineError[];
}

export class Simulator {
  readonly netlist: Netlist;
  private power = false;
  private pressed = new Set<string>();
  private toggled = new Set<string>();
  private last: SolveResult;

  constructor(circuit: Circuit, socketPinmaps?: SocketPinmaps) {
    this.netlist = buildNetlist(circuit, socketPinmaps);
    this.last = solve(this.netlist, this.inputs());
  }

  private inputs() {
    return { power: this.power, pressed: this.pressed, toggled: this.toggled };
  }

  private mccbIds(): string[] {
    return this.netlist.components.filter((c) => c.kind === 'MCCB').map((c) => c.id);
  }

  private update(): SimulatorState {
    this.last = solve(this.netlist, this.inputs(), this.last.coils);
    if (this.last.tripped) {
      // 트립: MCCB 를 OFF 로 내리고 전원이 끊긴 상태로 다시 계산
      const errors = this.last.errors;
      for (const id of this.mccbIds()) this.toggled.delete(id);
      if (this.mccbIds().length === 0) this.power = false;
      this.last = solve(this.netlist, this.inputs(), this.last.coils);
      this.last.errors = [...errors, ...this.last.errors];
    }
    return this.getState();
  }

  /** 전원 투입: 시험 전원 공급 + 모든 MCCB ON */
  powerOn(): SimulatorState {
    this.power = true;
    for (const id of this.mccbIds()) this.toggled.add(id);
    return this.update();
  }

  powerOff(): SimulatorState {
    this.power = false;
    return this.update();
  }

  press(id: string): SimulatorState {
    this.pressed.add(id);
    return this.update();
  }

  release(id: string): SimulatorState {
    this.pressed.delete(id);
    return this.update();
  }

  /** 유지형 스위치(LS, MCCB) 상태 지정 */
  setToggle(id: string, on: boolean): SimulatorState {
    if (on) this.toggled.add(id);
    else this.toggled.delete(id);
    return this.update();
  }

  getState(): SimulatorState {
    return {
      power: this.power,
      pressed: new Set(this.pressed),
      toggled: new Set(this.toggled),
      coils: new Set(this.last.coils),
      outputs: new Map(this.last.outputs),
      errors: [...this.last.errors],
      netlistErrors: [...this.netlist.errors],
    };
  }

  /** 기구 동작 여부: 코일은 여자, 램프·부저는 점등/울림 */
  isOn(id: string): boolean {
    return this.last.coils.has(id) || this.last.outputs.get(id) === true;
  }
}
