import { describe, expect, it } from 'vitest';
import { buildNetlist, UnionFind } from '../../src/engine/netlist';
import { MAX_ITERATIONS } from '../../src/engine/solver';
import { Simulator } from '../../src/engine/simulator';
import type { Circuit } from '../../src/engine/types';

const base: Circuit['components'] = [{ id: 'MCCB', kind: 'MCCB' }];
const power: Circuit['wires'] = [
  ['L', 'MCCB.1'],
  ['N', 'MCCB.3'],
];

describe('UnionFind', () => {
  it('연결된 원소를 같은 집합으로 묶는다', () => {
    const uf = new UnionFind(5);
    uf.union(0, 1);
    uf.union(3, 4);
    uf.union(1, 4);
    expect(uf.find(0)).toBe(uf.find(3));
    expect(uf.find(2)).not.toBe(uf.find(0));
  });
});

describe('노드 병합', () => {
  it('전선으로 이어진 단자는 같은 노드, 단자대를 거쳐도 같은 노드', () => {
    const netlist = buildNetlist({
      components: [...base, { id: 'TB1', kind: 'TB', terminals: 4 }, { id: 'RL', kind: 'LAMP' }],
      wires: [...power, ['MCCB.2', 'TB1.1'], ['TB1.1', 'RL.1']],
    });
    expect(netlist.errors).toEqual([]);
    expect(netlist.nodeOf.get('MCCB.2')).toBe(netlist.nodeOf.get('RL.1'));
    expect(netlist.nodeOf.get('TB1.2')).not.toBe(netlist.nodeOf.get('TB1.1'));
    expect(netlist.nodeOf.get('L')).toBe(netlist.nodeOf.get('MCCB.1'));
  });

  it('존재하지 않는 단자에 연결하면 오류', () => {
    const netlist = buildNetlist({ components: base, wires: [['MCCB.2', 'RL.9']] });
    expect(netlist.errors.map((e) => e.code)).toEqual(['unknown_terminal']);
  });

  it('핀맵이 없는 소켓을 지정하면 핀맵 미확인 오류', () => {
    const netlist = buildNetlist({ components: [{ id: 'MC1', kind: 'MC', socket: '12pin' }], wires: [] });
    expect(netlist.errors.map((e) => e.code)).toEqual(['pinmap_missing']);
  });
});

describe('통전 판정', () => {
  it('램프 2개가 직렬이면 둘 다 점등하지 않는다', () => {
    const sim = new Simulator({
      components: [...base, { id: 'RL', kind: 'LAMP' }, { id: 'GL', kind: 'LAMP' }],
      wires: [...power, ['MCCB.2', 'RL.1'], ['RL.2', 'GL.1'], ['GL.2', 'MCCB.4']],
    });
    sim.powerOn();
    expect(sim.isOn('RL')).toBe(false);
    expect(sim.isOn('GL')).toBe(false);
  });

  it('퓨즈를 거쳐도 통전된다', () => {
    const sim = new Simulator({
      components: [...base, { id: 'F', kind: 'F' }, { id: 'WL', kind: 'LAMP' }],
      wires: [...power, ['MCCB.2', 'F.1'], ['F.2', 'WL.1'], ['WL.2', 'MCCB.4']],
    });
    sim.powerOn();
    expect(sim.isOn('WL')).toBe(true);
  });
});

describe('단락', () => {
  it('부하 없이 L-N이 연결되면 MCCB가 트립된다', () => {
    const sim = new Simulator({ components: base, wires: [...power, ['MCCB.2', 'MCCB.4']] });
    const state = sim.powerOn();
    expect(state.errors.map((e) => e.code)).toContain('short');
    expect(state.toggled.has('MCCB')).toBe(false);
  });

  it('버튼을 눌러 단락이 생기면 그 순간 트립되고 부하가 꺼진다', () => {
    const sim = new Simulator({
      components: [...base, { id: 'PB1', kind: 'PB' }, { id: 'WL', kind: 'LAMP' }],
      wires: [...power, ['MCCB.2', 'PB1.1'], ['PB1.2', 'MCCB.4'], ['MCCB.2', 'WL.1'], ['WL.2', 'MCCB.4']],
    });
    sim.powerOn();
    expect(sim.isOn('WL')).toBe(true);
    const state = sim.press('PB1');
    expect(state.errors.map((e) => e.code)).toContain('short');
    expect(sim.isOn('WL')).toBe(false);
    expect(state.toggled.has('MCCB')).toBe(false);
  });
});

describe('발진(채터링)', () => {
  it('자기 b접점으로 코일을 끊는 회로는 발진 오류', () => {
    const sim = new Simulator({
      components: [...base, { id: 'X1', kind: 'X', aContacts: 0, bContacts: 1 }],
      wires: [...power, ['MCCB.2', 'X1.b1-1'], ['X1.b1-2', 'X1.A1'], ['X1.A2', 'MCCB.4']],
    });
    const state = sim.powerOn();
    expect(state.errors.map((e) => e.code)).toContain('oscillation');
    expect(MAX_ITERATIONS).toBe(50);
  });
});
