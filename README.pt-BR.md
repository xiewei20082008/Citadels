# Cidadelas · Citadels 3D

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · **Português** · [Русский](README.ru.md) · [Italiano](README.it.md)

Construa sua cidade numa mesa 3D iluminada por velas: escolha um personagem secreto a cada rodada, engane seus rivais e faça mais pontos. Terminar primeiro não garante a vitória.

## ▶ [Jogar agora](https://yulunwang.github.io/Citadels/)

**https://yulunwang.github.io/Citadels/**

Nada para baixar nem instalar: roda em qualquer navegador, no computador ou no celular. No celular, use "Adicionar à tela inicial" e ele funciona como um app.

## Como jogar

**Contra o computador:** toque em **Jogar contra a IA**, escolha quantos oponentes (1–6) e a dificuldade, e comece.

**Online com amigos**
1. Toque em **Criar sala** para receber um código de sala de 6 caracteres.
2. Seus amigos abrem o mesmo link, tocam em **Entrar na sala** e digitam o código.
3. Se quiser, preencha os lugares vazios com **Adicionar IA** e comece a partida.

Primeira vez? A tela inicial tem **Como jogar**, e durante a partida o botão **Dica** sugere sua próxima jogada.

## Destaques

- **De 2 a 7 jogadores**, solo ou online.
- **Três níveis de IA:** Fácil, Normal e Astuta. A IA só sabe o que pode saber: nunca vê sua mão nem os personagens ocultos.
- **11 idiomas:** English, 简体中文, 繁體中文, 日本語, 한국어, Español, Français, Deutsch, Português, Русский e Italiano. Troque quando quiser em ⚙️ Configurações.
- **Configurações (⚙️):** quatro músicas geradas (Luz de velas, Jardim ao luar, Cidadela neon, Noite na taverna) com volume, velocidade da IA, confirmação antes de encerrar um turno em que ainda dá para construir, avisos de vez (título piscando, vibração), movimento reduzido e símbolos de cor nas cartas para daltônicos.
- **Aprenda jogando:** uma primeira partida guiada, um resumo rodada a rodada do que cada um fez (toque no contador de rodadas), cada escolha explicada em números ("+2 ouro, pega a Coroa") e um resumo final com destaques.
- **Nenhuma partida se perde:** jogos solo são salvos automaticamente, e quem recarrega a página online volta direto para o seu lugar.
- **Atalhos:** G ouro · D comprar · B construir · A habilidade do personagem · E encerrar turno · H dica · 1–9 escolher carta.

## Para desenvolvedores

Sem etapa de build: JavaScript puro (módulos ES) e Three.js. Para rodar localmente:

```bash
node serve.mjs    # e abra http://localhost:5173
```

Testes:

```bash
node test/engine.test.mjs     # verificação das regras + todo idioma tem todos os textos
node test/pressure.mjs 600    # teste de estresse: justiça (a IA não vê informação oculta), jogadas aleatórias, estatísticas da IA
node test/ai-duel.mjs 400     # taxa de vitória da Astuta contra a Normal
```

| Arquivo | Função |
|---|---|
| `js/engine.js` | Motor de regras: `act(state, pid, action)` e `viewFor(state, pid)` (o que cada jogador pode ver) |
| `js/ai.js`, `js/search.js` | Jogadores de IA (só recebem `viewFor`) e a busca à frente do nível Astuta |
| `js/scene.js`, `js/models.js`, `js/materials.js` | Mesa 3D, modelos de prédios, materiais |
| `js/ui.js`, `js/lobby.js`, `js/settings.js` | Interface do jogo e saguão |
| `js/main.js`, `js/net.js` | Fluxo da partida, salvamento, jogo online (PeerJS) |
| `js/i18n.js`, `js/lang/*.js` | Textos: inglês e chinês simplificado em `i18n.js`, um arquivo para cada outro idioma |
| `js/data.js`, `js/sfx.js` | Dados das cartas, som |

**Adicionar um idioma:** copie `js/lang/fr.js`, traduza os textos (mantenha os `{marcadores}`) e registre-o em `LANGS` e `EXTRA` no `js/i18n.js`. `node test/engine.test.mjs` falha se faltar algum texto ou marcador.

Ao fazer merge na `main`, o link acima é publicado automaticamente, e cada pull request ganha seu próprio link de pré-visualização.
