# Ciudadelas · Citadels 3D

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · **Español** · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt-BR.md) · [Русский](README.ru.md) · [Italiano](README.it.md)

Construye tu ciudad sobre una mesa 3D iluminada por velas: elige un personaje secreto cada ronda, engaña a tus rivales y consigue la mayor puntuación. Terminar primero no garantiza la victoria.

## ▶ [Jugar ahora](https://yulunwang.github.io/Citadels/)

**https://yulunwang.github.io/Citadels/**

No hay nada que descargar ni instalar: funciona en cualquier navegador de ordenador o móvil. En el móvil, usa «Añadir a pantalla de inicio» y se usa como una app.

## Cómo jugar

**Contra el ordenador:** pulsa **Jugar contra la IA**, elige cuántos rivales (1–6) y la dificultad, y empieza.

**En línea con amigos**
1. Pulsa **Crear sala** para obtener un código de sala de 6 caracteres.
2. Tus amigos abren el mismo enlace, pulsan **Unirse a sala** e introducen el código.
3. Si quieres, rellena los asientos vacíos con **Añadir IA** y empieza la partida.

¿Primera vez? En la pantalla de inicio está **Cómo se juega**, y durante la partida el botón **Pista** te sugiere la siguiente jugada.

## Características

- **De 2 a 7 jugadores**, solo o en línea.
- **Tres niveles de IA:** Fácil, Normal y Astuta. La IA solo sabe lo que le corresponde: nunca ve tu mano ni los personajes ocultos.
- **11 idiomas:** English, 简体中文, 繁體中文, 日本語, 한국어, Español, Français, Deutsch, Português, Русский e Italiano. Cámbialo cuando quieras en ⚙️ Ajustes.
- **Ajustes (⚙️):** cuatro pistas de música generadas (Luz de velas, Jardín lunar, Ciudadela neón, Noche de taberna) con volumen, velocidad de la IA, confirmación antes de terminar un turno en el que aún puedes construir, avisos de turno (título parpadeante, vibración), reducir movimiento y símbolos de color en las cartas para daltónicos.
- **Aprende jugando:** una primera partida guiada, un resumen ronda a ronda de lo que hizo cada uno (toca el contador de rondas), cada elección explicada con números («+2 de oro, se queda la Corona») y un resumen final con momentos destacados.
- **Nunca pierdes una partida:** las partidas en solitario se guardan solas, y si recargas la página en línea vuelves directamente a tu asiento.
- **Atajos:** G oro · D robar cartas · B construir · A habilidad del personaje · E terminar turno · H pista · 1–9 elegir carta.

## Para desarrolladores

Sin paso de compilación: JavaScript puro (módulos ES) y Three.js. Para ejecutarlo en local:

```bash
node serve.mjs    # y abre http://localhost:5173
```

Pruebas:

```bash
node test/engine.test.mjs     # autocomprobación de las reglas + todos los idiomas tienen todos los textos
node test/pressure.mjs 600    # prueba de estrés: equidad (la IA no ve información oculta), jugadas aleatorias, estadísticas de la IA
node test/ai-duel.mjs 400     # porcentaje de victorias de Astuta contra Normal
```

| Archivo | Función |
|---|---|
| `js/engine.js` | Motor de reglas: `act(state, pid, action)` y `viewFor(state, pid)` (lo que puede ver cada jugador) |
| `js/ai.js`, `js/search.js` | Jugadores de la IA (solo reciben `viewFor`) y la búsqueda anticipada del nivel Astuta |
| `js/scene.js`, `js/models.js`, `js/materials.js` | Mesa 3D, modelos de edificios, materiales |
| `js/ui.js`, `js/lobby.js`, `js/settings.js` | Interfaz de la partida y vestíbulo |
| `js/main.js`, `js/net.js` | Flujo de la partida, guardado, juego en línea (PeerJS) |
| `js/i18n.js`, `js/lang/*.js` | Textos: inglés y chino en `i18n.js`, un archivo por cada otro idioma |
| `js/data.js`, `js/sfx.js` | Datos de cartas, sonido |

**Añadir un idioma:** copia `js/lang/fr.js`, traduce los textos (conserva los `{marcadores}`) y regístralo en `LANGS` y `EXTRA` de `js/i18n.js`. `node test/engine.test.mjs` falla si falta algún texto o marcador.

Al fusionar en `main`, el enlace de arriba se publica automáticamente, y cada pull request recibe su propio enlace de vista previa.
