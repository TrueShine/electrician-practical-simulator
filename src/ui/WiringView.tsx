/**
 * 결선 연습: 단자 탭 2번으로 전선 생성, 전선 탭 → 삭제, 되돌리기/다시하기.
 * 만든 결선으로 바로 동작 시험을 하고 채점할 수 있다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { grade, type GradeResult } from '../engine/grader';
import type { Wire } from '../engine/types';
import { userCircuit } from '../problems';
import type { Problem } from '../problems/types';
import { ControlPanel } from './ControlPanel';
import { GradePanel } from './GradePanel';
import { useLayout } from './hooks';
import { ScenarioGuide } from './PreviewView';
import { Schematic, type DrawnWire } from './Schematic';
import { useUi } from './store';
import { useSimulation } from './useSimulation';

const EMPTY: Wire[] = [];

export function WiringView({ problem }: { problem: Problem }) {
  const userWires = useUi((s) => s.wires[problem.id]) ?? EMPTY;
  const selectedTerminal = useUi((s) => s.selectedTerminal);
  const selectedWire = useUi((s) => s.selectedWire);
  const canUndo = useUi((s) => (s.history[problem.id] ?? []).length > 0);
  const canRedo = useUi((s) => (s.future[problem.id] ?? []).length > 0);
  const { tapTerminal, tapWire, deleteSelectedWire, clearWires, undo, redo, clearSelection } = useUi.getState();

  const circuit = useMemo(() => userCircuit(problem, userWires), [problem, userWires]);
  const api = useSimulation(circuit);
  const layout = useLayout(problem.components);
  const [result, setResult] = useState<{ wires: Wire[]; result: GradeResult } | null>(null);
  const gradeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (result) gradeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [result]);

  const wires = useMemo<DrawnWire[]>(
    () => [
      ...(problem.givenWires ?? []).map((wire) => ({ wire, locked: true })),
      ...userWires.map((wire, userIndex) => ({ wire, userIndex })),
    ],
    [problem, userWires],
  );

  const marked = useMemo(
    () => new Set(result ? [...result.result.errors, ...result.result.warnings].flatMap((d) => d.terminals) : []),
    [result],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && useUi.getState().selectedWire !== null) {
        e.preventDefault();
        deleteSelectedWire();
      } else if (e.key === 'Escape') {
        clearSelection();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, deleteSelectedWire, clearSelection]);

  const status =
    selectedTerminal !== null
      ? `${selectedTerminal} 선택됨 — 연결할 단자를 탭하세요 (같은 단자를 다시 탭하면 취소)`
      : selectedWire !== null && userWires[selectedWire]
        ? `전선 ${userWires[selectedWire][0]} – ${userWires[selectedWire][1]} 선택됨`
        : '단자 두 개를 차례로 탭하면 전선이 연결됩니다. 전선을 탭하면 선택됩니다.';

  return (
    <div className="workspace wiring">
      <div className="canvas">
        <div className="toolbar" role="toolbar" aria-label="결선 도구">
          <button type="button" onClick={undo} disabled={!canUndo}>
            되돌리기
          </button>
          <button type="button" onClick={redo} disabled={!canRedo}>
            다시하기
          </button>
          <button type="button" onClick={deleteSelectedWire} disabled={selectedWire === null}>
            선택 전선 삭제
          </button>
          <button
            type="button"
            onClick={() => {
              if (userWires.length && window.confirm('이 문제의 결선을 모두 지울까요?')) clearWires();
            }}
            disabled={!userWires.length}
          >
            전체 지우기
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => setResult({ wires: userWires, result: grade(problem, userWires) })}
          >
            채점하기
          </button>
        </div>
        <p className="status" aria-live="polite">
          {status} · 전선 {userWires.length}가닥
        </p>
        <Schematic
          layout={layout}
          wires={wires}
          state={api.state}
          netlist={api.sim.netlist}
          interactive
          selectedTerminal={selectedTerminal}
          selectedWire={selectedWire}
          marked={marked}
          onTerminal={tapTerminal}
          onWire={tapWire}
        />
      </div>
      <aside className="side">
        <div ref={gradeRef}>
          {result && (
            <GradePanel result={result.result} stale={result.wires !== userWires} onClose={() => setResult(null)} />
          )}
        </div>
        <ControlPanel components={problem.components} api={api} />
        <ScenarioGuide problem={problem} />
      </aside>
    </div>
  );
}
