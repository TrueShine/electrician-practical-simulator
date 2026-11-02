import { describe, expect, it } from 'vitest';
import { Simulator } from '../../src/engine/simulator';
import { selfHoldCircuit } from './circuits';

describe('자기유지 회로', () => {
  it('전원 투입 시 GL 점등, MC1·RL 소등', () => {
    const sim = new Simulator(selfHoldCircuit());
    expect(sim.getState().netlistErrors).toEqual([]);
    sim.powerOn();
    expect(sim.isOn('MC1')).toBe(false);
    expect(sim.isOn('GL')).toBe(true);
    expect(sim.isOn('RL')).toBe(false);
  });

  it('기동 버튼을 눌렀다 떼도 MC1이 자기유지된다', () => {
    const sim = new Simulator(selfHoldCircuit());
    sim.powerOn();
    sim.press('PB1');
    expect(sim.isOn('MC1')).toBe(true);
    expect(sim.isOn('RL')).toBe(true);
    expect(sim.isOn('GL')).toBe(false);
    sim.release('PB1');
    expect(sim.isOn('MC1')).toBe(true);
    expect(sim.isOn('RL')).toBe(true);
  });

  it('정지 버튼(b접점)을 누르면 자기유지가 풀린다', () => {
    const sim = new Simulator(selfHoldCircuit());
    sim.powerOn();
    sim.press('PB1');
    sim.release('PB1');
    sim.press('PB0');
    expect(sim.isOn('MC1')).toBe(false);
    sim.release('PB0');
    expect(sim.isOn('MC1')).toBe(false);
    expect(sim.isOn('GL')).toBe(true);
  });

  it('자기유지 접점이 없으면 버튼을 떼는 순간 꺼진다', () => {
    const sim = new Simulator(selfHoldCircuit({ withSelfHold: false }));
    sim.powerOn();
    sim.press('PB1');
    expect(sim.isOn('MC1')).toBe(true);
    sim.release('PB1');
    expect(sim.isOn('MC1')).toBe(false);
  });

  it('정전 후 재투입 시 자기유지가 복귀하지 않는다', () => {
    const sim = new Simulator(selfHoldCircuit());
    sim.powerOn();
    sim.press('PB1');
    sim.release('PB1');
    sim.powerOff();
    expect(sim.isOn('MC1')).toBe(false);
    expect(sim.isOn('GL')).toBe(false);
    sim.powerOn();
    expect(sim.isOn('MC1')).toBe(false);
    expect(sim.isOn('GL')).toBe(true);
  });

  it('MCCB를 내리면 전부 꺼진다', () => {
    const sim = new Simulator(selfHoldCircuit());
    sim.powerOn();
    sim.press('PB1');
    sim.release('PB1');
    sim.setToggle('MCCB', false);
    expect(sim.isOn('MC1')).toBe(false);
    expect(sim.isOn('RL')).toBe(false);
    expect(sim.isOn('GL')).toBe(false);
  });
});
