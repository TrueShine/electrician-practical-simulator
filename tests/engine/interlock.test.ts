import { describe, expect, it } from 'vitest';
import { buildNetlist } from '../../src/engine/netlist';
import { Simulator } from '../../src/engine/simulator';
import { solve } from '../../src/engine/solver';
import { interlockCircuit } from './circuits';

describe('정역 인터록 회로', () => {
  it('정회전 운전 중 역회전 버튼을 눌러도 MC2가 동작하지 않는다', () => {
    const sim = new Simulator(interlockCircuit());
    expect(sim.getState().netlistErrors).toEqual([]);
    sim.powerOn();
    sim.press('PB1');
    sim.release('PB1');
    expect(sim.isOn('MC1')).toBe(true);

    sim.press('PB2');
    expect(sim.isOn('MC2')).toBe(false);
    expect(sim.isOn('MC1')).toBe(true);
    sim.release('PB2');
    expect(sim.isOn('MC2')).toBe(false);
  });

  it('정지 후에는 역회전 기동이 가능하고, 이번엔 정회전이 막힌다', () => {
    const sim = new Simulator(interlockCircuit());
    sim.powerOn();
    sim.press('PB1');
    sim.release('PB1');
    sim.press('PB0');
    sim.release('PB0');
    expect(sim.isOn('MC1')).toBe(false);

    sim.press('PB2');
    sim.release('PB2');
    expect(sim.isOn('MC2')).toBe(true);

    sim.press('PB1');
    expect(sim.isOn('MC1')).toBe(false);
    expect(sim.isOn('MC2')).toBe(true);
  });

  it('두 버튼을 동시에 눌러도 한쪽만 동작하고 결과가 항상 같다 (결정성)', () => {
    const netlist = buildNetlist(interlockCircuit());
    const inputs = { power: true, pressed: new Set(['PB1', 'PB2']), toggled: new Set(['MCCB']), levels: new Map() };
    const first = solve(netlist, inputs);
    expect(first.oscillation).toBe(false);
    expect(first.coils.size).toBe(1);
    for (let i = 0; i < 5; i++) {
      expect([...solve(netlist, inputs).coils]).toEqual([...first.coils]);
    }
  });

  it('인터록이 없으면 정·역 접촉기가 동시에 동작한다', () => {
    const sim = new Simulator(interlockCircuit({ withInterlock: false }));
    sim.powerOn();
    sim.press('PB1');
    sim.release('PB1');
    sim.press('PB2');
    expect(sim.isOn('MC1')).toBe(true);
    expect(sim.isOn('MC2')).toBe(true);
  });
});
