/** 임시 첫 화면. 동작 미리보기 UI는 3단계에서 구현한다. */
export default function App() {
  return (
    <main className="placeholder">
      <h1>전기기능사 실기 시뮬레이터</h1>
      <p>도면 해석 → 결선 → 동작 검증을 웹에서 반복 연습하는 도구입니다.</p>
      <p className="status">개발 중 · 1단계(시뮬레이션 엔진 코어) 완료</p>
    </main>
  );
}
