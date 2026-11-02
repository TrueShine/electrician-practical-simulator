/**
 * 회로 화면 배치: 기구마다 상자 하나, 상자 안에 단자 그룹을 가로로 배치.
 * 좌표는 SVG viewBox 단위. 화면 폭에 맞게 SVG 가 비율대로 줄어든다.
 */
import { KIND_NAMES, terminalGroups } from '../components/library';
import type { ComponentSpec } from '../engine/types';
import { POWER_L, POWER_N } from '../engine/types';

export const PITCH = 36; // 단자 간격 (터치 대상 확보)
const GROUP_GAP = 12;
const PAD = 12;
const HEADER = 34;
const ROW_H = 58;
export const BOX_W = 340;
const COL_GAP = 28;
const MARGIN = 14;

export interface TerminalPos {
  id: string;
  pin: string;
  x: number;
  y: number;
}

export interface GroupLayout {
  label: string;
  x: number;
  y: number;
  w: number;
  terminals: TerminalPos[];
}

export interface BoxLayout {
  id: string;
  spec?: ComponentSpec;
  title: string;
  subtitle: string;
  x: number;
  y: number;
  w: number;
  h: number;
  groups: GroupLayout[];
}

export interface SchematicLayout {
  width: number;
  height: number;
  boxes: BoxLayout[];
  terminalPos: Map<string, TerminalPos>;
}

interface GroupInput {
  label: string;
  terminals: string[];
}

function layoutBox(id: string, title: string, subtitle: string, groupsIn: GroupInput[], spec?: ComponentSpec) {
  const groups: GroupLayout[] = [];
  let x = PAD;
  let row = 0;
  for (const g of groupsIn) {
    const w = g.terminals.length * PITCH;
    if (x + w > BOX_W - PAD && x > PAD) {
      row++;
      x = PAD;
    }
    const y = HEADER + row * ROW_H;
    groups.push({
      label: g.label,
      x,
      y,
      w,
      terminals: g.terminals.map((term, i) => ({
        id: term,
        pin: term.includes('.') ? term.slice(term.indexOf('.') + 1) : term,
        x: x + PITCH / 2 + i * PITCH,
        y: y + 26,
      })),
    });
    x += w + GROUP_GAP;
  }
  const rows = groupsIn.length ? row + 1 : 0;
  return { id, spec, title, subtitle, x: 0, y: 0, w: BOX_W, h: HEADER + rows * ROW_H + 4, groups };
}

export function layoutSchematic(components: ComponentSpec[], columns: number): SchematicLayout {
  const boxes: BoxLayout[] = [
    layoutBox('전원', '전원', '단상 2선 (시험용)', [{ label: '전원', terminals: [POWER_L, POWER_N] }]),
    ...components.map((spec) =>
      layoutBox(
        spec.id,
        spec.label ? `${spec.id} · ${spec.label}` : spec.id,
        KIND_NAMES[spec.kind] ?? spec.kind,
        terminalGroups(spec),
        spec,
      ),
    ),
  ];

  const cols = Math.max(1, columns);
  const colY = Array.from({ length: cols }, () => MARGIN);
  for (const box of boxes) {
    // 가장 짧은 열에 배치
    let c = 0;
    for (let i = 1; i < cols; i++) if (colY[i] < colY[c]) c = i;
    box.x = MARGIN + c * (BOX_W + COL_GAP);
    box.y = colY[c];
    colY[c] += box.h + 16;
  }

  const terminalPos = new Map<string, TerminalPos>();
  for (const box of boxes) {
    for (const g of box.groups) {
      for (const t of g.terminals) {
        t.x += box.x;
        t.y += box.y;
        terminalPos.set(t.id, t);
      }
      g.x += box.x;
      g.y += box.y;
    }
  }

  return {
    width: MARGIN * 2 + cols * BOX_W + (cols - 1) * COL_GAP,
    height: Math.max(...colY) + MARGIN,
    boxes,
    terminalPos,
  };
}

/** 두 단자를 잇는 곡선 경로 */
export function wirePath(a: { x: number; y: number }, b: { x: number; y: number }, bulgeSign: number): string {
  const dy = b.y - a.y;
  if (Math.abs(dy) < 6) {
    const sag = 18 + Math.abs(b.x - a.x) * 0.12;
    const mx = (a.x + b.x) / 2;
    return `M${a.x},${a.y} Q${mx},${a.y + sag * 2} ${b.x},${b.y}`;
  }
  const dx = Math.min(150, Math.max(28, Math.abs(dy) * 0.22)) * bulgeSign;
  return `M${a.x},${a.y} C${a.x + dx},${a.y + dy * 0.15} ${b.x + dx},${b.y - dy * 0.15} ${b.x},${b.y}`;
}
