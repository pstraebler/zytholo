# Fonctionnalité "Quoi de neuf ?"

## Description
Cette fonctionnalité affiche une popup avec les notes de dernière mise à jour de l'application Zytholo.

## Fonctionnement

### Affichage automatique
- La popup s'affiche automatiquement une seule fois pour chaque utilisateur après une mise à jour de l'application
- Le système utilise `localStorage` pour mémoriser la dernière version vue par l'utilisateur
- Si la version actuelle est différente de la dernière version vue, la popup s'affiche automatiquement 1 seconde après le chargement de la page

### Accès manuel
- Un nouvel item "✨ Quoi de neuf ?" a été ajouté dans le menu utilisateur (en haut à droite)
- Permet de consulter les notes de mise à jour à tout moment

### Contenu affiché
- La popup affiche les 2 dernières versions du CHANGELOG.md
- Pour chaque version, on affiche :
  - Le numéro de version et la date
  - Une description générale (si présente)
  - La liste des changements avec des icônes selon le type :
    - ✨ pour les ajouts (add)
    - 🔄 pour les modifications (change)
    - 🐛 pour les corrections de bugs (fix)
    - 🗑️ pour les suppressions (del)

## Fichiers modifiés

### Backend (Python)
- **app.py** : 
  - Ajout de l'endpoint `/api/whats-new` qui parse le CHANGELOG.md
  - Fonction `parse_changelog()` pour analyser le fichier CHANGELOG

- **i18n.py** :
  - Ajout des traductions FR/EN pour la fonctionnalité

### Frontend (JavaScript)
- **static/js/app.js** :
  - `initWhatsNewModal()` : initialise la modal et les événements
  - `openWhatsNewModal()` : ouvre la modal
  - `closeWhatsNewModal()` : ferme la modal et marque comme vue
  - `loadWhatsNewContent()` : charge le contenu depuis l'API
  - `renderWhatsNewContent()` : affiche le contenu formaté
  - `checkForNewVersion()` : vérifie automatiquement les nouvelles versions au chargement
  - `getLastSeenVersion()` / `markWhatsNewAsSeen()` : gestion du localStorage

### Frontend (HTML)
- **templates/dashboard.html** :
  - Ajout du bouton "Quoi de neuf ?" dans le menu utilisateur
  - Ajout de la modal `whats-new-modal` (similaire à la modal du mode soirée)

### Frontend (CSS)
- **static/css/style.css** :
  - Styles pour la modal et son contenu
  - Styles pour les différents types de changements (add/change/fix/del)
  - Responsive design

## Stockage local
- Clé localStorage : `zytholo_last_seen_version`
- Valeur : numéro de version (ex: "4.1 - 2026-08")

## API

### GET /api/whats-new
Récupère les notes de mise à jour.

**Réponse :**
```json
{
  "success": true,
  "current_version": "4.1 - 2026-08",
  "changelog": [
    {
      "version": "4.1 - 2026-08",
      "description": "Description de la version",
      "changes": [
        {
          "type": "add",
          "text": "add custom quantity of beer"
        },
        {
          "type": "fix",
          "text": "bug with negative beer"
        }
      ]
    }
  ]
}
```

## Notes pour le développeur

### Ajouter une nouvelle version dans le CHANGELOG
Pour qu'une nouvelle version apparaisse dans la popup, il suffit de suivre le format existant dans CHANGELOG.md :

```markdown
## 4.2 - 2026-09

Description optionnelle de la version

    - add : nouvelle fonctionnalité
    - change : modification d'une fonctionnalité existante
    - fix : correction de bug
    - del : suppression de fonctionnalité
```

### Forcer l'affichage de la popup
Pour tester l'affichage automatique :
1. Ouvrir la console du navigateur
2. Exécuter : `localStorage.removeItem('zytholo_last_seen_version')`
3. Recharger la page

## Compatibilité
- Fonctionne avec tous les navigateurs modernes supportant localStorage
- Si localStorage n'est pas disponible, la popup s'affichera à chaque chargement (mode dégradé)
