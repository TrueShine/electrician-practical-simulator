/**
 * 가상 시계. 타이머·플리커 지연은 모두 이 시계(ms) 기준으로 계산한다.
 * setTimeout 을 쓰지 않으므로 테스트에서 시간을 마음대로 진행시킬 수 있다.
 * 실제 시간과의 동기화(배속 재생)는 UI 쪽에서 advance() 를 호출해 처리한다.
 */
export class VirtualClock {
  private t = 0;

  get now(): number {
    return this.t;
  }

  /** 시계를 target 시각으로 이동 (뒤로 가지 않음) */
  set(target: number): void {
    if (target > this.t) this.t = target;
  }

  reset(): void {
    this.t = 0;
  }
}

/** 지원 배속 */
export const SPEEDS = [1, 5] as const;
export type Speed = (typeof SPEEDS)[number];
