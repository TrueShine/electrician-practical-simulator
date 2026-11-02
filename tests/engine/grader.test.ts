import { describe, expect, it } from 'vitest';
import { grade, type GradeInput } from '../../src/engine/grader';
import type { Wire } from '../../src/engine/types';
import { findProblem } from '../../src/problems';
import { interlockCircuit } from './circuits';

const motor = findProblem('example-motor')!;
const same = (a: Wire, b: Wire) => (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);
const without = (wires: Wire[], ...remove: Wire[]) => wires.filter((w) => !remove.some((r) => same(w, r)));
const kinds = (r: ReturnType<typeof grade>) => r.errors.map((e) => e.kind);

describe('채점', () => {
  it('정답 결선은 통과', () => {
    const r = grade(motor, motor.answerWires);
    expect(r.errors).toEqual([]);
    expect(r.passed).toBe(true);
    expect(r.scenarios.every((s) => s.passed)).toBe(true);
  });

  it('배선 경로가 달라도 동작이 같으면 정답 (RL 공통선을 T1.A2 대신 MCCB.4 에서 받음)', () => {
    const wires = [...without(motor.answerWires, ['T1.A2', 'RL.2']), ['MCCB.4', 'RL.2'] as Wire];
    const r = grade(motor, wires);
    expect(r.passed).toBe(true);
  });

  it('아무것도 결선하지 않으면 불합격, 실패 문구가 "기대/실제" 형식', () => {
    const r = grade(motor, []);
    expect(r.passed).toBe(false);
    expect(r.scenarios[0].failures).toContain('기대: GL 점등 / 실제: 소등');
  });
});

describe('오결선 진단', () => {
  it('① 단락: 부하 없이 L-N 직결', () => {
    const r = grade(motor, [...motor.answerWires, ['F.2', 'MCCB.4']]);
    expect(r.passed).toBe(false);
    expect(kinds(r)).toContain('short');
  });

  it('② 자기유지 누락', () => {
    const r = grade(motor, without(motor.answerWires, ['PB1.1', 'MC1.a1-1']));
    expect(r.passed).toBe(false);
    const d = r.errors.find((e) => e.kind === 'self_hold');
    expect(d?.message).toContain('MC1');
  });

  it('③ 인터록 누락', () => {
    const input: GradeInput = {
      components: interlockCircuit().components,
      answerWires: interlockCircuit().wires,
      scenarios: [
        {
          name: '정회전 중 역회전 버튼',
          steps: [
            { action: 'power_on' },
            { action: 'press', target: 'PB1' },
            { action: 'press', target: 'PB2' },
            { expect: { MC1: 'on', MC2: 'off' } },
          ],
        },
      ],
    };
    const r = grade(input, interlockCircuit({ withInterlock: false }).wires);
    expect(r.passed).toBe(false);
    expect(kinds(r)).toContain('interlock');
  });

  it('④ 미결선: 단자에 전선이 없음', () => {
    const r = grade(motor, without(motor.answerWires, ['BZ.2', 'YL.2']));
    expect(r.passed).toBe(false);
    const d = r.errors.find((e) => e.kind === 'open');
    expect(d?.terminals).toEqual(['YL.2']);
  });

  it('⑤ 오결선: GL 을 b접점 대신 a접점에 연결', () => {
    const wires = [...without(motor.answerWires, ['MC1.b1-2', 'GL.1']), ['MC1.a2-2', 'GL.1'] as Wire];
    const r = grade(motor, wires);
    expect(r.passed).toBe(false);
    expect(kinds(r)).toContain('wrong_link');
    expect(r.errors.find((e) => e.kind === 'open')?.terminals).toEqual(['MC1.b1-2']);
  });

  it('⑥ 발진: 코일을 자기 b접점으로 급전', () => {
    const r = grade(motor, [...motor.answerWires, ['MC1.b1-2', 'MC1.A1']]);
    expect(r.passed).toBe(false);
    expect(kinds(r)).toContain('oscillation');
  });

  it('⑦ 연결 누락: 정지 버튼과 기동 버튼 사이가 끊김', () => {
    const r = grade(motor, without(motor.answerWires, ['PB0.2', 'PB1.1']));
    expect(r.passed).toBe(false);
    expect(kinds(r)).toContain('open');
  });

  it('없는 단자에 연결하면 오류', () => {
    const r = grade(motor, [...motor.answerWires, ['MC1.Z9', 'RL.1']]);
    expect(kinds(r)).toContain('unknown_terminal');
    expect(r.passed).toBe(false);
  });

  it('경고: 한 단자 3가닥 이상, 사용하지 않는 단자 (불합격 사유 아님)', () => {
    expect(grade(motor, motor.answerWires).warnings).toEqual([]);
    const r = grade(motor, [...motor.answerWires, ['EOCR.A2', 'RL.2']]);
    expect(r.passed).toBe(true);
    expect(r.warnings.find((w) => w.kind === 'crowded')?.terminals).toEqual(['EOCR.A2']);

    const r2 = grade(
      { ...motor, components: [...motor.components, { id: 'WL', kind: 'LAMP' }] },
      [...motor.answerWires, ['F.2', 'WL.1']],
    );
    expect(r2.passed).toBe(true);
    expect(r2.warnings.map((w) => w.kind)).toContain('unused_terminal');
  });
});
