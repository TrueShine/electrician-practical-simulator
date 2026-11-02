/**
 * 조작 패널: 전원, 푸시버튼(누르는 동안만), 유지형 스위치, 수위, 배속.
 * 표시등·부저·코일 상태도 여기서 한눈에 보여준다.
 */
import type { ComponentSpec, FlsLevel } from '../engine/types';
import { SPEEDS } from '../engine/clock';
import type { SimulationApi } from './useSimulation';

const LAMP_NAMES: Record<string, string> = { red: '적색', green: '녹색', yellow: '황색', white: '백색', orange: '주황' };
const LEVELS: { value: FlsLevel; label: string }[] = [
  { value: 'low', label: '저' },
  { value: 'mid', label: '중' },
  { value: 'high', label: '고' },
];

function HoldButton({ spec, api }: { spec: ComponentSpec; api: SimulationApi }) {
  const pressed = api.state.pressed.has(spec.id);
  const down = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    if (!pressed) api.press(spec.id);
  };
  const up = () => {
    if (api.state.pressed.has(spec.id)) api.release(spec.id);
  };
  return (
    <button
      type="button"
      className={`pb pb-${spec.contact ?? 'a'}${pressed ? ' pressed' : ''}`}
      aria-pressed={pressed}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault();
          api.press(spec.id);
        }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          api.release(spec.id);
        }
      }}
    >
      <span className="pb-id">{spec.id}</span>
      <span className="pb-label">{spec.label ?? `${spec.contact ?? 'a'}접점`}</span>
    </button>
  );
}

function Indicator({ spec, api }: { spec: ComponentSpec; api: SimulationApi }) {
  const on = api.state.outputs.get(spec.id) === true || api.state.coils.has(spec.id);
  const cls = spec.kind === 'LAMP' ? `lamp-ind lamp-${spec.color ?? 'white'}` : spec.kind === 'BZ' ? 'bz-ind' : 'coil-ind';
  const name =
    spec.kind === 'LAMP'
      ? `${LAMP_NAMES[spec.color ?? 'white'] ?? ''}${spec.label ? ` ${spec.label}` : ''}`
      : spec.kind === 'BZ'
        ? (spec.label ?? '부저')
        : (spec.label ?? '');
  return (
    <li className={`${cls}${on ? ' on' : ''}`}>
      <span className="dot" aria-hidden="true" />
      <span className="ind-id">{spec.id}</span>
      {name && <span className="ind-name">{name}</span>}
      <span className="sr-only">{on ? '동작' : '정지'}</span>
    </li>
  );
}

export function ControlPanel({ components, api }: { components: ComponentSpec[]; api: SimulationApi }) {
  const { state } = api;
  const pbs = components.filter((c) => c.kind === 'PB');
  const toggles = components.filter((c) => c.kind === 'LS' || c.kind === 'EOCR' || c.kind === 'MCCB');
  const selectors = components.filter((c) => c.kind === 'SS');
  const fls = components.filter((c) => c.kind === 'FLS');
  const indicators = components.filter((c) => ['LAMP', 'BZ', 'M', 'MC', 'X', 'T', 'FR'].includes(c.kind));

  return (
    <section className="panel" aria-label="조작 패널">
      {api.alerts.length > 0 && (
        <div className="alert" role="alert">
          {api.alerts.map((a) => (
            <p key={a.message}>{a.message}</p>
          ))}
          <button type="button" className="link" onClick={api.dismissAlerts}>
            닫기
          </button>
        </div>
      )}

      <div className="panel-row">
        <button
          type="button"
          className={`power${state.power ? ' on' : ''}`}
          aria-pressed={state.power}
          onClick={() => (state.power ? api.powerOff() : api.powerOn())}
        >
          {state.power ? '전원 차단' : '전원 투입'}
        </button>
        <span className="clock" aria-label="경과 시간">
          {(state.now / 1000).toFixed(1)}초
        </span>
        <div className="seg" role="group" aria-label="배속">
          {SPEEDS.map((s) => (
            <button key={s} type="button" aria-pressed={api.speed === s} onClick={() => api.setSpeed(s)}>
              {s}x
            </button>
          ))}
        </div>
        <button type="button" className="ghost" aria-pressed={api.paused} onClick={() => api.setPaused(!api.paused)}>
          {api.paused ? '재생' : '일시정지'}
        </button>
        <button type="button" className="ghost" onClick={api.reset}>
          초기화
        </button>
      </div>

      {pbs.length > 0 && (
        <div className="panel-block">
          <h3>푸시버튼 (누르고 있는 동안 동작)</h3>
          <div className="pb-row">
            {pbs.map((c) => (
              <HoldButton key={c.id} spec={c} api={api} />
            ))}
          </div>
        </div>
      )}

      {(toggles.length > 0 || selectors.length > 0 || fls.length > 0) && (
        <div className="panel-block">
          <h3>스위치</h3>
          <div className="switch-grid">
            {toggles.map((c) => {
              const on = state.toggled.has(c.id);
              const label = c.kind === 'MCCB' ? (on ? 'ON' : 'OFF') : c.kind === 'EOCR' ? (on ? '트립' : '정상') : on ? '감지' : '해제';
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`toggle${on ? ' on' : ''}${c.kind === 'EOCR' && on ? ' warn' : ''}`}
                  aria-pressed={on}
                  onClick={() => api.setToggle(c.id, !on)}
                >
                  <span className="toggle-id">{c.id}</span>
                  <span>{label}</span>
                </button>
              );
            })}
            {selectors.map((c) => {
              const labels = c.positionLabels ?? ['1', '2'];
              const pos = state.toggled.has(c.id) ? 1 : 0;
              return (
                <div key={c.id} className="seg labeled" role="group" aria-label={`${c.id} 셀렉터 스위치`}>
                  <span className="toggle-id">{c.id}</span>
                  {labels.map((l, i) => (
                    <button key={l} type="button" aria-pressed={pos === i} onClick={() => api.setToggle(c.id, i === 1)}>
                      {l}
                    </button>
                  ))}
                </div>
              );
            })}
            {fls.map((c) => {
              const level = state.levels.get(c.id) ?? 'low';
              return (
                <div key={c.id} className="seg labeled" role="group" aria-label={`${c.id} 수위`}>
                  <span className="toggle-id">{c.id} 수위</span>
                  {LEVELS.map((l) => (
                    <button key={l.value} type="button" aria-pressed={level === l.value} onClick={() => api.setLevel(c.id, l.value)}>
                      {l.label}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {indicators.length > 0 && (
        <div className="panel-block">
          <h3>동작 상태</h3>
          <ul className="indicators">
            {indicators.map((c) => (
              <Indicator key={c.id} spec={c} api={api} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
