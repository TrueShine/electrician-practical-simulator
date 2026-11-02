import { describe, expect, it } from 'vitest';
import { buildNetlist } from '../src/engine/netlist';
import { runScenarios } from '../src/engine/scenario';
import { answerCircuit, OFFICIAL_STUBS, PROBLEMS } from '../src/problems';

describe('문제 데이터', () => {
  for (const problem of PROBLEMS) {
    it(`${problem.title}: 정답 회로가 오류 없이 모든 시나리오를 통과한다`, () => {
      const circuit = answerCircuit(problem);
      expect(buildNetlist(circuit).errors).toEqual([]);
      const runs = runScenarios(circuit, problem.scenarios);
      for (const run of runs) {
        expect(run.errors, run.name).toEqual([]);
        expect(run.checks.filter((c) => !c.ok), run.name).toEqual([]);
        expect(run.checks.length, run.name).toBeGreaterThan(0);
      }
    });
  }

  it('공개문제 자리 18개 (데이터 없는 것만)', () => {
    expect(OFFICIAL_STUBS.length + PROBLEMS.filter((p) => p.official).length).toBe(18);
  });
});
