# 전기기능사 실기 시뮬레이터

전기기능사 실기(작업형) 수험생이 **도면 해석 → 결선 → 동작 검증**을 웹에서 반복 연습하는 시뮬레이터입니다.
프로젝트 지침과 개발 단계는 [CLAUDE.md](./CLAUDE.md)를 보세요.

## 기능

- **동작 미리보기**: 정답 회로에서 전원·푸시버튼·셀렉터·EOCR 트립·FLS 수위를 조작하고 램프·부저·코일 상태와 전위(L측/N측)를 실시간 확인. 가상 시계 1x/5x 배속.
- **결선 연습**: 단자 두 개를 탭해 전선 연결, 전선 탭 → 삭제, 되돌리기/다시하기 (Ctrl+Z / Ctrl+Y, Delete, Esc). 결선은 브라우저에 저장.
- **채점·진단**: 시나리오 기반 동작 동등성 채점. 단락·발진·자기유지 누락·인터록 누락·미결선·연결 누락·오결선 진단, 3가닥 이상·미사용 단자 경고.
- **핀번호 퀴즈**: 소켓 기구의 코일·접점 핀 맞히기.

## 실행

```bash
npm install
npm run dev     # 개발 서버
npm test        # Vitest
npm run build   # 배포 빌드 (dist/)
```

## 구조

- `src/engine/` — UI와 무관한 순수 TS 시뮬레이션 엔진
  - `netlist.ts` 노드 병합(Union-Find) · `solver.ts` 통전·코일 수렴·시간 요소 · `clock.ts` 가상 시계
  - `simulator.ts` 상태를 가진 시뮬레이터 · `scenario.ts` 시험 시나리오 실행 · `grader.ts` 채점 · `diagnostics.ts` 진단
- `src/components/` — 기구 정의(`library.ts`), 소켓 핀맵(`socketPinmaps.json`), 핀 퀴즈(`quiz.ts`)
- `src/problems/` — 문제 데이터(JSON)와 목록(`index.ts`), 형식 템플릿(`_template.json`)
- `src/config/wireColors.json` — 전선 색상 규칙 (미입력)
- `src/ui/` — React 화면
- `tests/` — 단위 테스트

## 문제 추가 방법

1. `src/problems/_template.json`을 복사해 `open-10.json`처럼 만든다.
2. `components`에 기구를 넣는다. 실제 소켓을 쓰는 기구는 `"socket": "12pin"`처럼 지정하고, 해당 핀맵을 `src/components/socketPinmaps.json`에 공개도면 기준으로 입력한다.
3. `givenWires`(미리 연결된 전원 인입선), `answerWires`(정답 결선), `scenarios`(시험장 동작 순서와 기대 결과)를 채운다.
4. `src/problems/index.ts`의 `PROBLEMS`에 등록한다. `npm test`가 정답 회로로 모든 시나리오가 통과하는지 자동 확인한다.

시나리오 조작: `power_on`, `power_off`, `press`(눌렀다 뗌, `durationMs`), `hold`, `release`, `toggle`(MCCB·LS·SS·EOCR 트립, `value`), `set_level`(FLS `low`/`mid`/`high`), `wait`(`ms`), 그리고 `expect`(`"on"`/`"off"`).

## 공개도면 기준 확인이 필요한 데이터 (TODO)

- `socketPinmaps.json`: MC 12핀, X 8핀·11핀, T 8핀, FR 8핀, FLS 8핀, EOCR 12핀 — 전부 `null`
- 공개문제 1~18번 데이터 — 화면에 "준비 중"으로 표시
- `wireColors.json`: 전선 색상 규칙 — `null` (규칙이 정해지면 색상 선택·점검 기능 추가)
- 예시 문제 2개는 엔진·화면 검증용으로 직접 만든 회로이며, 논리 핀 이름(A1, a1-1 …)을 쓴다.

## 배포

Cloudflare Workers(정적 자산)로 배포합니다. 설정은 `wrangler.jsonc`에 있습니다.

- 빌드 명령: `npm run build`
- 배포 명령: `npx wrangler deploy`
