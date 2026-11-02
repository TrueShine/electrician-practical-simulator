/**
 * 시나리오 기반 채점.
 * 사용자 결선으로 각 시나리오를 실행해 모든 기대 결과가 맞으면 통과 (동작 동등성).
 * 배선 경로가 정답과 달라도 동작이 같으면 정답이다.
 */
import {
  behaviorDiagnostics,
  connectionDiagnostics,
  engineDiagnostics,
  type Diagnostic,
} from './diagnostics';
import { buildNetlist } from './netlist';
import { runScenarios, type Scenario } from './scenario';
import type { ComponentKind, ComponentSpec, Wire } from './types';
import type { SocketPinmaps } from '../components/library';

export interface GradeInput {
  components: ComponentSpec[];
  givenWires?: Wire[];
  answerWires: Wire[];
  scenarios: Scenario[];
}

export interface ScenarioGrade {
  name: string;
  passed: boolean;
  /** "기대: RL 점등 / 실제: 소등" 형태 */
  failures: string[];
}

export interface GradeResult {
  passed: boolean;
  scenarios: ScenarioGrade[];
  /** 동작에 영향을 주는 문제 */
  errors: Diagnostic[];
  /** 감점 경고 (불합격 판정 아님) */
  warnings: Diagnostic[];
}

const WORDS: Partial<Record<ComponentKind, [string, string]>> = {
  LAMP: ['점등', '소등'],
  BZ: ['울림', '정지'],
  M: ['운전', '정지'],
  MC: ['여자', '소자'],
  X: ['여자', '소자'],
  T: ['여자', '소자'],
  FR: ['여자', '소자'],
};

export function stateWord(kind: ComponentKind | undefined, on: boolean): string {
  const w = (kind && WORDS[kind]) ?? ['동작', '정지'];
  return on ? w[0] : w[1];
}

export function grade(input: GradeInput, userWires: Wire[], socketPinmaps?: SocketPinmaps): GradeResult {
  const given = input.givenWires ?? [];
  const answerCircuit = { components: input.components, wires: [...given, ...input.answerWires] };
  const userAll = [...given, ...userWires];
  const userCircuit = { components: input.components, wires: userAll };

  const answerNet = buildNetlist(answerCircuit, socketPinmaps);
  const userNet = buildNetlist(userCircuit, socketPinmaps);

  const errors: Diagnostic[] = userNet.errors.map((e) => ({
    kind: e.code === 'pinmap_missing' ? 'pinmap_missing' : 'unknown_terminal',
    severity: 'error',
    message: e.message,
    terminals: [],
  }));

  const kindOf = new Map(input.components.map((c) => [c.id, c.kind]));
  const answerRuns = runScenarios(answerCircuit, input.scenarios, socketPinmaps);
  const userRuns = runScenarios(userCircuit, input.scenarios, socketPinmaps);

  const scenarios: ScenarioGrade[] = userRuns.map((run) => ({
    name: run.name,
    passed: run.passed,
    failures: run.checks
      .filter((c) => !c.ok)
      .map((c) => {
        const kind = kindOf.get(c.target);
        return `기대: ${c.target} ${stateWord(kind, c.expected === 'on')} / 실제: ${stateWord(kind, c.actual === 'on')}`;
      }),
  }));

  const behaviorOk = scenarios.every((s) => s.passed) && errors.length === 0;

  errors.push(...engineDiagnostics(userRuns));
  errors.push(...behaviorDiagnostics(answerRuns, userRuns, input.components));

  const connection = connectionDiagnostics(answerNet, userNet, userAll, !behaviorOk);
  errors.push(...connection.filter((d) => d.severity === 'error'));
  const warnings = connection.filter((d) => d.severity === 'warning');

  return { passed: behaviorOk && errors.length === 0, scenarios, errors, warnings };
}
