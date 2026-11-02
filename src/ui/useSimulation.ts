/**
 * React 에서 시뮬레이터를 쓰기 위한 훅.
 * 실제 시간은 requestAnimationFrame 으로 재고, 배속을 곱해 가상 시계(advance)로 넘긴다.
 * 회로가 바뀌면(결선 추가 등) 새 시뮬레이터를 만들고 전원·스위치·수위 입력을 이어받는다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Simulator, type SimulatorState } from '../engine/simulator';
import type { Speed } from '../engine/clock';
import type { Circuit, EngineError, FlsLevel } from '../engine/types';

function signature(st: SimulatorState): string {
  return [
    st.power ? 1 : 0,
    [...st.coils].join(','),
    [...st.outputs].filter(([, on]) => on).map(([id]) => id).join(','),
    [...st.toggled].join(','),
    [...st.pressed].join(','),
  ].join('|');
}

function rebuild(circuit: Circuit, prev?: SimulatorState): Simulator {
  const sim = new Simulator(circuit);
  if (!prev) return sim;
  for (const [id, level] of prev.levels) sim.setLevel(id, level);
  if (prev.power) {
    sim.powerOn();
    for (const c of circuit.components) {
      if (c.kind === 'MCCB' && !prev.toggled.has(c.id)) sim.setToggle(c.id, false);
    }
  }
  for (const id of prev.toggled) {
    if (circuit.components.some((c) => c.id === id && c.kind !== 'MCCB')) sim.setToggle(id, true);
  }
  return sim;
}

export interface SimulationApi {
  sim: Simulator;
  state: SimulatorState;
  /** 최근 발생한 단락·발진 경고 */
  alerts: EngineError[];
  speed: Speed;
  paused: boolean;
  setSpeed(s: Speed): void;
  setPaused(p: boolean): void;
  powerOn(): void;
  powerOff(): void;
  press(id: string): void;
  release(id: string): void;
  setToggle(id: string, on: boolean): void;
  setLevel(id: string, level: FlsLevel): void;
  reset(): void;
  dismissAlerts(): void;
}

export function useSimulation(circuit: Circuit): SimulationApi {
  const [sim, setSim] = useState(() => new Simulator(circuit));
  const [simCircuit, setSimCircuit] = useState(circuit);
  const [state, setState] = useState<SimulatorState>(() => sim.getState());
  const [alerts, setAlerts] = useState<EngineError[]>([]);
  const [speed, setSpeed] = useState<Speed>(1);
  const [paused, setPaused] = useState(false);
  const sigRef = useRef('');

  const apply = useCallback((st: SimulatorState) => {
    sigRef.current = signature(st);
    setState(st);
    if (st.errors.length) {
      const seen = new Set<string>();
      setAlerts(st.errors.filter((e) => (seen.has(e.message) ? false : (seen.add(e.message), true))));
    }
  }, []);

  // 회로 변경 시 시뮬레이터 재구성 (렌더 중 상태 조정 패턴)
  if (simCircuit !== circuit) {
    const next = rebuild(circuit, sim.getState());
    setSimCircuit(circuit);
    setSim(next);
    setAlerts([]);
    setState(next.getState());
  }

  // 가상 시계 진행
  useEffect(() => {
    if (paused) return;
    let raf = 0;
    let last = performance.now();
    let lastBucket = -1;
    const tick = (ts: number) => {
      const dt = Math.min(ts - last, 250) * speed;
      last = ts;
      const st = sim.advance(dt);
      const bucket = Math.floor(st.now / 100);
      if (signature(st) !== sigRef.current || st.errors.length || (st.since.size > 0 && bucket !== lastBucket)) {
        lastBucket = bucket;
        apply(st);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sim, paused, speed, apply]);

  const run = (fn: (s: Simulator) => SimulatorState) => apply(fn(sim));

  return {
    sim,
    state,
    alerts,
    speed,
    paused,
    setSpeed,
    setPaused,
    powerOn: () => {
      setAlerts([]);
      run((s) => s.powerOn());
    },
    powerOff: () => run((s) => s.powerOff()),
    press: (id) => run((s) => s.press(id)),
    release: (id) => run((s) => s.release(id)),
    setToggle: (id, on) => run((s) => s.setToggle(id, on)),
    setLevel: (id, level) => run((s) => s.setLevel(id, level)),
    reset: () => {
      const next = new Simulator(circuit);
      setSim(next);
      setAlerts([]);
      apply(next.getState());
    },
    dismissAlerts: () => setAlerts([]),
  };
}
