# 시타델 · Citadels 3D

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · **한국어** · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt-BR.md) · [Русский](README.ru.md) · [Italiano](README.it.md)

촛불이 켜진 3D 테이블 위에 나만의 도시를 세우는 게임입니다. 매 라운드 비밀 역할을 고르고, 상대의 허를 찔러 가장 높은 점수를 노리세요. 도시를 가장 먼저 완성한다고 꼭 이기는 것은 아닙니다.

## ▶ [지금 플레이](https://yulunwang.github.io/Citadels/)

**https://yulunwang.github.io/Citadels/**

다운로드나 설치 없이 PC와 휴대폰 브라우저에서 바로 즐길 수 있습니다. 휴대폰에서는 "홈 화면에 추가"하면 앱처럼 사용할 수 있습니다.

## 플레이 방법

**컴퓨터와 대전:** "AI와 대전"을 누르고 상대 수(1–6명)와 난이도를 고른 뒤 시작합니다.

**친구와 온라인 대전**
1. "방 만들기"를 누르면 6자리 방 코드가 나옵니다.
2. 친구는 같은 링크를 열고 "방 참가"를 눌러 코드를 입력합니다.
3. 빈자리는 "AI 추가"로 컴퓨터 플레이어를 채울 수 있습니다. 모두 모이면 시작하세요.

처음이라면 홈 화면의 "게임 방법"에서 규칙을 볼 수 있고, 게임 중에는 "힌트" 버튼이 다음 수를 추천해 줍니다.

## 특징

- **2–7명**, 혼자서도 온라인으로도 즐길 수 있습니다.
- **세 단계 AI**: 쉬움, 보통, 교활함. AI는 알아도 되는 정보만 보며, 당신의 손패나 숨겨진 역할을 엿보지 않습니다.
- **11개 언어**: English, 简体中文, 繁體中文, 日本語, 한국어, Español, Français, Deutsch, Português, Русский, Italiano. ⚙️ 설정에서 언제든 바꿀 수 있습니다.
- **설정(⚙️)**: 자동 생성되는 배경 음악 4곡(촛불, 달빛 정원, 네온 시타델, 선술집의 밤)과 음량, AI 속도, 건설할 수 있는데 차례를 끝낼 때 확인, 내 차례 알림(탭 깜빡임, 진동), 움직임 줄이기, 색각 보조 카드 기호.
- **하면서 배우기**: 첫 게임 안내 튜토리얼, 왼쪽 위 라운드 표시로 이번 라운드 진행 상황 확인, 모든 선택을 구체적인 숫자로 안내("금화 +2 · 왕관 획득"), 종료 시 순위·하이라이트·역할 기록 정리.
- **끊겨도 걱정 없음**: 혼자 하는 게임은 자동 저장되고, 온라인에서 새로고침해도 자동으로 자리로 돌아갑니다.
- **단축키**: G 금화 · D 카드 뽑기 · B 건설 · A 역할 능력 · E 차례 끝내기 · H 힌트 · 1–9 카드 선택.

## 개발자용

빌드 과정 없이 순수 JavaScript(ES 모듈)와 Three.js로 만들었습니다. 로컬 실행:

```bash
node serve.mjs    # http://localhost:5173 열기
```

테스트:

```bash
node test/engine.test.mjs     # 규칙 자체 점검 + 모든 언어 번역이 빠짐없는지 확인
node test/pressure.mjs 600    # 부하 테스트: 공정성(AI는 숨겨진 정보를 볼 수 없음), 무작위 조작, AI 행동 통계
node test/ai-duel.mjs 400     # 교활함 대 보통 승률
```

| 파일 | 역할 |
|---|---|
| `js/engine.js` | 규칙 엔진: `act(state, pid, action)`와 `viewFor(state, pid)`(각 플레이어가 볼 수 있는 정보) |
| `js/ai.js`, `js/search.js` | 컴퓨터 플레이어(`viewFor`만 받음)와 교활함 난이도의 수읽기 |
| `js/scene.js`, `js/models.js`, `js/materials.js` | 3D 테이블, 건물 모델, 재질 |
| `js/ui.js`, `js/lobby.js`, `js/settings.js` | 게임 화면과 로비 |
| `js/main.js`, `js/net.js` | 게임 흐름, 저장, 온라인 대전(PeerJS) |
| `js/i18n.js`, `js/lang/*.js` | 텍스트: 영어·중국어는 `i18n.js`, 그 밖의 언어는 언어마다 파일 하나 |
| `js/data.js`, `js/sfx.js` | 카드 데이터, 효과음 |

**언어 추가:** `js/lang/fr.js`를 복사해 번역하고(`{자리표시자}`는 그대로), `js/i18n.js`의 `LANGS`와 `EXTRA`에 등록하세요. 빠진 항목이 있으면 `node test/engine.test.mjs`가 실패합니다.

`main`에 병합하면 위 링크에 자동으로 배포되고, 풀 리퀘스트마다 미리보기 링크도 생성됩니다.
