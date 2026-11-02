/**
 * 기구 정의 → 엔진 내부 요소(부하·접점) 변환.
 *
 * 핀 이름 규칙
 * - spec.pins 가 있으면 그대로 사용한다.
 * - spec.socket 이 있으면 socketPinmaps.json 에서 찾는다. 값이 null 이면 오류(핀맵 미확인).
 * - 둘 다 없으면 "논리 핀맵"을 사용한다. 논리 핀 이름(A1/A2, a1-1/a1-2 …)은
 *   실제 소켓 핀번호가 아니며, 엔진 테스트와 소켓이 없는 문제용이다.
 */
import socketPinmapsJson from './socketPinmaps.json';
import type { ComponentSpec, Element, EngineError, PinMap, PinPair } from '../engine/types';

export type SocketPinmaps = Record<string, Record<string, PinMap | null> | string>;

const defaultSocketPinmaps = socketPinmapsJson as unknown as SocketPinmaps;

export interface BuiltComponent {
  elements: Element[];
  /** 이 기구가 가진 모든 단자 ID ("MC1.A1") */
  terminals: string[];
  errors: EngineError[];
}

/** 코일을 가진 기구 (코일 여자 시 접점 동작) */
const COIL_KINDS = new Set(['MC', 'X']);

function logicalRelayPins(spec: ComponentSpec): PinMap {
  const aCount = spec.aContacts ?? 1;
  const bCount = spec.bContacts ?? 1;
  const a: PinPair[] = [];
  const b: PinPair[] = [];
  for (let i = 1; i <= aCount; i++) a.push([`a${i}-1`, `a${i}-2`]);
  for (let i = 1; i <= bCount; i++) b.push([`b${i}-1`, `b${i}-2`]);
  return { coil: ['A1', 'A2'], a, b };
}

function resolvePinMap(
  spec: ComponentSpec,
  socketPinmaps: SocketPinmaps,
): { pins: PinMap | null; error?: EngineError } {
  if (spec.pins) return { pins: spec.pins };

  if (spec.socket) {
    const byKind = socketPinmaps[spec.kind];
    const map = typeof byKind === 'object' ? byKind[spec.socket] : undefined;
    if (!map) {
      return {
        pins: null,
        error: {
          code: 'pinmap_missing',
          message: `${spec.id}: ${spec.kind} ${spec.socket} 소켓 핀맵이 아직 없습니다 (공개도면 기준 확인 필요).`,
        },
      };
    }
    return { pins: map };
  }

  switch (spec.kind) {
    case 'MC':
    case 'X':
      return { pins: logicalRelayPins(spec) };
    case 'MCCB':
      // 2극: 1-2, 3-4 (전원측 1·3, 부하측 2·4)
      return { pins: { a: [['1', '2'], ['3', '4']] } };
    case 'F':
    case 'PB':
    case 'LS':
    case 'LAMP':
    case 'BZ':
    case 'M':
      return { pins: { a: [['1', '2']] } };
    case 'TB':
      return { pins: {} };
    default:
      return {
        pins: null,
        error: {
          code: 'pinmap_missing',
          message: `${spec.id}: ${spec.kind} 기구는 아직 지원하지 않습니다.`,
        },
      };
  }
}

const t = (id: string, pin: string) => `${id}.${pin}`;
const tp = (id: string, pair: PinPair): PinPair => [t(id, pair[0]), t(id, pair[1])];

export function buildComponent(
  spec: ComponentSpec,
  socketPinmaps: SocketPinmaps = defaultSocketPinmaps,
): BuiltComponent {
  const { pins, error } = resolvePinMap(spec, socketPinmaps);
  if (!pins) return { elements: [], terminals: [], errors: error ? [error] : [] };

  const elements: Element[] = [];
  const id = spec.id;

  if (spec.kind === 'LAMP' || spec.kind === 'BZ' || spec.kind === 'M') {
    // 표시등·부저·전동기(램프 대체)는 단자 2개짜리 부하
    const pair = pins.a?.[0] ?? pins.coil;
    if (pair) {
      elements.push({
        type: 'load',
        owner: id,
        role: spec.kind === 'BZ' ? 'buzzer' : 'lamp',
        terminals: tp(id, pair),
      });
    }
  } else if (spec.kind === 'PB' || spec.kind === 'LS') {
    for (const pair of pins.a ?? []) {
      elements.push({ type: 'contact', owner: id, form: spec.contact ?? 'a', terminals: tp(id, pair) });
    }
  } else {
    if (COIL_KINDS.has(spec.kind) && pins.coil) {
      elements.push({ type: 'load', owner: id, role: 'coil', terminals: tp(id, pins.coil) });
    }
    for (const pair of pins.a ?? []) {
      elements.push({ type: 'contact', owner: id, form: 'a', terminals: tp(id, pair) });
    }
    for (const pair of pins.b ?? []) {
      elements.push({ type: 'contact', owner: id, form: 'b', terminals: tp(id, pair) });
    }
    for (const c of pins.c ?? []) {
      elements.push({ type: 'contact', owner: id, form: 'a', terminals: [t(id, c.com), t(id, c.no)] });
      elements.push({ type: 'contact', owner: id, form: 'b', terminals: [t(id, c.com), t(id, c.nc)] });
    }
  }

  const terminals = new Set<string>();
  for (const el of elements) {
    terminals.add(el.terminals[0]);
    terminals.add(el.terminals[1]);
  }
  if (spec.kind === 'TB') {
    const n = spec.terminals ?? 0;
    for (let i = 1; i <= n; i++) terminals.add(t(id, String(i)));
  }

  return { elements, terminals: [...terminals], errors: [] };
}
