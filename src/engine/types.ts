/**
 * 시뮬레이션 엔진 공용 타입.
 * 엔진은 React 등 UI 코드를 import하지 않는다.
 */

/** 전원 단자 (단상 2선) */
export const POWER_L = 'L';
export const POWER_N = 'N';

/** 기구 종류 코드 */
export type ComponentKind =
  | 'MCCB'
  | 'F'
  | 'EOCR'
  | 'MC'
  | 'X'
  | 'T'
  | 'FR'
  | 'FLS'
  | 'PB'
  | 'SS'
  | 'LS'
  | 'LAMP'
  | 'BZ'
  | 'TB'
  | 'M';

export type ContactForm = 'a' | 'b';

/** 플로트레스 스위치 수위: 저수위(E2 아래) / 중간(E2~E1) / 고수위(E1 이상) */
export type FlsLevel = 'low' | 'mid' | 'high';

/** 두 단자 사이를 잇는 접점 쌍 (기구 내부 핀 이름) */
export type PinPair = [string, string];

/** c접점(전환접점): 공통-a(no), 공통-b(nc) */
export interface CPins {
  com: string;
  no: string;
  nc: string;
}

/**
 * 기구 내부 핀맵. 값은 기구 내부의 핀 이름.
 * 실제 소켓 핀번호는 src/components/socketPinmaps.json 에서 공개도면 기준으로 채운다.
 */
export interface PinMap {
  /** 코일(조작 전원) 단자 */
  coil?: PinPair;
  /** a접점 (순시) */
  a?: PinPair[];
  /** b접점 (순시) */
  b?: PinPair[];
  /** c접점 (순시) */
  c?: CPins[];
  /** 타이머 한시 a접점 */
  ta?: PinPair[];
  /** 타이머 한시 b접점 */
  tb?: PinPair[];
  /** 타이머 한시 c접점 */
  tc?: CPins[];
  /** 플로트레스 스위치 전극 단자 (전기적 계산에는 쓰지 않고 결선 비교에만 사용) */
  electrodes?: string[];
}

/** 문제 데이터에 들어가는 기구 정의 */
export interface ComponentSpec {
  id: string;
  kind: ComponentKind;
  /** 표시 이름 (예: "기동") */
  label?: string;
  /** PB, LS 의 접점 형식 (기본 a) */
  contact?: ContactForm;
  /** 표시등 색 (표시용) */
  color?: string;
  /** 소켓 종류. 지정하면 socketPinmaps.json 의 핀맵을 사용 */
  socket?: string;
  /** 핀맵 직접 지정 (socket 보다 우선) */
  pins?: PinMap;
  /** 논리 핀맵 사용 시 순시 접점 개수 */
  aContacts?: number;
  bContacts?: number;
  /** 논리 핀맵 사용 시 타이머 한시 접점 개수 */
  timedA?: number;
  timedB?: number;
  /** 단자대 단자 수 (TB) */
  terminals?: number;
  /** 타이머 설정 시간 (ms) */
  setMs?: number;
  /** 플리커 반주기 (ms): 이 시간마다 접점이 반전 */
  periodMs?: number;
  /** 셀렉터 스위치 위치 이름 [nc 쪽, no 쪽] */
  positionLabels?: [string, string];
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
  /** 타이머 한시 접점 여부 */
  timed?: boolean;
  terminals: PinPair;
}

export type Element = LoadElement | ContactElement;

/** 조작 입력 상태 */
export interface Inputs {
  /** 전원 공급 여부 */
  power: boolean;
  /** 누르고 있는 푸시버튼 ID */
  pressed: ReadonlySet<string>;
  /** 동작 상태인 유지형 입력 ID (MCCB ON, LS 감지, SS 두 번째 위치, EOCR 트립) */
  toggled: ReadonlySet<string>;
  /** 플로트레스 스위치별 수위 */
  levels: ReadonlyMap<string, FlsLevel>;
}

export type EngineErrorCode = 'short' | 'oscillation' | 'unknown_terminal' | 'pinmap_missing';

export interface EngineError {
  code: EngineErrorCode;
  message: string;
}
