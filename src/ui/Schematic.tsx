/**
 * 회로 화면 (SVG). 기구 상자·단자·전선을 그린다.
 * - 미리보기: 전선 색으로 L측(빨강)/N측(파랑) 전위를 보여준다.
 * - 결선 연습: 단자 탭 2번으로 전선 생성, 전선 탭으로 선택.
 */
import { memo } from 'react';
import type { Netlist } from '../engine/netlist';
import type { SimulatorState } from '../engine/simulator';
import { DEFAULT_TIMER_MS } from '../engine/solver';
import type { ComponentSpec, Wire } from '../engine/types';
import { wirePath, type SchematicLayout } from './layout';

export interface DrawnWire {
  wire: Wire;
  /** 미리 연결된 전선 (지울 수 없음) */
  locked?: boolean;
  /** 사용자 전선 목록에서의 위치 (탭 선택용) */
  userIndex?: number;
}

interface Props {
  layout: SchematicLayout;
  wires: DrawnWire[];
  state?: SimulatorState;
  netlist?: Netlist;
  interactive?: boolean;
  selectedTerminal?: string | null;
  selectedWire?: number | null;
  /** 진단에서 표시할 단자 */
  marked?: ReadonlySet<string>;
  onTerminal?(id: string): void;
  onWire?(userIndex: number): void;
}

const LAMP_COLORS: Record<string, string> = {
  red: 'var(--lamp-red)',
  green: 'var(--lamp-green)',
  yellow: 'var(--lamp-yellow)',
  white: 'var(--lamp-white)',
  orange: 'var(--lamp-yellow)',
};

const LEVEL_NAMES = { low: '저수위', mid: '중간', high: '고수위' } as const;

interface Status {
  text?: string;
  active: boolean;
  warn?: boolean;
  lamp?: string;
}

function statusOf(spec: ComponentSpec, st: SimulatorState | undefined): Status {
  if (!st) return { active: false };
  const coil = st.coils.has(spec.id);
  const out = st.outputs.get(spec.id) === true;
  switch (spec.kind) {
    case 'MC':
    case 'X':
      return { active: coil, text: coil ? '여자' : undefined };
    case 'T': {
      if (!coil) return { active: false };
      const set = spec.setMs ?? DEFAULT_TIMER_MS;
      const el = Math.min(set, st.now - (st.since.get(spec.id) ?? st.now));
      return { active: true, text: `${(el / 1000).toFixed(1)} / ${(set / 1000).toFixed(1)}초` };
    }
    case 'FR':
      return { active: coil, text: coil ? '동작' : undefined };
    case 'FLS': {
      const level = st.levels.get(spec.id) ?? 'low';
      return { active: coil, text: `${LEVEL_NAMES[level]}${coil ? ' · 동작' : ''}` };
    }
    case 'EOCR': {
      const trip = st.toggled.has(spec.id);
      return { active: trip, warn: trip, text: trip ? '트립' : coil ? '정상' : undefined };
    }
    case 'PB':
      return { active: st.pressed.has(spec.id), text: st.pressed.has(spec.id) ? '누름' : undefined };
    case 'LS':
      return { active: st.toggled.has(spec.id), text: st.toggled.has(spec.id) ? '감지' : undefined };
    case 'SS': {
      const labels = spec.positionLabels ?? ['1', '2'];
      return { active: false, text: st.toggled.has(spec.id) ? labels[1] : labels[0] };
    }
    case 'MCCB':
      return { active: st.toggled.has(spec.id), text: st.toggled.has(spec.id) ? 'ON' : 'OFF' };
    case 'LAMP':
      return { active: out, lamp: out ? (LAMP_COLORS[spec.color ?? 'white'] ?? 'var(--lamp-white)') : 'var(--lamp-off)' };
    case 'BZ':
      return { active: out, warn: out, text: out ? '울림' : undefined };
    case 'M':
      return { active: out, text: out ? '운전' : undefined };
    default:
      return { active: false };
  }
}

function potentialClass(p: number | undefined): string {
  return p === 1 ? 'pot-l' : p === -1 ? 'pot-n' : 'pot-0';
}

export const Schematic = memo(function Schematic({
  layout,
  wires,
  state,
  netlist,
  interactive,
  selectedTerminal,
  selectedWire,
  marked,
  onTerminal,
  onWire,
}: Props) {
  const potentialOf = (term: string): number | undefined => {
    if (!state || !netlist) return undefined;
    const node = netlist.nodeOf.get(term);
    return node === undefined ? undefined : state.potentials[node];
  };

  const wireCount = new Map<string, number>();
  for (const { wire } of wires) for (const t of wire) wireCount.set(t, (wireCount.get(t) ?? 0) + 1);

  const midX = (x: number) => {
    const box = layout.boxes.find((b) => x >= b.x && x <= b.x + b.w);
    return box ? box.x + box.w / 2 : layout.width / 2;
  };

  return (
    <svg
      className={`schematic${interactive ? ' interactive' : ''}`}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      role="img"
      aria-label="회로 결선도"
    >
      {layout.boxes.map((box) => {
        const st = box.spec ? statusOf(box.spec, state) : { active: !!state?.power, text: state?.power ? '공급 중' : undefined };
        return (
          <g key={box.id} className={`box${st.active ? ' active' : ''}${st.warn ? ' warn' : ''}`}>
            <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={10} className="box-bg" />
            <text x={box.x + 12} y={box.y + 21}>
              <tspan className="box-title">{box.title}</tspan>
              <tspan className="box-sub" dx={8}>
                {box.subtitle}
              </tspan>
            </text>
            {st.lamp && <circle cx={box.x + box.w - 22} cy={box.y + 17} r={10} fill={st.lamp} className="lamp" />}
            {st.text && (
              <text x={box.x + box.w - 12} y={box.y + 21} textAnchor="end" className="box-status">
                {st.text}
              </text>
            )}
            {box.groups.map((g) => (
              <g key={g.label + g.x + g.y}>
                <rect x={g.x + 2} y={g.y + 4} width={g.w - 4} height={44} rx={6} className="group-bg" />
                <text x={g.x + g.w / 2} y={g.y + 1} textAnchor="middle" className="group-label">
                  {g.label}
                </text>
              </g>
            ))}
          </g>
        );
      })}

      <g className="wires">
        {wires.map(({ wire, locked, userIndex }, i) => {
          const a = layout.terminalPos.get(wire[0]);
          const b = layout.terminalPos.get(wire[1]);
          if (!a || !b) return null;
          const sign = (a.x + b.x) / 2 >= midX((a.x + b.x) / 2) ? 1 : -1;
          const d = wirePath(a, b, sign);
          const selected = userIndex !== undefined && userIndex === selectedWire;
          const cls = `wire ${potentialClass(potentialOf(wire[0]))}${locked ? ' locked' : ''}${selected ? ' selected' : ''}`;
          return (
            <g key={`${wire[0]}-${wire[1]}-${i}`}>
              <path d={d} className={cls} />
              {interactive && !locked && userIndex !== undefined && (
                <path
                  d={d}
                  className="wire-hit"
                  role="button"
                  tabIndex={0}
                  aria-label={`전선 ${wire[0]} – ${wire[1]}${selected ? ' (선택됨)' : ''}`}
                  onClick={() => onWire?.(userIndex)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onWire?.(userIndex);
                    }
                  }}
                />
              )}
            </g>
          );
        })}
      </g>

      <g className="terminals">
        {[...layout.terminalPos.values()].map((t) => {
          const count = wireCount.get(t.id) ?? 0;
          const selected = selectedTerminal === t.id;
          const cls = [
            'terminal',
            potentialClass(potentialOf(t.id)),
            count > 0 ? 'wired' : '',
            count >= 3 ? 'crowded' : '',
            selected ? 'selected' : '',
            marked?.has(t.id) ? 'marked' : '',
          ].join(' ');
          const activate = () => onTerminal?.(t.id);
          return (
            <g
              key={t.id}
              className={cls}
              {...(interactive
                ? {
                    role: 'button',
                    tabIndex: 0,
                    'aria-label': `${t.id} 단자${selected ? ' (선택됨)' : ''}, 전선 ${count}가닥`,
                    onClick: activate,
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        activate();
                      }
                    },
                  }
                : {})}
            >
              {interactive && <circle cx={t.x} cy={t.y} r={17} className="terminal-hit" />}
              <circle cx={t.x} cy={t.y} r={8} className="terminal-dot" />
              <text x={t.x} y={t.y + 22} textAnchor="middle" className="pin-label">
                {t.pin}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
});
