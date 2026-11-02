/**
 * 시험장 동작 테스트 시나리오: 조작 순서와 기대 결과.
 * 채점(grader)과 진단(diagnostics)이 같은 실행 기록을 사용한다.
 */
import { Simulator, type SimulatorState } from './simulator';
import type { Circuit, EngineError, FlsLevel } from './types';
import type { SocketPinmaps } from '../components/library';

export type ExpectValue = 'on' | 'off';

export const DEFAULT_PRESS_MS = 300;

export type Step =
  | { action: 'power_on' }
  | { action: 'power_off' }
  /** 눌렀다 뗌 (기본 0.3초) */
  | { action: 'press'; target: string; durationMs?: number }
  /** 누른 채로 유지 */
  | { action: 'hold'; target: string }
  | { action: 'release'; target: string }
  /** 유지형 입력: MCCB ON, LS 감지, SS 두 번째 위치, EOCR 트립 */
  | { action: 'toggle'; target: string; value: boolean }
  | { action: 'set_level'; target: string; level: FlsLevel }
  | { action: 'wait'; ms: number }
  | { expect: Record<string, ExpectValue> };

export interface Scenario {
  name: string;
  steps: Step[];
}

export interface Check {
  stepIndex: number;
  target: string;
  expected: ExpectValue;
  actual: ExpectValue;
  ok: boolean;
}

export interface ScenarioRun {
  name: string;
  checks: Check[];
  /** 실행 중 발생한 엔진 오류 (단락·발진) */
  errors: EngineError[];
  /** 각 조작 직후 상태 (버튼을 누르고 있는 동안의 상태 포함) */
  samples: SimulatorState[];
  /** press 조작에서 버튼을 누르고 있던 동안의 상태 */
  pressSamples: { target: string; state: SimulatorState }[];
  passed: boolean;
}

const LEVEL_NAMES: Record<FlsLevel, string> = { low: '저수위', mid: '중간 수위', high: '고수위' };

export function describeStep(step: Step): string {
  if ('expect' in step) {
    return `확인: ${Object.entries(step.expect)
      .map(([id, v]) => `${id} ${v === 'on' ? '동작' : '정지'}`)
      .join(', ')}`;
  }
  switch (step.action) {
    case 'power_on':
      return '전원 투입';
    case 'power_off':
      return '전원 차단';
    case 'press':
      return `${step.target} 누름 (${((step.durationMs ?? DEFAULT_PRESS_MS) / 1000).toFixed(1)}초)`;
    case 'hold':
      return `${step.target} 누른 채 유지`;
    case 'release':
      return `${step.target} 뗌`;
    case 'toggle':
      return `${step.target} ${step.value ? 'ON' : 'OFF'}`;
    case 'set_level':
      return `${step.target} ${LEVEL_NAMES[step.level]}`;
    case 'wait':
      return `${(step.ms / 1000).toFixed(1)}초 대기`;
  }
}

/** 시나리오를 순서대로 같은 시뮬레이터에서 실행한다 (앞 시나리오의 상태가 이어짐). */
export function runScenarios(circuit: Circuit, scenarios: Scenario[], socketPinmaps?: SocketPinmaps): ScenarioRun[] {
  const sim = new Simulator(circuit, socketPinmaps);
  return scenarios.map((sc) => runOne(sim, sc));
}

function runOne(sim: Simulator, scenario: Scenario): ScenarioRun {
  const checks: Check[] = [];
  const errors: EngineError[] = [];
  const samples: SimulatorState[] = [];
  const pressSamples: { target: string; state: SimulatorState }[] = [];
  const record = (st: SimulatorState) => {
    errors.push(...st.errors);
    samples.push(st);
    return st;
  };

  scenario.steps.forEach((step, stepIndex) => {
    if ('expect' in step) {
      for (const [target, expected] of Object.entries(step.expect)) {
        const actual: ExpectValue = sim.isOn(target) ? 'on' : 'off';
        checks.push({ stepIndex, target, expected, actual, ok: actual === expected });
      }
      return;
    }
    switch (step.action) {
      case 'power_on':
        record(sim.powerOn());
        break;
      case 'power_off':
        record(sim.powerOff());
        break;
      case 'press': {
        record(sim.press(step.target));
        const held = record(sim.advance(step.durationMs ?? DEFAULT_PRESS_MS));
        pressSamples.push({ target: step.target, state: held });
        record(sim.release(step.target));
        break;
      }
      case 'hold':
        record(sim.press(step.target));
        break;
      case 'release':
        record(sim.release(step.target));
        break;
      case 'toggle':
        record(sim.setToggle(step.target, step.value));
        break;
      case 'set_level':
        record(sim.setLevel(step.target, step.level));
        break;
      case 'wait':
        record(sim.advance(step.ms));
        break;
    }
  });

  return {
    name: scenario.name,
    checks,
    errors,
    samples,
    pressSamples,
    passed: checks.every((c) => c.ok) && errors.length === 0,
  };
}
