# 전기기능사 실기 시뮬레이터

전기기능사 실기(작업형) 수험생이 **도면 해석 → 결선 → 동작 검증**을 웹에서 반복 연습하는 시뮬레이터입니다.
프로젝트 지침과 개발 단계는 [CLAUDE.md](./CLAUDE.md)를 보세요.

## 실행

```bash
npm install
npm run dev     # 개발 서버
npm test        # Vitest
npm run build   # 배포 빌드 (dist/)
```

## 구조

- `src/engine/` — UI와 무관한 순수 TS 시뮬레이션 엔진 (노드 병합, 통전 계산, 단락·발진 검출)
- `src/components/` — 기구 정의와 소켓 핀맵 (`socketPinmaps.json`, 공개도면 기준으로 사람이 입력)
- `src/ui/` — React 화면
- `tests/` — 엔진 단위 테스트

## 배포

Cloudflare Workers(정적 자산)로 배포합니다. 설정은 `wrangler.jsonc`에 있습니다.

- 빌드 명령: `npm run build`
- 배포 명령: `npx wrangler deploy`
