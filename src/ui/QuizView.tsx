/** 핀번호 퀴즈 모드 */
import { useMemo, useState } from 'react';
import { buildQuiz, checkAnswer } from '../components/quiz';
import type { Problem } from '../problems/types';

export function QuizView({ problem }: { problem: Problem }) {
  const quiz = useMemo(() => buildQuiz(problem.components), [problem]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [graded, setGraded] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);

  const q = quiz.questions[index];
  const done = index >= quiz.questions.length;

  const pick = (pin: string) => {
    if (graded !== null || !q) return;
    const next = picked.includes(pin) ? picked.filter((p) => p !== pin) : [...picked, pin];
    setPicked(next);
    if (next.length === q.answer.length) {
      const ok = checkAnswer(q, next);
      setGraded(ok);
      if (ok) setScore((s) => s + 1);
    }
  };

  const nextQuestion = () => {
    setIndex((i) => i + 1);
    setPicked([]);
    setGraded(null);
  };

  const restart = () => {
    setIndex(0);
    setPicked([]);
    setGraded(null);
    setScore(0);
  };

  return (
    <div className="quiz">
      {quiz.usesLogical && (
        <p className="notice">
          이 문제는 실제 소켓 번호가 아닌 <strong>논리 핀 이름</strong>(A1, a1-1 …)을 씁니다. 공개도면 기준 핀번호를{' '}
          <code>src/components/socketPinmaps.json</code>에 입력하고 문제에서 <code>socket</code>을 지정하면 실제 번호로
          퀴즈가 나옵니다.
        </p>
      )}
      {quiz.missing.length > 0 && (
        <div className="notice warn">
          <p>핀맵 데이터가 없어 퀴즈에서 빠진 기구:</p>
          <ul>
            {quiz.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {quiz.questions.length === 0 ? (
        <p>이 문제에는 핀번호를 맞힐 소켓 기구가 없습니다.</p>
      ) : done ? (
        <div className="quiz-card">
          <h2>
            결과: {score} / {quiz.questions.length}
          </h2>
          <button type="button" className="primary" onClick={restart}>
            다시 풀기
          </button>
        </div>
      ) : (
        <div className="quiz-card">
          <p className="muted">
            {index + 1} / {quiz.questions.length} · 맞힌 개수 {score}
          </p>
          <h2>{q.prompt}</h2>
          <p>
            {q.answer.length}개 핀을 고르세요
            {q.ordered ? (q.answer.length === 3 && q.prompt.includes('전극') ? ' (E1 → E2 → E3 순서)' : ' (공통 → a(NO) → b(NC) 순서)') : ''}.
          </p>
          <div className="pin-grid" role="group" aria-label="핀 선택">
            {q.choices.map((pin) => {
              const order = picked.indexOf(pin);
              const isAnswer = graded !== null && q.answer.includes(pin);
              return (
                <button
                  key={pin}
                  type="button"
                  aria-pressed={order >= 0}
                  className={`pin${order >= 0 ? ' picked' : ''}${isAnswer ? ' answer' : ''}`}
                  onClick={() => pick(pin)}
                >
                  {pin}
                  {order >= 0 && q.ordered && <small>{order + 1}</small>}
                </button>
              );
            })}
          </div>
          {graded !== null && (
            <div className={`quiz-result ${graded ? 'ok' : 'ng'}`} role="status">
              <p>{graded ? '정답입니다.' : `오답입니다. 정답: ${q.answer.join(' → ')}`}</p>
              <button type="button" className="primary" onClick={nextQuestion}>
                {index + 1 < quiz.questions.length ? '다음 문제' : '결과 보기'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
