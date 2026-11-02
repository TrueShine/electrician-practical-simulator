import { describe, expect, it } from 'vitest';
import { buildQuiz, checkAnswer } from '../src/components/quiz';
import type { SocketPinmaps } from '../src/components/library';

describe('핀번호 퀴즈', () => {
  it('소켓 핀맵이 있으면 그 번호로 문제를 만들고, 쌍 접점은 순서 무관하게 채점', () => {
    // 테스트용 가짜 핀맵 (실제 소켓 번호 아님)
    const maps: SocketPinmaps = { X: { '8pin': { coil: ['P', 'Q'], c: [{ com: 'R', no: 'S', nc: 'U' }] } } };
    const quiz = buildQuiz([{ id: 'X1', kind: 'X', socket: '8pin' }], maps);
    expect(quiz.missing).toEqual([]);
    expect(quiz.usesLogical).toBe(false);
    const coil = quiz.questions.find((q) => q.prompt === 'X1 · 코일')!;
    expect(coil.choices).toEqual(['P', 'Q', 'R', 'S', 'U']);
    expect(checkAnswer(coil, ['Q', 'P'])).toBe(true);
    expect(checkAnswer(coil, ['P', 'R'])).toBe(false);

    const c = quiz.questions.find((q) => q.prompt === 'X1 · c')!;
    expect(checkAnswer(c, ['R', 'S', 'U'])).toBe(true);
    expect(checkAnswer(c, ['S', 'R', 'U'])).toBe(false); // 공통 → a → b 순서
  });

  it('핀맵이 없는 소켓은 안내 목록에 들어간다', () => {
    const quiz = buildQuiz([{ id: 'MC1', kind: 'MC', socket: '12pin' }]);
    expect(quiz.questions).toEqual([]);
    expect(quiz.missing[0]).toContain('공개도면 기준 확인 필요');
  });

  it('논리 핀을 쓰는 예시는 usesLogical 로 표시', () => {
    const quiz = buildQuiz([{ id: 'MC1', kind: 'MC' }, { id: 'PB1', kind: 'PB' }]);
    expect(quiz.usesLogical).toBe(true);
    expect(quiz.questions.map((q) => q.prompt)).toEqual(['MC1 · 코일', 'MC1 · a', 'MC1 · b']);
  });
});
