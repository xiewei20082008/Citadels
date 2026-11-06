# Citadels 3D

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt-BR.md) · [Русский](README.ru.md) · **Italiano**

Costruisci la tua città su un tavolo 3D illuminato dalle candele: scegli un personaggio segreto a ogni round, inganna i tuoi rivali e fai più punti di tutti. Finire per primo non garantisce la vittoria.

## ▶ [Gioca ora](https://yulunwang.github.io/Citadels/)

**https://yulunwang.github.io/Citadels/**

Niente da scaricare o installare: funziona in qualsiasi browser, da computer o da telefono. Sul telefono usa "Aggiungi alla schermata Home" e si usa come un'app.

## Come si gioca

**Contro il computer:** tocca **Gioca contro l'IA**, scegli quanti avversari (1–6) e la difficoltà, e inizia.

**Online con gli amici**
1. Tocca **Crea stanza** per ottenere un codice stanza di 6 caratteri.
2. I tuoi amici aprono lo stesso link, toccano **Entra in stanza** e inseriscono il codice.
3. Se vuoi, riempi i posti liberi con **Aggiungi IA**, poi avvia la partita.

Prima volta? Nella schermata iniziale c'è **Come si gioca**, e durante la partita il pulsante **Suggerimento** ti propone la mossa successiva.

## Punti di forza

- **Da 2 a 7 giocatori**, da soli o online.
- **Tre livelli di IA:** Facile, Normale e Astuta. L'IA sa solo ciò che le è concesso: non vede mai la tua mano né i personaggi nascosti.
- **11 lingue:** English, 简体中文, 繁體中文, 日本語, 한국어, Español, Français, Deutsch, Português, Русский e Italiano, da cambiare quando vuoi in ⚙️ Impostazioni.
- **Impostazioni (⚙️):** quattro brani musicali generati (Lume di candela, Giardino lunare, Cittadella neon, Notte in taverna) con volume, velocità dell'IA, conferma prima di finire un turno in cui puoi ancora costruire, avvisi di turno (titolo lampeggiante, vibrazione), movimento ridotto e simboli dei colori sulle carte per i daltonici.
- **Impara giocando:** una prima partita guidata, il riepilogo del round con le mosse di tutti (tocca il contatore dei round), ogni scelta spiegata in numeri («+2 oro, prende la Corona») e un resoconto finale con i momenti salienti.
- **Nessuna partita persa:** le partite in solitario si salvano da sole, e online chi ricarica la pagina torna subito al suo posto.
- **Tasti:** G oro · D pesca · B costruisci · A abilità del personaggio · E fine turno · H suggerimento · 1–9 scegli una carta.

## Per gli sviluppatori

Nessuna fase di build: JavaScript puro (moduli ES) e Three.js. Per avviarlo in locale:

```bash
node serve.mjs    # poi apri http://localhost:5173
```

Test:

```bash
node test/engine.test.mjs     # verifica delle regole + ogni lingua contiene tutti i testi
node test/pressure.mjs 600    # stress test: equità (l'IA non vede informazioni nascoste), mosse casuali, statistiche dell'IA
node test/ai-duel.mjs 400     # percentuale di vittorie di Astuta contro Normale
```

| File | Ruolo |
|---|---|
| `js/engine.js` | Motore delle regole: `act(state, pid, action)` e `viewFor(state, pid)` (ciò che ogni giocatore può vedere) |
| `js/ai.js`, `js/search.js` | Giocatori IA (ricevono solo `viewFor`) e la ricerca in avanti del livello Astuta |
| `js/scene.js`, `js/models.js`, `js/materials.js` | Tavolo 3D, modelli degli edifici, materiali |
| `js/ui.js`, `js/lobby.js`, `js/settings.js` | Interfaccia di gioco e lobby |
| `js/main.js`, `js/net.js` | Svolgimento della partita, salvataggi, gioco online (PeerJS) |
| `js/i18n.js`, `js/lang/*.js` | Testi: inglese e cinese semplificato in `i18n.js`, un file per ogni altra lingua |
| `js/data.js`, `js/sfx.js` | Dati delle carte, suoni |

**Aggiungere una lingua:** copia `js/lang/fr.js`, traduci i testi (mantenendo i `{segnaposto}`) e registrala in `LANGS` ed `EXTRA` in `js/i18n.js`. `node test/engine.test.mjs` fallisce se manca un testo o un segnaposto.

Con il merge su `main` il link qui sopra si aggiorna automaticamente, e ogni pull request ottiene il proprio link di anteprima.
