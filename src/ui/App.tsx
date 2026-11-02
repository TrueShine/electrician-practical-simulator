import { findProblem, OFFICIAL_STUBS, PROBLEMS } from '../problems';
import { PreviewView } from './PreviewView';
import { QuizView } from './QuizView';
import { useUi, type Mode } from './store';
import { WiringView } from './WiringView';

const MODES: { value: Mode; label: string }[] = [
  { value: 'preview', label: '동작 미리보기' },
  { value: 'wiring', label: '결선 연습' },
  { value: 'quiz', label: '핀번호 퀴즈' },
];

export default function App() {
  const problemId = useUi((s) => s.problemId);
  const mode = useUi((s) => s.mode);
  const { setProblem, setMode } = useUi.getState();
  const problem = findProblem(problemId) ?? PROBLEMS[0];

  return (
    <div className="app">
      <header className="top">
        <h1>전기기능사 실기 시뮬레이터</h1>
        <label className="problem-select">
          <span className="sr-only">문제 선택</span>
          <select value={problem.id} onChange={(e) => setProblem(e.target.value)}>
            <optgroup label="예시 (공개문제 아님)">
              {PROBLEMS.filter((p) => !p.official).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </optgroup>
            <optgroup label="공개문제">
              {PROBLEMS.filter((p) => p.official).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
              {OFFICIAL_STUBS.map((s) => (
                <option key={s.id} value={s.id} disabled>
                  {s.title} — 준비 중
                </option>
              ))}
            </optgroup>
          </select>
        </label>
      </header>

      <nav className="tabs" role="tablist" aria-label="연습 모드">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="tab"
            aria-selected={mode === m.value}
            className={mode === m.value ? 'active' : undefined}
            onClick={() => setMode(m.value)}
          >
            {m.label}
          </button>
        ))}
      </nav>

      {problem.description && (
        <details className="description">
          <summary>{problem.title} — 문제 설명</summary>
          <p>{problem.description}</p>
        </details>
      )}

      <main>
        {mode === 'preview' && <PreviewView key={problem.id} problem={problem} />}
        {mode === 'wiring' && <WiringView key={problem.id} problem={problem} />}
        {mode === 'quiz' && <QuizView key={problem.id} problem={problem} />}
      </main>

      <footer className="foot">
        결선·시퀀스 동작 이해를 돕는 연습 도구입니다. 실물 작업(배관·피복·압착 등)을 대체하지 않습니다.
      </footer>
    </div>
  );
}
