/** 동작 미리보기: 정답 회로를 조작해 램프·부저·코일 상태를 확인 */
import { useMemo } from 'react';
import { describeStep } from '../engine/scenario';
import { answerCircuit } from '../problems';
import type { Problem } from '../problems/types';
import { ControlPanel } from './ControlPanel';
import { useLayout } from './hooks';
import { Schematic, type DrawnWire } from './Schematic';
import { useSimulation } from './useSimulation';

export function ScenarioGuide({ problem }: { problem: Problem }) {
  return (
    <details className="guide">
      <summary>시험 순서 ({problem.scenarios.length}단계)</summary>
      <ol>
        {problem.scenarios.map((sc) => (
          <li key={sc.name}>
            <strong>{sc.name}</strong>
            <ul>
              {sc.steps.map((step, i) => (
                <li key={i} className={'expect' in step ? 'expect' : undefined}>
                  {describeStep(step)}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </details>
  );
}

export function PreviewView({ problem }: { problem: Problem }) {
  const circuit = useMemo(() => answerCircuit(problem), [problem]);
  const api = useSimulation(circuit);
  const layout = useLayout(problem.components);
  const wires = useMemo<DrawnWire[]>(() => circuit.wires.map((wire) => ({ wire, locked: true })), [circuit]);

  return (
    <div className="workspace">
      <div className="canvas">
        <p className="legend">
          <span className="pot-l-swatch" /> L측 전위 <span className="pot-n-swatch" /> N측 전위 <span className="pot-0-swatch" /> 무전압
        </p>
        <Schematic layout={layout} wires={wires} state={api.state} netlist={api.sim.netlist} />
      </div>
      <aside className="side">
        <ControlPanel components={problem.components} api={api} />
        <ScenarioGuide problem={problem} />
      </aside>
    </div>
  );
}
