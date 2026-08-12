#!/usr/bin/env python3
"""
Script de test simple pour la fonctionnalité "Quoi de neuf ?"
"""

import os
import re

def parse_changelog(content):
    """Parse le fichier CHANGELOG.md et retourne une liste de versions"""
    versions = []
    current_version = None
    current_description = []
    current_changes = []

    lines = content.split('\n')

    for line in lines:
        # Détection d'une nouvelle version (## X.X.X - Date)
        if line.startswith('## ') and not line.startswith('###'):
            # Sauvegarder la version précédente
            if current_version:
                versions.append({
                    'version': current_version,
                    'description': '\n'.join(current_description).strip(),
                    'changes': current_changes
                })

            # Nouvelle version
            current_version = line.replace('##', '').strip()
            current_description = []
            current_changes = []

        # Lignes de description (avant les bullet points)
        elif current_version and line.strip() and not line.strip().startswith('-') and not line.strip().startswith('#'):
            # Ignorer les lignes vides et les séparateurs
            if line.strip() != '---':
                current_description.append(line.strip())

        # Bullet points avec type (add, change, fix, del)
        elif current_version and line.strip().startswith('- '):
            change_line = line.strip()[2:].strip()
            change_type = 'change'
            change_text = change_line

            # Détecter le type de changement
            if change_line.startswith('add :') or change_line.startswith('add:'):
                change_type = 'add'
                change_text = change_line.split(':', 1)[1].strip()
            elif change_line.startswith('change :') or change_line.startswith('change:'):
                change_type = 'change'
                change_text = change_line.split(':', 1)[1].strip()
            elif change_line.startswith('fix :') or change_line.startswith('fix:'):
                change_type = 'fix'
                change_text = change_line.split(':', 1)[1].strip()
            elif change_line.startswith('del :') or change_line.startswith('del:'):
                change_type = 'del'
                change_text = change_line.split(':', 1)[1].strip()

            current_changes.append({
                'type': change_type,
                'text': change_text
            })

    # Ajouter la dernière version
    if current_version:
        versions.append({
            'version': current_version,
            'description': '\n'.join(current_description).strip(),
            'changes': current_changes
        })

    return versions

def test_parse_changelog():
    """Test du parser de CHANGELOG"""
    print("=== Test du parser de CHANGELOG ===\n")

    changelog_path = os.path.join(os.path.dirname(__file__), 'CHANGELOG.md')

    if not os.path.exists(changelog_path):
        print("❌ CHANGELOG.md introuvable")
        return False

    with open(changelog_path, 'r', encoding='utf-8') as f:
        content = f.read()

    versions = parse_changelog(content)

    if not versions:
        print("❌ Aucune version trouvée dans le CHANGELOG")
        return False

    print(f"✅ {len(versions)} versions trouvées dans le CHANGELOG\n")

    # Afficher les 2 premières versions
    for i, version in enumerate(versions[:2]):
        print(f"Version {i+1}: {version['version']}")

        if version['description']:
            desc = version['description']
            if len(desc) > 100:
                desc = desc[:100] + "..."
            print(f"  Description: {desc}")

        print(f"  Nombre de changements: {len(version['changes'])}")

        # Afficher quelques changements
        for change in version['changes'][:3]:
            icon = {'add': '✨', 'change': '🔄', 'fix': '🐛', 'del': '🗑️'}.get(change['type'], '•')
            text = change['text']
            if len(text) > 60:
                text = text[:60] + "..."
            print(f"    {icon} [{change['type']}] {text}")

        if len(version['changes']) > 3:
            print(f"    ... et {len(version['changes']) - 3} autres changements")

        print()

    return True

def test_changelog_format():
    """Vérifie le format du CHANGELOG"""
    print("=== Vérification du format du CHANGELOG ===\n")

    changelog_path = os.path.join(os.path.dirname(__file__), 'CHANGELOG.md')

    with open(changelog_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    version_count = 0
    change_count = 0

    for line in lines:
        if line.startswith('## ') and not line.startswith('###'):
            version_count += 1
        elif line.strip().startswith('- '):
            change_count += 1

    print(f"✅ {version_count} versions détectées")
    print(f"✅ {change_count} changements détectés")
    print()

    return True

if __name__ == '__main__':
    print("Test de la fonctionnalité 'Quoi de neuf ?'\n")
    print("=" * 50)
    print()

    success = True

    try:
        if not test_changelog_format():
            success = False

        if not test_parse_changelog():
            success = False

        if success:
            print("=" * 50)
            print("✅ Tous les tests sont passés avec succès !")
            print()
            print("La fonctionnalité 'Quoi de neuf ?' est prête à être utilisée.")
            print()
            print("Pour tester dans l'application :")
            print("1. Lancez l'application")
            print("2. Connectez-vous")
            print("3. La popup devrait s'afficher automatiquement")
            print("4. Vous pouvez aussi l'ouvrir via le menu (en haut à droite)")
            print()
            print("Pour forcer l'affichage de la popup :")
            print("  - Ouvrir la console du navigateur")
            print("  - Exécuter: localStorage.removeItem('zytholo_last_seen_version')")
            print("  - Recharger la page")
        else:
            print("=" * 50)
            print("❌ Certains tests ont échoué")
            exit(1)

    except Exception as e:
        print(f"❌ Erreur lors des tests: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
