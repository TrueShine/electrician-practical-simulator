/**
 * 화면 상태 (Zustand).
 * 사용자 결선과 마지막으로 연 문제·모드는 localStorage 에 저장한다 (실패해도 동작에는 지장 없음).
 */
import { create } from 'zustand';
import type { Wire } from '../engine/types';
import { PROBLEMS } from '../problems';

export type Mode = 'preview' | 'wiring' | 'quiz';

const STORAGE_KEY = 'eps:v1';

interface Persisted {
  problemId: string;
  mode: Mode;
  wires: Record<string, Wire[]>;
}

function load(): Partial<Persisted> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Persisted>) : {};
  } catch {
    return {};
  }
}

function save(p: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // 저장 공간이 없거나 차단된 환경: 무시
  }
}

const sameWire = (a: Wire, b: Wire) => (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);

interface UiState extends Persisted {
  history: Record<string, Wire[][]>;
  future: Record<string, Wire[][]>;
  selectedTerminal: string | null;
  selectedWire: number | null;
  setProblem(id: string): void;
  setMode(mode: Mode): void;
  tapTerminal(id: string): void;
  tapWire(index: number): void;
  deleteSelectedWire(): void;
  clearWires(): void;
  undo(): void;
  redo(): void;
  clearSelection(): void;
}

const initial = load();
const validProblem = PROBLEMS.some((p) => p.id === initial.problemId) ? initial.problemId! : PROBLEMS[0].id;

export const useUi = create<UiState>((set, get) => {
  /** 현재 문제의 결선을 바꾸고 되돌리기 기록을 남긴다 */
  const commit = (next: Wire[]) => {
    const { problemId, wires, history } = get();
    const prev = wires[problemId] ?? [];
    set({
      wires: { ...wires, [problemId]: next },
      history: { ...history, [problemId]: [...(history[problemId] ?? []), prev].slice(-200) },
      future: { ...get().future, [problemId]: [] },
      selectedTerminal: null,
      selectedWire: null,
    });
  };

  return {
    problemId: validProblem,
    mode: initial.mode === 'wiring' || initial.mode === 'quiz' ? initial.mode : 'preview',
    wires: initial.wires ?? {},
    history: {},
    future: {},
    selectedTerminal: null,
    selectedWire: null,

    setProblem: (id) => set({ problemId: id, selectedTerminal: null, selectedWire: null }),
    setMode: (mode) => set({ mode, selectedTerminal: null, selectedWire: null }),

    tapTerminal: (id) => {
      const { selectedTerminal, wires, problemId } = get();
      if (selectedTerminal === null) return set({ selectedTerminal: id, selectedWire: null });
      if (selectedTerminal === id) return set({ selectedTerminal: null });
      const current = wires[problemId] ?? [];
      const wire: Wire = [selectedTerminal, id];
      if (current.some((w) => sameWire(w, wire))) return set({ selectedTerminal: null });
      commit([...current, wire]);
    },

    tapWire: (index) =>
      set((s) => ({ selectedWire: s.selectedWire === index ? null : index, selectedTerminal: null })),

    deleteSelectedWire: () => {
      const { selectedWire, wires, problemId } = get();
      const current = wires[problemId] ?? [];
      if (selectedWire === null || !current[selectedWire]) return;
      commit(current.filter((_, i) => i !== selectedWire));
    },

    clearWires: () => {
      const { wires, problemId } = get();
      if ((wires[problemId] ?? []).length) commit([]);
    },

    undo: () => {
      const { problemId, wires, history, future } = get();
      const past = history[problemId] ?? [];
      if (!past.length) return;
      set({
        wires: { ...wires, [problemId]: past[past.length - 1] },
        history: { ...history, [problemId]: past.slice(0, -1) },
        future: { ...future, [problemId]: [...(future[problemId] ?? []), wires[problemId] ?? []] },
        selectedTerminal: null,
        selectedWire: null,
      });
    },

    redo: () => {
      const { problemId, wires, history, future } = get();
      const fut = future[problemId] ?? [];
      if (!fut.length) return;
      set({
        wires: { ...wires, [problemId]: fut[fut.length - 1] },
        future: { ...future, [problemId]: fut.slice(0, -1) },
        history: { ...history, [problemId]: [...(history[problemId] ?? []), wires[problemId] ?? []] },
        selectedTerminal: null,
        selectedWire: null,
      });
    },

    clearSelection: () => set({ selectedTerminal: null, selectedWire: null }),
  };
});

useUi.subscribe((s) => save({ problemId: s.problemId, mode: s.mode, wires: s.wires }));
