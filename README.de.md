# Ohne Furcht und Adel · Citadels 3D

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · **Deutsch** · [Português](README.pt-BR.md) · [Русский](README.ru.md) · [Italiano](README.it.md)

Baue deine Stadt auf einem kerzenbeleuchteten 3D-Tisch: Wähle jede Runde eine geheime Figur, überliste deine Mitspieler und hol die meisten Punkte. Wer zuerst fertig ist, gewinnt nicht automatisch.

## ▶ [Jetzt spielen](https://yulunwang.github.io/Citadels/)

**https://yulunwang.github.io/Citadels/**

Nichts herunterladen, nichts installieren: Es läuft in jedem Browser auf Computer und Handy. Auf dem Handy mit „Zum Startbildschirm hinzufügen“ fühlt es sich an wie eine App.

## So wird gespielt

**Gegen den Computer:** Tippe auf **Gegen die KI**, wähle die Zahl der Gegner (1–6) und die Stärke und leg los.

**Online mit Freunden**
1. Tippe auf **Raum erstellen**, um einen 6-stelligen Raumcode zu bekommen.
2. Deine Freunde öffnen denselben Link, tippen auf **Raum beitreten** und geben den Code ein.
3. Freie Plätze kannst du mit **KI hinzufügen** füllen, dann geht's los.

Neu bei Ohne Furcht und Adel? Auf dem Startbildschirm findest du die **Spielregeln**, und im Spiel schlägt dir die Taste **Tipp** den nächsten Zug vor.

## Highlights

- **2–7 Spieler**, allein oder online.
- **Drei KI-Stufen:** Leicht, Normal und Gerissen. Die KI weiß nur, was sie wissen darf – sie sieht nie deine Hand oder verdeckte Figuren.
- **11 Sprachen:** English, 简体中文, 繁體中文, 日本語, 한국어, Español, Français, Deutsch, Português, Русский und Italiano – jederzeit in ⚙️ Einstellungen umschaltbar.
- **Einstellungen (⚙️):** vier generierte Musikstücke (Kerzenschein, Mondgarten, Neon-Zitadelle, Tavernennacht) mit Lautstärke, KI-Tempo, Rückfrage vor dem Zugende, wenn noch gebaut werden kann, Zug-Hinweise (blinkender Tab-Titel, Vibration), reduzierte Bewegung und Farbsymbole auf Karten für Farbenblinde.
- **Spielend lernen:** eine geführte erste Partie, ein Rundenverlauf mit allem, was jeder getan hat (Rundenanzeige antippen), jede Wahl in Zahlen erklärt („+2 Gold, nimmt die Krone“) und eine Schlussbilanz mit Höhepunkten.
- **Kein Spiel geht verloren:** Solospiele speichern automatisch, und wer online die Seite neu lädt, landet direkt wieder auf seinem Platz.
- **Tasten:** G Gold · D ziehen · B bauen · A Fähigkeit der Figur · E Zug beenden · H Tipp · 1–9 Karte wählen.

## Für Entwickler

Kein Build-Schritt: reines JavaScript (ES-Module) und Three.js. Lokal starten:

```bash
node serve.mjs    # dann http://localhost:5173 öffnen
```

Tests:

```bash
node test/engine.test.mjs     # Regelprüfung + jede Sprache enthält alle Texte
node test/pressure.mjs 600    # Belastungstest: Fairness (KI sieht keine verdeckten Infos), Zufallszüge, KI-Verhaltensstatistik
node test/ai-duel.mjs 400     # Siegquote Gerissen gegen Normal
```

| Datei | Aufgabe |
|---|---|
| `js/engine.js` | Regel-Engine: `act(state, pid, action)` und `viewFor(state, pid)` (was jeder Spieler sehen darf) |
| `js/ai.js`, `js/search.js` | KI-Spieler (sie bekommen nur `viewFor`) und die Vorausschau der Stufe Gerissen |
| `js/scene.js`, `js/models.js`, `js/materials.js` | 3D-Tisch, Gebäudemodelle, Materialien |
| `js/ui.js`, `js/lobby.js`, `js/settings.js` | Spieloberfläche und Lobby |
| `js/main.js`, `js/net.js` | Spielablauf, Speichern, Online-Spiel (PeerJS) |
| `js/i18n.js`, `js/lang/*.js` | Texte: Englisch und vereinfachtes Chinesisch in `i18n.js`, je eine Datei pro weiterer Sprache |
| `js/data.js`, `js/sfx.js` | Kartendaten, Sound |

**Sprache hinzufügen:** Kopiere `js/lang/fr.js`, übersetze die Texte (die `{Platzhalter}` bleiben) und trage die Sprache in `LANGS` und `EXTRA` in `js/i18n.js` ein. `node test/engine.test.mjs` schlägt fehl, wenn ein Text oder Platzhalter fehlt.

Ein Merge in `main` veröffentlicht den Link oben automatisch, und jeder Pull Request bekommt einen eigenen Vorschau-Link.
