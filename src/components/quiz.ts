/**
 * 핀번호 퀴즈: 문제에 쓰인 소켓 기구의 각 접점·코일에 해당하는 핀을 맞힌다.
 * 핀 데이터는 socketPinmaps.json (또는 문제의 pins 지정) 에서 가져온다.
 */
import type { ComponentSpec } from '../engine/types';
import { buildComponent, COIL_KINDS, resolvePinMap, terminalGroups, type PinMapSource, type SocketPinmaps } from './library';

export interface QuizQuestion {
  componentId: string;
  /** 예: "MC1 · a접점" */
  prompt: string;
  /** 정답 핀 이름 (순서 의미: 3개짜리는 공통 → a(NO) → b(NC), 전극은 E1 → E2 → E3) */
  answer: string[];
  ordered: boolean;
  /** 선택지: 그 기구의 모든 핀 이름 */
  choices: string[];
  source: PinMapSource;
}

export interface QuizBuild {
  questions: QuizQuestion[];
  /** 핀맵이 없어 퀴즈를 만들 수 없는 기구 안내 */
  missing: string[];
  /** 논리 핀 이름을 쓰는 기구가 있는지 (실제 소켓 번호가 아님) */
  usesLogical: boolean;
}

const pinName = (id: string, term: string) => term.slice(id.length + 1);

function naturalSort(a: string, b: string) {
  return a.localeCompare(b, 'ko', { numeric: true });
}

export function buildQuiz(components: ComponentSpec[], socketPinmaps?: SocketPinmaps): QuizBuild {
  const questions: QuizQuestion[] = [];
  const missing: string[] = [];
  let usesLogical = false;

  for (const spec of components) {
    if (!COIL_KINDS.has(spec.kind) && spec.kind !== 'SS') continue;
    const { pins, source, error } = resolvePinMap(spec, socketPinmaps);
    if (!pins || !source) {
      missing.push(error?.message ?? `${spec.id}: 핀맵 없음`);
      continue;
    }
    if (source === 'logical') usesLogical = true;
    const choices = buildComponent(spec, socketPinmaps)
      .terminals.map((t) => pinName(spec.id, t))
      .sort(naturalSort);
    for (const g of terminalGroups(spec, socketPinmaps)) {
      questions.push({
        componentId: spec.id,
        prompt: `${spec.id} · ${g.label}`,
        answer: g.terminals.map((t) => pinName(spec.id, t)),
        ordered: g.terminals.length > 2,
        choices,
        source,
      });
    }
  }
  return { questions, missing, usesLogical };
}

export function checkAnswer(q: QuizQuestion, picked: string[]): boolean {
  if (picked.length !== q.answer.length) return false;
  if (q.ordered) return picked.every((p, i) => p === q.answer[i]);
  const set = new Set(q.answer);
  return picked.every((p) => set.has(p)) && new Set(picked).size === picked.length;
}
