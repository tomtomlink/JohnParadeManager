# JohnParadeManager

JohnParadeManager est un jeu de gestion de parade militaire actuellement en développement.

Le but du jeu est de défiler sans fauter.

## Responsive Scaling

Le jeu utilise un système de mise à l'échelle responsive pour optimiser l'expérience sur les petits écrans mobiles :

**Formule de mise à l'échelle :** `s = clamp(0.85, minSide/420, 1.0)`

- Sur les écrans ≥420px (desktop) : `s = 1.0` (aucun changement visuel)
- Sur les écrans mobiles : `s = 0.85` minimum (acteurs plus petits, plus d'espace libre)

Cette mise à l'échelle s'applique aux :
- Rayons des PNJ et du joueur (`PNJ_RADIUS`, `PLAYER_RADIUS`)
- Distances minimales et marges (`MIN_DIST`, `FORMATION_CLAMP_MARGIN`)
- Échelles visuelles des sprites (`SCALE_PNJ`, `SCALE_PLAYER`)

**Objectif :** Éviter les déformations de formation sur petits écrans tout en préservant l'expérience desktop.

---

Ce projet est en cours de développement et toute contribution ou suggestion est la bienvenue !

*Projet créé par tomtomlink*
