/**
 * 기구 정의 → 엔진 내부 요소(부하·접점) 변환, 그리고 화면용 단자 그룹 정보.
 *
 * 핀 이름 규칙
 * - spec.pins 가 있으면 그대로 사용한다.
 * - spec.socket 이 있으면 socketPinmaps.json 에서 찾는다. 값이 null 이면 오류(핀맵 미확인).
 * - 둘 다 없으면 "논리 핀맵"을 사용한다. 논리 핀 이름(A1/A2, a1-1 …)은
 *   실제 소켓 핀번호가 아니며, 엔진 테스트와 예시 문제용이다.
 */
import socketPinmapsJson from './socketPinmaps.json';
import type { ComponentKind, ComponentSpec, CPins, Element, EngineError, PinMap, PinPair } from '../engine/types';

export type SocketPinmaps = Record<string, Record<string, PinMap | null> | string>;

export const defaultSocketPinmaps = socketPinmapsJson as unknown as SocketPinmaps;

export const KIND_NAMES: Record<ComponentKind, string> = {
  MCCB: '배선용 차단기',
  F: '퓨즈',
  EOCR: '전자식 과전류계전기',
  MC: '전자접촉기',
  X: '릴레이',
  T: '타이머',
  FR: '플리커 릴레이',
  FLS: '플로트레스 스위치',
  PB: '푸시버튼',
  SS: '셀렉터 스위치',
  LS: '리밋 스위치',
  LAMP: '표시등',
  BZ: '부저',
  TB: '단자대',
  M: '전동기',
};

/** 코일 여자로 접점이 움직이는 기구 */
export const COIL_KINDS: ReadonlySet<ComponentKind> = new Set(['MC', 'X', 'T', 'FR', 'FLS', 'EOCR']);

export interface BuiltComponent {
  elements: Element[];
  /** 이 기구가 가진 모든 단자 ID ("MC1.A1") */
  terminals: string[];
  errors: EngineError[];
}

export type PinMapSource = 'custom' | 'socket' | 'logical';

function pairs(prefix: string, count: number): PinPair[] {
  const out: PinPair[] = [];
  for (let i = 1; i <= count; i++) out.push([`${prefix}${i}-1`, `${prefix}${i}-2`]);
  return out;
}

function logicalPinMap(spec: ComponentSpec): PinMap | null {
  switch (spec.kind) {
    case 'MC':
    case 'X':
    case 'FR':
    case 'EOCR':
      return { coil: ['A1', 'A2'], a: pairs('a', spec.aContacts ?? 1), b: pairs('b', spec.bContacts ?? 1) };
    case 'T':
      return {
        coil: ['A1', 'A2'],
        a: pairs('a', spec.aContacts ?? 0),
        b: pairs('b', spec.bContacts ?? 0),
        ta: pairs('ta', spec.timedA ?? 1),
        tb: pairs('tb', spec.timedB ?? 1),
      };
    case 'FLS':
      return { coil: ['A1', 'A2'], c: [{ com: 'COM', no: 'NO', nc: 'NC' }], electrodes: ['E1', 'E2', 'E3'] };
    case 'SS':
      return { c: [{ com: 'C', nc: '1', no: '2' }] };
    case 'MCCB':
      // 2극: 1-2, 3-4 (전원측 1·3, 부하측 2·4)
      return { a: [['1', '2'], ['3', '4']] };
    case 'F':
    case 'PB':
    case 'LS':
    case 'LAMP':
    case 'BZ':
    case 'M':
      return { a: [['1', '2']] };
    case 'TB': {
      const n = spec.terminals ?? 0;
      return { electrodes: Array.from({ length: n }, (_, i) => String(i + 1)) };
    }
    default:
      return null;
  }
}

export function resolvePinMap(
  spec: ComponentSpec,
  socketPinmaps: SocketPinmaps = defaultSocketPinmaps,
): { pins: PinMap | null; source?: PinMapSource; error?: EngineError } {
  if (spec.pins) return { pins: spec.pins, source: 'custom' };

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
    return { pins: map, source: 'socket' };
  }

  const logical = logicalPinMap(spec);
  if (!logical) {
    return {
      pins: null,
      error: { code: 'pinmap_missing', message: `${spec.id}: ${spec.kind} 기구는 아직 지원하지 않습니다.` },
    };
  }
  return { pins: logical, source: 'logical' };
}

const t = (id: string, pin: string) => `${id}.${pin}`;
const tp = (id: string, pair: PinPair): PinPair => [t(id, pair[0]), t(id, pair[1])];

function pushC(elements: Element[], id: string, cs: CPins[] | undefined, timed: boolean) {
  for (const c of cs ?? []) {
    elements.push({ type: 'contact', owner: id, form: 'a', timed, terminals: [t(id, c.com), t(id, c.no)] });
    elements.push({ type: 'contact', owner: id, form: 'b', timed, terminals: [t(id, c.com), t(id, c.nc)] });
  }
}

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
    pushC(elements, id, pins.c, false);
  } else {
    if (COIL_KINDS.has(spec.kind) && pins.coil) {
      elements.push({ type: 'load', owner: id, role: 'coil', terminals: tp(id, pins.coil) });
    }
    for (const pair of pins.a ?? []) elements.push({ type: 'contact', owner: id, form: 'a', terminals: tp(id, pair) });
    for (const pair of pins.b ?? []) elements.push({ type: 'contact', owner: id, form: 'b', terminals: tp(id, pair) });
    pushC(elements, id, pins.c, false);
    for (const pair of pins.ta ?? [])
      elements.push({ type: 'contact', owner: id, form: 'a', timed: true, terminals: tp(id, pair) });
    for (const pair of pins.tb ?? [])
      elements.push({ type: 'contact', owner: id, form: 'b', timed: true, terminals: tp(id, pair) });
    pushC(elements, id, pins.tc, true);
  }

  const terminals: string[] = [];
  const seen = new Set<string>();
  const add = (term: string) => {
    if (!seen.has(term)) {
      seen.add(term);
      terminals.push(term);
    }
  };
  for (const el of elements) {
    add(el.terminals[0]);
    add(el.terminals[1]);
  }
  for (const e of pins.electrodes ?? []) add(t(id, e));

  return { elements, terminals, errors: [] };
}

/** 화면 표시용 단자 그룹 */
export interface TerminalGroup {
  /** 그룹 이름 (예: "코일", "a접점1") */
  label: string;
  /** 전체 단자 ID */
  terminals: string[];
}

/** 기구의 단자를 의미 단위로 묶는다 (화면·퀴즈용) */
export function terminalGroups(
  spec: ComponentSpec,
  socketPinmaps: SocketPinmaps = defaultSocketPinmaps,
): TerminalGroup[] {
  const { pins } = resolvePinMap(spec, socketPinmaps);
  if (!pins) return [];
  const id = spec.id;
  const groups: TerminalGroup[] = [];
  const pairGroups = (list: PinPair[] | undefined, name: string) =>
    (list ?? []).forEach((p, i) => groups.push({ label: list!.length > 1 ? `${name}${i + 1}` : name, terminals: tp(id, p) }));
  const cGroups = (list: CPins[] | undefined, name: string) =>
    (list ?? []).forEach((c, i) =>
      groups.push({
        label: list!.length > 1 ? `${name}${i + 1}` : name,
        terminals: [t(id, c.com), t(id, c.no), t(id, c.nc)],
      }),
    );

  switch (spec.kind) {
    case 'LAMP':
    case 'BZ':
    case 'M':
      pairGroups(pins.a ?? (pins.coil ? [pins.coil] : []), spec.kind === 'BZ' ? '부저' : spec.kind === 'M' ? '전동기' : '램프');
      break;
    case 'PB':
    case 'LS':
      pairGroups(pins.a, `${spec.contact ?? 'a'}접점`);
      cGroups(pins.c, 'c접점');
      break;
    case 'MCCB':
      pairGroups(pins.a, '극');
      break;
    case 'F':
      pairGroups(pins.a, '퓨즈');
      break;
    case 'SS':
      cGroups(pins.c, spec.positionLabels ? `${spec.positionLabels[0]}/${spec.positionLabels[1]}` : '전환');
      break;
    case 'TB':
      if (pins.electrodes?.length) groups.push({ label: '단자', terminals: pins.electrodes.map((e) => t(id, e)) });
      break;
    default:
      if (pins.coil) groups.push({ label: spec.kind === 'FLS' || spec.kind === 'EOCR' ? '전원' : '코일', terminals: tp(id, pins.coil) });
      pairGroups(pins.a, 'a');
      pairGroups(pins.b, 'b');
      cGroups(pins.c, 'c');
      pairGroups(pins.ta, '한시a');
      pairGroups(pins.tb, '한시b');
      cGroups(pins.tc, '한시c');
      if (pins.electrodes?.length) groups.push({ label: '전극', terminals: pins.electrodes.map((e) => t(id, e)) });
  }
  return groups;
}
