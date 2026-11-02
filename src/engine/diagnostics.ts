/**
 * 오류 진단: 단락·발진, 자기유지/인터록 누락, 미결선·연결 누락·오결선, 시험장 관행 경고.
 * 결과는 사람이 읽을 수 있는 문장으로 만든다.
 */
import type { Netlist } from './netlist';
import type { ScenarioRun } from './scenario';
import type { ComponentSpec, Wire } from './types';

export type DiagnosticKind =
  | 'short'
  | 'oscillation'
  | 'unknown_terminal'
  | 'pinmap_missing'
  | 'self_hold'
  | 'interlock'
  | 'open'
  | 'missing_link'
  | 'wrong_link'
  | 'unused_terminal'
  | 'crowded';

export interface Diagnostic {
  kind: DiagnosticKind;
  /** error: 동작에 영향, warning: 감점 경고 */
  severity: 'error' | 'warning';
  message: string;
  /** 화면에서 강조할 단자 */
  terminals: string[];
}

const RELAY_KINDS = new Set(['MC', 'X']);

/** 단락·발진 (시나리오 실행 중 발생) */
export function engineDiagnostics(runs: ScenarioRun[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  const seen = new Set<string>();
  for (const run of runs) {
    for (const e of run.errors) {
      if (e.code !== 'short' && e.code !== 'oscillation') continue;
      const key = `${e.code}:${run.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind: e.code, severity: 'error', message: `[${run.name}] ${e.message}`, terminals: [] });
    }
  }
  return out;
}

/** 동작 비교로 찾는 자기유지·인터록 누락 */
export function behaviorDiagnostics(
  answerRuns: ScenarioRun[],
  userRuns: ScenarioRun[],
  components: ComponentSpec[],
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const kindOf = new Map(components.map((c) => [c.id, c.kind]));

  // 자기유지 누락: 버튼을 누르는 동안엔 동작했는데, 이후 '동작'이어야 할 때 꺼져 있음
  const selfHold = new Set<string>();
  for (const run of userRuns) {
    for (const check of run.checks) {
      if (check.ok || check.expected !== 'on' || !RELAY_KINDS.has(kindOf.get(check.target) ?? '')) continue;
      const wasOnWhilePressed = run.pressSamples.some((p) => p.state.coils.has(check.target));
      if (wasOnWhilePressed && !selfHold.has(check.target)) {
        selfHold.add(check.target);
        out.push({
          kind: 'self_hold',
          severity: 'error',
          message: `자기유지 누락 의심: ${check.target}이(가) 버튼을 누르는 동안만 동작하고 떼면 꺼집니다. ${check.target}의 a접점을 기동 버튼과 병렬로 연결했는지 확인하세요.`,
          terminals: [],
        });
      }
    }
  }

  // 인터록 누락: 정답에서는 동시에 동작하지 않는 두 코일이 동시에 동작
  const coilIds = components.filter((c) => RELAY_KINDS.has(c.kind)).map((c) => c.id);
  const pairsOn = (runs: ScenarioRun[]) => {
    const pairs = new Set<string>();
    for (const run of runs) {
      for (const s of run.samples) {
        for (let i = 0; i < coilIds.length; i++) {
          for (let j = i + 1; j < coilIds.length; j++) {
            if (s.coils.has(coilIds[i]) && s.coils.has(coilIds[j])) pairs.add(`${coilIds[i]}|${coilIds[j]}`);
          }
        }
      }
    }
    return pairs;
  };
  const answerPairs = pairsOn(answerRuns);
  for (const pair of pairsOn(userRuns)) {
    if (answerPairs.has(pair)) continue;
    const [a, b] = pair.split('|');
    out.push({
      kind: 'interlock',
      severity: 'error',
      message: `인터록 누락 의심: ${a}와(과) ${b}가 동시에 동작합니다. 상대 접촉기의 b접점을 각 코일 회로에 직렬로 넣었는지 확인하세요.`,
      terminals: [],
    });
  }
  return out;
}

function wireCounts(wires: Wire[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const w of wires) for (const t of w) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

function groupBy<T>(items: T[], key: (t: T) => number): Map<number, T[]> {
  const m = new Map<number, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
}

/**
 * 결선 비교 (정답과 사용자 회로의 등전위 노드 분할 비교).
 * includeLinks=false 면 미결선·연결 누락·오결선은 건너뛰고 경고만 낸다
 * (동작이 정답과 같으면 배선 경로가 달라도 정답으로 보기 때문).
 */
export function connectionDiagnostics(
  answer: Netlist,
  user: Netlist,
  userAllWires: Wire[],
  includeLinks: boolean,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const counts = wireCounts(userAllWires);
  const terminals = answer.allTerminals;
  const aNode = (t: string) => answer.nodeOf.get(t)!;
  const uNode = (t: string) => user.nodeOf.get(t) ?? -1;

  const answerClasses = [...groupBy(terminals, aNode).values()].filter((c) => c.length >= 2);
  const used = new Set(answerClasses.flat());

  if (includeLinks) {
    // 미결선: 정답에서 쓰이는 단자에 전선이 하나도 없음
    const open = terminals.filter((t) => used.has(t) && !counts.has(t));
    for (const t of open) {
      out.push({ kind: 'open', severity: 'error', message: `미결선: ${t} 단자에 전선이 없습니다.`, terminals: [t] });
    }
    const openSet = new Set(open);

    // 연결 누락: 정답에서 같은 노드인데 사용자 회로에서는 떨어져 있음
    for (const cls of answerClasses) {
      const parts = [...groupBy(cls, uNode).values()].filter((p) => !p.every((t) => openSet.has(t)));
      if (parts.length < 2) continue;
      parts.sort((x, y) => y.length - x.length);
      const main = parts[0];
      for (const part of parts.slice(1)) {
        out.push({
          kind: 'missing_link',
          severity: 'error',
          message: `연결 누락: ${part.join(', ')} 쪽이 ${main.join(', ')} 쪽과 이어져야 합니다.`,
          terminals: [main[0], part[0]],
        });
      }
    }

    // 오결선: 정답에서 서로 다른 노드인 단자들이 사용자 회로에서 이어짐
    const userClasses = [...groupBy(terminals.filter((t) => used.has(t) && counts.has(t)), uNode).values()];
    for (const cls of userClasses) {
      const byAnswer = [...groupBy(cls, aNode).values()];
      if (byAnswer.length < 2) continue;
      for (let i = 1; i < byAnswer.length; i++) {
        out.push({
          kind: 'wrong_link',
          severity: 'error',
          message: `오결선: ${byAnswer[0].join(', ')} 쪽과 ${byAnswer[i].join(', ')} 쪽은 서로 연결되면 안 됩니다.`,
          terminals: [byAnswer[0][0], byAnswer[i][0]],
        });
      }
    }
  }

  // 경고: 정답에서 쓰지 않는 단자에 전선
  for (const t of terminals) {
    if (!used.has(t) && counts.has(t)) {
      out.push({
        kind: 'unused_terminal',
        severity: 'warning',
        message: `사용하지 않는 단자에 전선이 연결되어 있습니다: ${t}`,
        terminals: [t],
      });
    }
  }

  // 경고: 한 단자에 3가닥 이상
  for (const [t, n] of counts) {
    if (n >= 3) {
      out.push({
        kind: 'crowded',
        severity: 'warning',
        message: `${t} 단자에 전선이 ${n}가닥 연결되어 있습니다 (한 단자 2가닥 이하 권장).`,
        terminals: [t],
      });
    }
  }
  return out;
}
