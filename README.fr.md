# Citadelles · Citadels 3D

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · **Français** · [Deutsch](README.de.md) · [Português](README.pt-BR.md) · [Русский](README.ru.md) · [Italiano](README.it.md)

Bâtissez votre cité sur une table 3D éclairée à la bougie : choisissez un personnage secret à chaque manche, déjouez vos rivaux et marquez le plus de points. Finir le premier ne garantit pas la victoire.

## ▶ [Jouer maintenant](https://yulunwang.github.io/Citadels/)

**https://yulunwang.github.io/Citadels/**

Rien à télécharger ni à installer : le jeu fonctionne dans n'importe quel navigateur, sur ordinateur comme sur téléphone. Sur mobile, utilisez « Ajouter à l'écran d'accueil » pour l'utiliser comme une application.

## Comment jouer

**Contre l'ordinateur :** touchez **Jouer contre l'IA**, choisissez le nombre d'adversaires (1 à 6) et la difficulté, puis commencez.

**En ligne avec des amis**
1. Touchez **Créer un salon** pour obtenir un code de salon à 6 caractères.
2. Vos amis ouvrent le même lien, touchent **Rejoindre un salon** et saisissent le code.
3. Complétez les places libres avec **Ajouter une IA** si vous le souhaitez, puis lancez la partie.

Première partie ? L'écran d'accueil propose **Règles du jeu**, et en cours de partie le bouton **Conseil** vous suggère le prochain coup.

## Points forts

- **De 2 à 7 joueurs**, en solo ou en ligne.
- **Trois niveaux d'IA :** Facile, Normale et Rusée. L'IA ne sait que ce qu'elle a le droit de savoir : elle ne voit jamais votre main ni les personnages cachés.
- **11 langues :** English, 简体中文, 繁體中文, 日本語, 한국어, Español, Français, Deutsch, Português, Русский et Italiano, à changer à tout moment dans ⚙️ Réglages.
- **Réglages (⚙️) :** quatre musiques générées (Chandelles, Jardin lunaire, Citadelle néon, Soir de taverne) avec volume, vitesse de l'IA, confirmation avant de finir un tour où l'on peut encore bâtir, alertes de tour (titre clignotant, vibration), animations réduites et symboles de couleur sur les cartes pour les daltoniens.
- **Apprendre en jouant :** une première partie guidée, le fil de la manche avec ce que chacun a fait (touchez le compteur de manches), chaque choix expliqué en chiffres (« +2 or, prend la Couronne ») et un bilan de fin de partie avec les temps forts.
- **Aucune partie perdue :** les parties en solo s'enregistrent automatiquement, et en ligne, recharger la page vous ramène directement à votre place.
- **Raccourcis :** G or · D piocher · B bâtir · A pouvoir du personnage · E fin du tour · H conseil · 1–9 choisir une carte.

## Pour les développeurs

Aucune étape de compilation : JavaScript pur (modules ES) et Three.js. Pour le lancer en local :

```bash
node serve.mjs    # puis ouvrez http://localhost:5173
```

Tests :

```bash
node test/engine.test.mjs     # vérification des règles + chaque langue contient tous les textes
node test/pressure.mjs 600    # test de charge : équité (l'IA ne voit pas les informations cachées), coups aléatoires, statistiques de l'IA
node test/ai-duel.mjs 400     # taux de victoire de Rusée contre Normale
```

| Fichier | Rôle |
|---|---|
| `js/engine.js` | Moteur de règles : `act(state, pid, action)` et `viewFor(state, pid)` (ce que chaque joueur peut voir) |
| `js/ai.js`, `js/search.js` | Joueurs IA (ils ne reçoivent que `viewFor`) et l'anticipation du niveau Rusée |
| `js/scene.js`, `js/models.js`, `js/materials.js` | Table 3D, modèles de bâtiments, matériaux |
| `js/ui.js`, `js/lobby.js`, `js/settings.js` | Interface de jeu et salon |
| `js/main.js`, `js/net.js` | Déroulement de la partie, sauvegardes, jeu en ligne (PeerJS) |
| `js/i18n.js`, `js/lang/*.js` | Textes : anglais et chinois dans `i18n.js`, un fichier par autre langue |
| `js/data.js`, `js/sfx.js` | Données des cartes, sons |

**Ajouter une langue :** copiez `js/lang/fr.js`, traduisez les textes (gardez les `{marqueurs}`) et déclarez-la dans `LANGS` et `EXTRA` de `js/i18n.js`. `node test/engine.test.mjs` échoue s'il manque un texte ou un marqueur.

Une fusion dans `main` publie automatiquement le lien ci-dessus, et chaque pull request obtient son propre lien d'aperçu.
