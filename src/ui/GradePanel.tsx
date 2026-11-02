import type { GradeResult } from '../engine/grader';

export function GradePanel({ result, stale, onClose }: { result: GradeResult; stale: boolean; onClose(): void }) {
  return (
    <section className={`grade ${result.passed ? 'pass' : 'fail'}`} aria-label="채점 결과">
      <header>
        <h2>{result.passed ? '합격 — 모든 동작이 정답과 같습니다' : '불합격 — 아래 항목을 확인하세요'}</h2>
        <button type="button" className="link" onClick={onClose}>
          닫기
        </button>
      </header>
      {stale && <p className="muted">채점 후 결선이 바뀌었습니다. 다시 채점하세요.</p>}

      <ul className="scenario-results">
        {result.scenarios.map((s) => (
          <li key={s.name}>
            <span aria-hidden="true">{s.passed ? '✅' : '❌'}</span> {s.name}
            <span className="sr-only">{s.passed ? '통과' : '실패'}</span>
            {s.failures.length > 0 && (
              <ul>
                {s.failures.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {result.errors.length > 0 && (
        <>
          <h3>진단</h3>
          <ul className="diag error">
            {result.errors.map((d, i) => (
              <li key={i}>{d.message}</li>
            ))}
          </ul>
        </>
      )}
      {result.warnings.length > 0 && (
        <>
          <h3>감점 경고 (불합격 사유 아님)</h3>
          <ul className="diag warning">
            {result.warnings.map((d, i) => (
              <li key={i}>{d.message}</li>
            ))}
          </ul>
        </>
      )}
      {(result.errors.some((d) => d.terminals.length) || result.warnings.some((d) => d.terminals.length)) && (
        <p className="muted">관련 단자는 회로 화면에 주황색 테두리로 표시됩니다.</p>
      )}
    </section>
  );
}
