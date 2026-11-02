/**
 * 시뮬레이션 엔진 공용 타입.
 * 엔진은 React 등 UI 코드를 import하지 않는다.
 */

/** 전원 단자 (단상 2선) */
export const POWER_L = 'L';
export const POWER_N = 'N';

/** 기구 종류 코드. 1단계에서는 일부만 동작을 구현한다. */
export type ComponentKind =
  | 'MCCB'
  | 'F'
  | 'EOCR' // 2단계
  | 'MC'
  | 'X'
  | 'T' // 2단계
  | 'FR' // 2단계
  | 'FLS' // 2단계
  | 'PB'
  | 'SS' // 2단계 이후
  | 'LS'
  | 'LAMP'
  | 'BZ'
  | 'TB'
  | 'M';

export type ContactForm = 'a' | 'b';

/** 두 단자 사이를 잇는 접점 쌍 (기구 내부 핀 이름) */
export type PinPair = [string, string];

/** c접점(전환접점): 공통-a, 공통-b */
export interface CPins {
  com: string;
  no: string;
  nc: string;
}

/**
 * 기구 내부 핀맵. 값은 기구 내부의 핀 이름(예: "1", "A1").
 * 실제 소켓 핀번호는 src/components/socketPinmaps.json 에서 공개도면 기준으로 채운다.
 */
export interface PinMap {
  coil?: PinPair;
  a?: PinPair[];
  b?: PinPair[];
  c?: CPins[];
}

/** 문제 데이터에 들어가는 기구 정의 */
export interface ComponentSpec {
  id: string;
  kind: ComponentKind;
  /** PB, LS 의 접점 형식 (기본 a) */
  contact?: ContactForm;
  /** 표시등 색 (표시용) */
  color?: string;
  /** 소켓 종류. 지정하면 socketPinmaps.json 의 핀맵을 사용 */
  socket?: string;
  /** 핀맵 직접 지정 (socket 보다 우선) */
  pins?: PinMap;
  /** 논리 핀맵 사용 시 접점 개수 (MC/X) */
  aContacts?: number;
  bContacts?: number;
  /** 단자대 단자 수 (TB) */
  terminals?: number;
}

export type Wire = [string, string];

export interface Circuit {
  components: ComponentSpec[];
  wires: Wire[];
}

/** 부하 역할 */
export type LoadRole = 'coil' | 'lamp' | 'buzzer';

/** 기구 내부 요소: 부하 (양단 전압 시 동작) */
export interface LoadElement {
  type: 'load';
  owner: string;
  role: LoadRole;
  /** 전체 단자 ID ("MC1.A1") */
  terminals: PinPair;
}

/** 기구 내부 요소: 접점 (owner 가 동작하면 a는 닫히고 b는 열림) */
export interface ContactElement {
  type: 'contact';
  owner: string;
  form: ContactForm;
  terminals: PinPair;
}

export type Element = LoadElement | ContactElement;

/** 조작 입력 상태 */
export interface Inputs {
  /** 전원 공급 여부 */
  power: boolean;
  /** 누르고 있는 푸시버튼 ID */
  pressed: ReadonlySet<string>;
  /** 동작(ON) 상태인 유지형 스위치 ID (LS, MCCB 등) */
  toggled: ReadonlySet<string>;
}

export type EngineErrorCode = 'short' | 'oscillation' | 'unknown_terminal' | 'pinmap_missing';

export interface EngineError {
  code: EngineErrorCode;
  message: string;
}
