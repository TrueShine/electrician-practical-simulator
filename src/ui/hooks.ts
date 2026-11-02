import { useEffect, useMemo, useState } from 'react';
import type { ComponentSpec } from '../engine/types';
import { layoutSchematic, type SchematicLayout } from './layout';

/** 넓은 화면에서는 기구 상자를 2열로 배치 */
export function useColumns(): number {
  const query = '(min-width: 1100px)';
  const get = () => (typeof window !== 'undefined' && window.matchMedia?.(query).matches ? 2 : 1);
  const [cols, setCols] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setCols(mq.matches ? 2 : 1);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return cols;
}

export function useLayout(components: ComponentSpec[]): SchematicLayout {
  const cols = useColumns();
  return useMemo(() => layoutSchematic(components, cols), [components, cols]);
}
