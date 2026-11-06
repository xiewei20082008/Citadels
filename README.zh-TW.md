# 富饒之城 · Citadels 3D

[English](README.md) · [简体中文](README.zh-CN.md) · **繁體中文** · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt-BR.md) · [Русский](README.ru.md) · [Italiano](README.it.md)

在燭光下的 3D 牌桌上建造你的城市：每輪秘密挑選角色、互相算計，得分最高的人獲勝——第一個建成城市的人不一定贏。

## ▶ [點這裡開始玩](https://yulunwang.github.io/Citadels/)

**https://yulunwang.github.io/Citadels/**

不用下載、不用安裝，電腦和手機瀏覽器都能直接開啟。手機上可以「加入主畫面」，用起來像一個 App。

## 怎麼玩

**和電腦對戰**：點「單人對戰」，選擇對手人數（1–6 個）和難度，開始。

**和朋友連線**
1. 你點「建立房間」，得到一個 6 位房間碼。
2. 朋友開啟同一個連結，點「加入房間」，輸入房間碼。
3. 空位可以點「加入 AI」補上電腦玩家，人齊了點開始。

不會玩？首頁有「玩法說明」，對局中隨時可以按「提示」，它會告訴你現在該怎麼走。

## 遊戲特色

- **2–7 人**，單人或連線都行。
- **三檔電腦難度**：簡單、普通、狡詐。電腦只知道它該知道的資訊，不會偷看你的手牌和角色。
- **11 種語言**：English、简体中文、繁體中文、日本語、한국어、Español、Français、Deutsch、Português、Русский、Italiano，隨時在 ⚙️ 設定裡切換。
- **設定（⚙️）**：四首程式生成的背景音樂（燭光、月下庭園、霓虹之城、酒館之夜）和音量調整、AI 速度、還能建造時結束回合前確認、輪到你時提醒（分頁閃爍、手機震動）、減少動態效果、色盲輔助的卡牌顏色符號。
- **邊玩邊學**：新手引導教學；點左上角輪數可查看本輪每個人做了什麼；每個選擇都換算成具體數字（「+2 金 · 拿到王冠」）；結束時有名次、亮點和角色軌跡復盤。
- **斷線不怕**：單人遊戲自動存檔；連線時重新整理頁面會自動回到座位。
- **快捷鍵**：G 拿金幣 · D 摸牌 · B 建造 · A 角色技能 · E 結束回合 · H 提示 · 1–9 選手牌。

## 開發者

沒有建置步驟，純 JavaScript（ES 模組）+ Three.js。本機執行：

```bash
node serve.mjs    # 開啟 http://localhost:5173
```

測試：

```bash
node test/engine.test.mjs     # 規則自檢 + 檢查每種語言都翻譯齊全
node test/pressure.mjs 600    # 壓力測試：公平性（電腦看不到隱藏資訊）、隨機亂點、AI 行為統計
node test/ai-duel.mjs 400     # 狡詐 vs 普通 AI 勝率
```

| 檔案 | 作用 |
|---|---|
| `js/engine.js` | 規則引擎：`act(state, pid, action)`、`viewFor(state, pid)`（每個人能看到的資訊） |
| `js/ai.js`、`js/search.js` | 電腦玩家（只接收 `viewFor`）和狡詐難度的前瞻搜尋 |
| `js/scene.js`、`js/models.js`、`js/materials.js` | 3D 牌桌、建築模型、材質 |
| `js/ui.js`、`js/lobby.js`、`js/settings.js` | 遊戲介面、大廳 |
| `js/main.js`、`js/net.js` | 流程控制、存檔、連線（PeerJS） |
| `js/i18n.js`、`js/lang/*.js` | 文字：英文與簡體中文在 `i18n.js`，其他語言各一個檔案 |
| `js/data.js`、`js/sfx.js` | 卡牌資料、音效 |

**新增語言**：複製 `js/lang/fr.js`，翻譯其中的文字（保留 `{佔位符}`），再到 `js/i18n.js` 的 `LANGS` 和 `EXTRA` 登記。漏翻或佔位符不一致時，`node test/engine.test.mjs` 會報錯。

合併到 `main` 後會自動發布到上面的網址；每個 PR 也會自動產生預覽網址。
