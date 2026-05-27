# 🌟 AmberTodo - Premium Todo & Memo App

AmberTodo는 **Claude의 따뜻한 황금빛/엠버(Amber) 톤**을 주조색으로 한 모던한 디자인에 **Todoist**의 편의 기능(우선순위, 달성률 게이지)을 녹여낸 고품격 할 일 관리 및 메모 애플리케이션입니다. 외부 라이브러리 프레임워크 없이 순수 HTML, CSS, Vanilla JavaScript로 작성되었습니다.

---

## 📝 프로젝트 개요 (Project Overview)

- **작성자 이메일**: [lunak08@gmail.com](mailto:lunak08@gmail.com)
- **빌드 날짜**: 2026년 5월 27일

이 프로젝트는 웹 개발 입문자가 기본적인 CRUD(Create, Read, Update, Delete) 기능을 이해하고, 브라우저의 `localStorage` API를 활용한 데이터 저장 방법을 학습할 수 있도록 설계되었습니다.

---

## 🎨 Design Theme & Aesthetics

- **Claude Amber Theme**: 다크 그레이(Obsidian)와 웜 크림(Warm Cream)을 기반으로, 강렬한 오렌지나 골드 대신 차분한 황금빛/엠버(`#d97706`, `#f59e0b`) 색상을 포인트로 사용하여 시각적 편안함과 프리미엄 감성을 제공합니다.
- **Glassmorphism**: 인풋 폼과 할 일 카드를 유리창처럼 반투명하게 디자인하고 백그라운드 블러 필터(`backdrop-filter: blur(12px)`)를 주어 모던한 카드형 레이아웃을 구현했습니다.
- **Responsive Fluid Layout**: 데스크톱에서는 280px 너비의 고정형 사이드바가 노출되고, 모바일 및 태블릿 화면에서는 상단 햄버거 메뉴를 눌렀을 때 드러나는 슬라이드 드로어 형태로 동적 전환됩니다.

---

## 🛠 Key Technical Features

### 1. Todoist 스타일 4단계 우선순위 (Priority)
- 할 일마다 **P1(긴급 - Red)**, **P2(높음 - Amber)**, **P3(보통 - Blue)**, **P4(낮음 - Gray)** 단계를 지정할 수 있습니다.
- 설정된 우선순위에 따라 카드의 왼쪽 보더 강조선, 배지 색상, 그리고 체크박스 호버 컬러가 역동적으로 지정됩니다.

### 2. Karma 스타일 달성도 계산기 (Karma Tracker)
- 오늘 완료한 할 일의 개수에 비례하여 **Karma 달성률**을 백분율(%)로 계산합니다.
- 게이지의 진행도가 차오를 때 CSS `transition`을 활용한 매끄러운 진행 속도를 구현했으며, 완료율에 따라 사용자에게 던져지는 응원 메시지(5단계)가 변경됩니다.

### 3. 다이내믹 환경 정보 반영 (Time-based Greetings)
- 브라우저가 실행되는 시스템 시간을 실시간 감지하여, 아침(05~12시), 오후(12~18시), 저녁/밤(18~05시)에 따라 다채로운 한국어 환영 멘트를 상단에 띄워줍니다.

### 4. 미크로 인터랙션 (Micro Animations)
- **카드 추가**: 자연스러운 스케일 확대 및 Fade-in 애니메이션 적용.
- **카드 삭제**: 삭제 버튼 클릭 시 `.card-exit` 키프레임 애니메이션을 호출하고, `animationend` 이벤트를 리스닝하여 DOM에서 부드럽게 지워진 후 리스트를 갱신합니다.
- **유효성 경고**: 메모 제목을 쓰지 않고 등록하려 할 때, 입력 필드가 좌우로 흔들리는 `shake` 효과 피드백을 구현했습니다.

### 5. 데이터 및 테마 영속화 (State Persistence)
- 테마 모드(Light / Dark) 설정값과 작성한 Todo 데이터 목록은 브라우저의 `localStorage` API에 안전하게 저장됩니다. 페이지 새로고침(F5) 혹은 브라우저 재시작 시에도 이전 상태가 완전하게 복원됩니다.

---

## 📂 File Structure

```text
app01/
├── index.html   # 구조 설계, Lucide 아이콘, Google Fonts CDN 로드
├── style.css    # CSS 변수 기반 다크/라이트 모드, 애니메이션, 미디어 쿼리
├── app.js       # 상태 머신(Todos Array), 필터링/정렬 로직, DOM 이벤트 제어
└── README.md    # 프로젝트 기술 상세 요약 문서 (본 파일)
```

---

## 🚀 How to Run

별도의 로컬 서버 빌드나 패키지 매니저(npm, yarn 등) 설치가 필요 없습니다.

1. 본 레포지토리를 내려받거나 작업 공간 내의 `index.html` 파일을 찾습니다.
2. 웹 브라우저(Chrome, Safari, Edge 등)로 **[index.html](file:///c:/Users/lunak/.gemini/antigravity/scratch/app01/index.html)**을 더블클릭하여 바로 실행합니다.
