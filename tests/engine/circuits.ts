/**
 * 테스트용 회로. 공개문제 정답이 아니라 엔진 검증용 기본 회로이며,
 * 핀 이름은 논리 핀맵(A1/A2, a1-1 …)을 사용한다.
 */
import type { Circuit, Wire } from '../../src/engine/types';

/** 전원 → MCCB → (제어 모선 P = MCCB.2, 공통선 = MCCB.4) */
const powerWires: Wire[] = [
  ['L', 'MCCB.1'],
  ['N', 'MCCB.3'],
];

/**
 * 자기유지 회로
 * MCCB.2 ─ PB0(b, 정지) ─ PB1(a, 기동) ─ MC1 코일 ─ MCCB.4
 *                         └ MC1 a1 (자기유지) ┘
 * MC1 a2 → RL(운전), MC1 b1 → GL(정지)
 */
export function selfHoldCircuit(opts: { withSelfHold?: boolean } = {}): Circuit {
  const withSelfHold = opts.withSelfHold ?? true;
  const wires: Wire[] = [
    ...powerWires,
    ['MCCB.2', 'PB0.1'],
    ['PB0.2', 'PB1.1'],
    ['PB1.2', 'MC1.A1'],
    ['MC1.A2', 'MCCB.4'],
    // RL: MC1 a2
    ['MCCB.2', 'MC1.a2-1'],
    ['MC1.a2-2', 'RL.1'],
    ['RL.2', 'MCCB.4'],
    // GL: MC1 b1
    ['MCCB.2', 'MC1.b1-1'],
    ['MC1.b1-2', 'GL.1'],
    ['GL.2', 'MCCB.4'],
  ];
  if (withSelfHold) {
    wires.push(['PB1.1', 'MC1.a1-1'], ['PB1.2', 'MC1.a1-2']);
  }
  return {
    components: [
      { id: 'MCCB', kind: 'MCCB' },
      { id: 'PB0', kind: 'PB', contact: 'b' },
      { id: 'PB1', kind: 'PB', contact: 'a' },
      { id: 'MC1', kind: 'MC', aContacts: 2, bContacts: 1 },
      { id: 'RL', kind: 'LAMP', color: 'red' },
      { id: 'GL', kind: 'LAMP', color: 'green' },
    ],
    wires,
  };
}

/**
 * 정역 운전 회로 (인터록)
 * 정회전: PB0 ─ PB1 ─ MC2 b1 ─ MC1 코일, MC1 a1 자기유지
 * 역회전: PB0 ─ PB2 ─ MC1 b1 ─ MC2 코일, MC2 a1 자기유지
 */
export function interlockCircuit(opts: { withInterlock?: boolean } = {}): Circuit {
  const withInterlock = opts.withInterlock ?? true;
  const wires: Wire[] = [
    ...powerWires,
    ['MCCB.2', 'PB0.1'],
    // 정회전
    ['PB0.2', 'PB1.1'],
    ['PB1.1', 'MC1.a1-1'],
    ['PB1.2', 'MC1.a1-2'],
    ['MC1.A2', 'MCCB.4'],
    // 역회전
    ['PB0.2', 'PB2.1'],
    ['PB2.1', 'MC2.a1-1'],
    ['PB2.2', 'MC2.a1-2'],
    ['MC2.A2', 'MCCB.4'],
  ];
  if (withInterlock) {
    wires.push(['PB1.2', 'MC2.b1-1'], ['MC2.b1-2', 'MC1.A1']);
    wires.push(['PB2.2', 'MC1.b1-1'], ['MC1.b1-2', 'MC2.A1']);
  } else {
    wires.push(['PB1.2', 'MC1.A1'], ['PB2.2', 'MC2.A1']);
  }
  return {
    components: [
      { id: 'MCCB', kind: 'MCCB' },
      { id: 'PB0', kind: 'PB', contact: 'b' },
      { id: 'PB1', kind: 'PB', contact: 'a' },
      { id: 'PB2', kind: 'PB', contact: 'a' },
      { id: 'MC1', kind: 'MC', aContacts: 1, bContacts: 1 },
      { id: 'MC2', kind: 'MC', aContacts: 1, bContacts: 1 },
    ],
    wires,
  };
}
