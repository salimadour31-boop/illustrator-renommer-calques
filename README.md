# RenommerCalques.jsx

**FR** — Renommage en masse des calques et sous-calques Adobe Illustrator, avec dialogue ScriptUI bilingue FR/EN.

**EN** — Batch rename of Adobe Illustrator layers and sublayers, with a bilingual FR/EN ScriptUI dialog.

## Fonctionnalités

- **Portée** : document entier, ou calque actif (+ option « inclure les sous-calques » récursif)
- **Modes** :
  - Préfixe / Suffixe
  - Remplacer (trouver / remplacer, casse optionnelle)
  - Numéroter (préfixe + compteur avec padding zéro, pas, départ)
  - Modèle : jetons `{name}`, `{n}`, `{nn}`, `{nnn}`, `{parent}`
- **Filtres** : ignorer calques verrouillés / masqués
- Bouton **Analyser** : aperçu avant→après sans modifier le document
- Bouton **Appliquer** : renommage en une opération annulable (`beginUndoGroup` / `endUndoGroup` si disponibles)
- Messages clairs si aucun document ouvert
- Aucun appel réseau, aucune collecte de données
- Code 100 % original, compatible ExtendScript ES3

## Installation

1. **Fichier > Scripts > Autre script…** puis choisir `RenommerCalques.jsx`
2. Ou copier le fichier dans le dossier Presets/Scripts d'Illustrator, puis relancer Illustrator (le script apparaît dans **Fichier > Scripts**)

## Usage

1. Ouvrir un document Illustrator
2. Lancer le script
3. Choisir la portée, le mode et les options
4. **Analyser** pour vérifier l'aperçu avant→après
5. **Appliquer** pour renommer

Conseil : travaillez sur une **copie** de votre fichier.

## Compatibilité

- Cible : Adobe Illustrator **CC 2018–2026**
- Statut : **non testé dans Illustrator** (syntaxe ES3 vérifiée avec acorn)

## Licence

MIT — Copyright (c) 2026 Amirouche Amwanes
