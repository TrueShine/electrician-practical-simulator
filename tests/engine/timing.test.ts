import { describe, expect, it } from 'vitest';
import { Simulator } from '../../src/engine/simulator';
import type { Circuit, ComponentSpec, Wire } from '../../src/engine/types';

const power: Wire[] = [
  ['L', 'MCCB.1'],
  ['N', 'MCCB.3'],
];
const mccb: ComponentSpec = { id: 'MCCB', kind: 'MCCB' };

describe('타이머 (T)', () => {
  // PB1 → T1 코일, T1 한시 a → RL, T1 한시 b → GL, T1 순시 a → WL
  const circuit: Circuit = {
    components: [
      mccb,
      { id: 'PB1', kind: 'PB' },
      { id: 'T1', kind: 'T', setMs: 3000, aContacts: 1 },
      { id: 'RL', kind: 'LAMP' },
      { id: 'GL', kind: 'LAMP' },
      { id: 'WL', kind: 'LAMP' },
    ],
    wires: [
      ...power,
      ['MCCB.2', 'PB1.1'],
      ['PB1.2', 'T1.A1'],
      ['T1.A2', 'MCCB.4'],
      ['MCCB.2', 'T1.ta1-1'],
      ['T1.ta1-2', 'RL.1'],
      ['RL.2', 'MCCB.4'],
      ['MCCB.2', 'T1.tb1-1'],
      ['T1.tb1-2', 'GL.1'],
      ['GL.2', 'MCCB.4'],
      ['MCCB.2', 'T1.a1-1'],
      ['T1.a1-2', 'WL.1'],
      ['WL.2', 'MCCB.4'],
    ],
  };

  it('설정 시간이 지나야 한시 접점이 동작하고, 순시 접점은 즉시 동작한다', () => {
    const sim = new Simulator(circuit);
    expect(sim.getState().netlistErrors).toEqual([]);
    sim.powerOn();
    sim.press('PB1');
    expect(sim.isOn('T1')).toBe(true);
    expect(sim.isOn('WL')).toBe(true);
    expect(sim.isOn('RL')).toBe(false);
    expect(sim.isOn('GL')).toBe(true);

    sim.advance(2999);
    expect(sim.isOn('RL')).toBe(false);
    sim.advance(1);
    expect(sim.isOn('RL')).toBe(true);
    expect(sim.isOn('GL')).toBe(false);
  });

  it('코일이 꺼지면 즉시 복귀하고, 다시 여자하면 처음부터 계산한다', () => {
    const sim = new Simulator(circuit);
    sim.powerOn();
    sim.press('PB1');
    sim.advance(2000);
    sim.release('PB1');
    expect(sim.isOn('T1')).toBe(false);
    sim.press('PB1');
    sim.advance(2000);
    expect(sim.isOn('RL')).toBe(false);
    sim.advance(1000);
    expect(sim.isOn('RL')).toBe(true);
  });

  it('타이머로 자기 자신을 끊는 회로: 시간이 지나면 MC가 꺼진다 (한시 동작 후 정지)', () => {
    // PB1 기동 → MC1 자기유지, MC1 과 함께 T1 여자, T1 한시 b 로 MC1 회로 차단
    const sim = new Simulator({
      components: [
        mccb,
        { id: 'PB1', kind: 'PB' },
        { id: 'MC1', kind: 'MC', aContacts: 1, bContacts: 0 },
        { id: 'T1', kind: 'T', setMs: 5000, timedA: 0, timedB: 1 },
      ],
      wires: [
        ...power,
        ['MCCB.2', 'T1.tb1-1'],
        ['T1.tb1-2', 'PB1.1'],
        ['PB1.2', 'MC1.A1'],
        ['PB1.1', 'MC1.a1-1'],
        ['PB1.2', 'MC1.a1-2'],
        ['MC1.A2', 'MCCB.4'],
        ['MC1.A1', 'T1.A1'],
        ['T1.A2', 'MCCB.4'],
      ],
    });
    sim.powerOn();
    sim.press('PB1');
    sim.release('PB1');
    expect(sim.isOn('MC1')).toBe(true);
    sim.advance(4999);
    expect(sim.isOn('MC1')).toBe(true);
    sim.advance(1);
    expect(sim.isOn('MC1')).toBe(false);
    expect(sim.isOn('T1')).toBe(false);
  });
});

describe('플리커 릴레이 (FR)', () => {
  it('여자 중 반주기마다 a/b 접점이 번갈아 바뀐다', () => {
    const sim = new Simulator({
      components: [
        mccb,
        { id: 'FR', kind: 'FR', periodMs: 500 },
        { id: 'YL', kind: 'LAMP' },
        { id: 'BZ', kind: 'BZ' },
      ],
      wires: [
        ...power,
        ['MCCB.2', 'FR.A1'],
        ['FR.A2', 'MCCB.4'],
        ['MCCB.2', 'FR.a1-1'],
        ['FR.a1-2', 'YL.1'],
        ['YL.2', 'MCCB.4'],
        ['MCCB.2', 'FR.b1-1'],
        ['FR.b1-2', 'BZ.1'],
        ['BZ.2', 'MCCB.4'],
      ],
    });
    sim.powerOn();
    const seq: [boolean, boolean][] = [];
    for (let i = 0; i < 4; i++) {
      seq.push([sim.isOn('YL'), sim.isOn('BZ')]);
      sim.advance(500);
    }
    expect(seq).toEqual([
      [true, false],
      [false, true],
      [true, false],
      [false, true],
    ]);
  });

  it('긴 시간을 한 번에 진행해도 결과가 같다 (결정성)', () => {
    const make = () =>
      new Simulator({
        components: [mccb, { id: 'FR', kind: 'FR', periodMs: 300 }, { id: 'YL', kind: 'LAMP' }],
        wires: [...power, ['MCCB.2', 'FR.A1'], ['FR.A2', 'MCCB.4'], ['MCCB.2', 'FR.a1-1'], ['FR.a1-2', 'YL.1'], ['YL.2', 'MCCB.4']],
      });
    const a = make();
    const b = make();
    a.powerOn();
    b.powerOn();
    a.advance(10_000);
    for (let i = 0; i < 100; i++) b.advance(100);
    expect(a.isOn('YL')).toBe(b.isOn('YL'));
    expect(a.getState().now).toBe(b.getState().now);
  });
});

describe('플로트레스 스위치 (FLS)', () => {
  // 급수: FLS b(NC) 접점으로 펌프(MC1) 운전 → 물이 차면 정지
  const circuit: Circuit = {
    components: [
      mccb,
      { id: 'FLS', kind: 'FLS' },
      { id: 'MC1', kind: 'MC', aContacts: 0, bContacts: 0 },
    ],
    wires: [
      ...power,
      ['MCCB.2', 'FLS.A1'],
      ['FLS.A2', 'MCCB.4'],
      ['MCCB.2', 'FLS.COM'],
      ['FLS.NC', 'MC1.A1'],
      ['MC1.A2', 'MCCB.4'],
    ],
  };

  it('저수위에서 급수 시작, 고수위에서 정지, 중간 수위에서는 이전 상태 유지', () => {
    const sim = new Simulator(circuit);
    expect(sim.getState().netlistErrors).toEqual([]);
    sim.powerOn();
    expect(sim.isOn('MC1')).toBe(true); // 기본 수위 low

    sim.setLevel('FLS', 'mid');
    expect(sim.isOn('MC1')).toBe(true); // 차오르는 중: 계속 급수
    sim.setLevel('FLS', 'high');
    expect(sim.isOn('MC1')).toBe(false); // 만수: 정지
    sim.setLevel('FLS', 'mid');
    expect(sim.isOn('MC1')).toBe(false); // 사용 중 수위 하강: 아직 정지
    sim.setLevel('FLS', 'low');
    expect(sim.isOn('MC1')).toBe(true); // 저수위: 다시 급수
  });

  it('FLS 전원이 없으면 수위와 관계없이 내부 릴레이가 동작하지 않는다', () => {
    const sim = new Simulator({ ...circuit, wires: circuit.wires.filter(([a]) => a !== 'FLS.A2') });
    sim.powerOn();
    sim.setLevel('FLS', 'high');
    expect(sim.isOn('FLS')).toBe(false);
    expect(sim.isOn('MC1')).toBe(true);
  });
});

describe('EOCR', () => {
  // EOCR b 접점 직렬로 MC1, 트립 시 EOCR a 접점으로 BZ
  const circuit: Circuit = {
    components: [
      mccb,
      { id: 'EOCR', kind: 'EOCR' },
      { id: 'MC1', kind: 'MC', aContacts: 0, bContacts: 0 },
      { id: 'BZ', kind: 'BZ' },
    ],
    wires: [
      ...power,
      ['MCCB.2', 'EOCR.A1'],
      ['EOCR.A2', 'MCCB.4'],
      ['MCCB.2', 'EOCR.b1-1'],
      ['EOCR.b1-2', 'MC1.A1'],
      ['MC1.A2', 'MCCB.4'],
      ['MCCB.2', 'EOCR.a1-1'],
      ['EOCR.a1-2', 'BZ.1'],
      ['BZ.2', 'MCCB.4'],
    ],
  };

  it('트립 시 b접점이 열려 MC가 꺼지고 a접점으로 부저가 울린다. 복귀하면 원래대로', () => {
    const sim = new Simulator(circuit);
    sim.powerOn();
    expect(sim.isOn('MC1')).toBe(true);
    expect(sim.isOn('BZ')).toBe(false);
    sim.setToggle('EOCR', true);
    expect(sim.isOn('MC1')).toBe(false);
    expect(sim.isOn('BZ')).toBe(true);
    sim.setToggle('EOCR', false);
    expect(sim.isOn('MC1')).toBe(true);
    expect(sim.isOn('BZ')).toBe(false);
  });
});

describe('셀렉터 스위치 (SS)', () => {
  it('위치에 따라 c접점의 경로가 바뀐다', () => {
    const sim = new Simulator({
      components: [mccb, { id: 'SS', kind: 'SS', positionLabels: ['수동', '자동'] }, { id: 'GL', kind: 'LAMP' }, { id: 'RL', kind: 'LAMP' }],
      wires: [...power, ['MCCB.2', 'SS.C'], ['SS.1', 'GL.1'], ['GL.2', 'MCCB.4'], ['SS.2', 'RL.1'], ['RL.2', 'MCCB.4']],
    });
    sim.powerOn();
    expect([sim.isOn('GL'), sim.isOn('RL')]).toEqual([true, false]);
    sim.setToggle('SS', true);
    expect([sim.isOn('GL'), sim.isOn('RL')]).toEqual([false, true]);
  });
});
