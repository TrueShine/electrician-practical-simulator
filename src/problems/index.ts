/**
 * 문제 목록.
 * 공개문제 1~18번은 데이터가 아직 없다 (TODO: 공개도면 기준으로 사용자와 함께 입력).
 * 새 문제는 JSON 파일을 추가하고 아래 PROBLEMS 에 등록한다. 형식은 _template.json 참고.
 */
import type { Circuit } from '../engine/types';
import exampleMotor from './example-motor.json';
import exampleWater from './example-water.json';
import type { Problem, ProblemStub } from './types';

export const PROBLEMS: Problem[] = [exampleMotor as Problem, exampleWater as Problem];

/** 공개문제 자리 (1~9 급배수, 10~18 전동기 제어). 데이터가 들어오면 PROBLEMS 로 옮긴다. */
export const OFFICIAL_STUBS: ProblemStub[] = Array.from({ length: 18 }, (_, i) => {
  const no = i + 1;
  const type = no <= 9 ? 'water' : 'motor';
  return {
    id: `open-${String(no).padStart(2, '0')}`,
    title: `공개문제 ${no}번 (${type === 'water' ? '급배수' : '전동기 제어'})`,
    type,
    official: true,
    pending: true,
  } as ProblemStub;
}).filter((stub) => !PROBLEMS.some((p) => p.id === stub.id));

export function findProblem(id: string): Problem | undefined {
  return PROBLEMS.find((p) => p.id === id);
}

/** 정답 회로 (미리 연결된 전선 + 정답 전선) */
export function answerCircuit(problem: Problem): Circuit {
  return { components: problem.components, wires: [...(problem.givenWires ?? []), ...problem.answerWires] };
}

/** 사용자 결선 회로 */
export function userCircuit(problem: Problem, userWires: Circuit['wires']): Circuit {
  return { components: problem.components, wires: [...(problem.givenWires ?? []), ...userWires] };
}
