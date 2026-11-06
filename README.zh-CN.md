# 富饶之城 · Citadels 3D

[English](README.md) · **简体中文** · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt-BR.md) · [Русский](README.ru.md) · [Italiano](README.it.md)

在烛光下的 3D 牌桌上建造你的城市：每轮秘密挑选角色、互相算计，得分最高的人获胜——第一个建成城市的人不一定赢。

## ▶ [点这里开始玩](https://yulunwang.github.io/Citadels/)

**https://yulunwang.github.io/Citadels/**

不用下载、不用安装，电脑和手机浏览器都能直接打开。手机上可以「添加到主屏幕」，用起来像一个 App。

## 怎么玩

**和电脑对战**：点「单人对战」，选择对手人数（1–6 个）和难度，开始。

**和朋友联机**
1. 你点「创建房间」，得到一个 6 位房间码。
2. 朋友打开同一个链接，点「加入房间」，输入房间码。
3. 空位可以点「添加 AI」补上电脑玩家，人齐了点开始。

不会玩？首页有「玩法说明」，对局中随时可以按「提示」，它会告诉你现在该怎么走。

## 游戏特色

- **2–7 人**，单人或联机都行。
- **三档电脑难度**：简单、普通、狡诈。电脑只知道它该知道的信息，不会偷看你的手牌和角色。
- **11 种语言**：English、简体中文、繁體中文、日本語、한국어、Español、Français、Deutsch、Português、Русский、Italiano，随时在 ⚙️ 设置里切换。
- **设置（⚙️）**：四首程序生成的背景音乐（烛光、月下庭园、霓虹之城、酒馆之夜）和音量调节、AI 速度、还能建造时结束回合前确认、轮到你时提醒（标签页闪烁、手机震动）、减少动态效果、色盲辅助的卡牌颜色符号。
- **边玩边学**：新手引导教程；点左上角轮数可查看本轮每个人做了什么；每个选择都换算成具体数字（「+2 金 · 拿到王冠」）；结束时有名次、亮点和角色轨迹复盘。
- **断线不怕**：单人游戏自动存档；联机时刷新页面会自动回到座位。
- **快捷键**：G 拿金币 · D 摸牌 · B 建造 · A 角色技能 · E 结束回合 · H 提示 · 1–9 选手牌。

## 开发者

没有构建步骤，纯 JavaScript（ES 模块）+ Three.js。本地运行：

```bash
node serve.mjs    # 打开 http://localhost:5173
```

测试：

```bash
node test/engine.test.mjs     # 规则自检 + 检查每种语言都翻译齐全
node test/pressure.mjs 600    # 压力测试：公平性（电脑看不到隐藏信息）、随机乱点、AI 行为统计
node test/ai-duel.mjs 400     # 狡诈 vs 普通 AI 胜率
```

| 文件 | 作用 |
|---|---|
| `js/engine.js` | 规则引擎：`act(state, pid, action)`、`viewFor(state, pid)`（每个人能看到的信息） |
| `js/ai.js`、`js/search.js` | 电脑玩家（只接收 `viewFor`）和狡诈难度的前瞻搜索 |
| `js/scene.js`、`js/models.js`、`js/materials.js` | 3D 牌桌、建筑模型、材质 |
| `js/ui.js`、`js/lobby.js`、`js/settings.js` | 游戏界面、大厅 |
| `js/main.js`、`js/net.js` | 流程控制、存档、联机（PeerJS） |
| `js/i18n.js`、`js/lang/*.js` | 文本：中英文在 `i18n.js`，其他语言各一个文件 |
| `js/data.js`、`js/sfx.js` | 卡牌数据、音效 |

**添加新语言**：复制 `js/lang/fr.js`，翻译其中的文字（保留 `{占位符}`），再在 `js/i18n.js` 的 `LANGS` 和 `EXTRA` 里登记。漏翻或占位符不一致时，`node test/engine.test.mjs` 会报错。

合并到 `main` 后会自动发布到上面的网址；每个 PR 也会自动生成预览地址。
