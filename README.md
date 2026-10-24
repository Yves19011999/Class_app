# Classe — UltraReview v4.3

**Classe** est un carnet de bord pédagogique mobile, offline-first, installable comme PWA et prêt à être empaqueté en application Android.

## Fonctionnalités

- 🏠 Tableau de bord « Aujourd’hui » avec prochaine séance et alertes
- 👨‍🎓 Élèves, recherche, filtres et fiches individuelles
- 📷 Photo de l’élève depuis la galerie ou la caméra du téléphone
- 📞 Appel direct du parent/tuteur depuis la fiche élève
- ✓ Présences liées aux séances : présent, retard, absent
- 🗓️ Planning hebdomadaire + calendrier mensuel
- 🧑‍🏫 Préparation et journal de séance
- 📚 Devoirs, échéances et retards
- 📝 Notes individuelles et saisie collective
- ⚖️ Coefficients et moyennes pondérées
- 📊 Statistiques par classe, distribution des notes et présence
- 📄 Rapports imprimables / export PDF depuis le menu d’impression
- 📥 Import des élèves par CSV
- 💾 Export/import JSON complet et export CSV des notes
- 🌙 Mode clair/sombre
- 🔐 Verrouillage PIN local
- 🔔 Notifications locales Android planifiées 24/24, même lorsque l’app est fermée
- ⏰ Deux rappels par cours : 2 heures et 30 minutes avant le début
- 📄 Aperçu du planning dans l’application et export PDF avec en-tête établissement/année/discipline/enseignant/niveau
- ➕ Bouton « Créer une classe » toujours visible dans l’écran Élèves
- 📲 Installation PWA depuis l’application
- ↗ Partage de l’application
- 📴 Fonctionnement hors connexion
- 🤖 Projet Android Capacitor + workflow GitHub Actions pour construire un APK sans ordinateur
- 🎨 Interface mobile modernisée : hiérarchie plus claire, cartes accessibles et contraste renforcé
- 🔒 Permissions Android limitées au nécessaire : caméra pour les photos d’élèves et notifications

## Données

Les données scolaires restent dans IndexedDB sur l’appareil. **Exporte régulièrement une sauvegarde JSON**, surtout avant de changer de téléphone.

## Installation PWA

Sur Android/Chrome, utilise le bouton **Installer Classe** dans Réglages ou le menu du navigateur. Sur iPhone/iPad, utilise Safari → Partager → Ajouter à l’écran d’accueil.

## Construire un vrai APK Android sans ordinateur

Lis **BUILD-APK-ANDROID.md**. Le dépôt contient un workflow GitHub Actions qui prépare automatiquement le projet Capacitor et produit un APK debug téléchargeable depuis GitHub Actions.

## Développement local

Le dossier web peut être servi par n’importe quel serveur HTTP/HTTPS. L’ouverture directe en `file://` ne permet pas toutes les fonctions PWA.

## Version

4.3.0
