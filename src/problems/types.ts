import type { ComponentSpec, Wire } from '../engine/types';
import type { Scenario } from '../engine/scenario';

export interface Problem {
  id: string;
  title: string;
  /** motor: 전동기 제어, water: 급배수 */
  type: 'motor' | 'water';
  /** 공개문제 데이터인지 (false 면 엔진·화면 검증용 예시) */
  official: boolean;
  description?: string;
  components: ComponentSpec[];
  /** 결선 연습에서 미리 연결해 두는 전선 (전원 인입 등). 사용자가 지울 수 없다. */
  givenWires?: Wire[];
  /** 정답 결선 (givenWires 제외) */
  answerWires: Wire[];
  scenarios: Scenario[];
}

/** 아직 데이터가 없는 공개문제 자리 */
export interface ProblemStub {
  id: string;
  title: string;
  type: 'motor' | 'water';
  official: true;
  pending: true;
}
