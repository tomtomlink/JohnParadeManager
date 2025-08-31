# JohnParadeManager

JohnParadeManager est un jeu de gestion de parade militaire actuellement en développement.

Le but du jeu est de défiler sans fauter.

## Responsive Sizing

Le jeu utilise un système de dimensionnement adaptatif qui ajuste automatiquement la taille des musiciens et les distances selon la taille de l'écran :

- **Formule de mise à l'échelle** : `s = clamp(0.85, minSide / 420, 1.0)`
- **Écrans mobiles** (≤360px) : Réduction d'environ 15% pour plus d'espace libre
- **Écrans desktop** (≥420px) : Tailles originales préservées

Cette adaptation permet d'éviter les déformations de dernière image sur les petits écrans tout en maintenant l'expérience visuelle optimale sur desktop.

Ce projet est en cours de développement et toute contribution ou suggestion est la bienvenue !

---
*Projet créé par tomtomlink*
