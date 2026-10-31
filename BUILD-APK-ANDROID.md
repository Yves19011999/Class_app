# Construire l’APK Android de Classe

Le dépôt contient l’application PWA offline-first, le projet Capacitor généré par le workflow et une action GitHub pour construire un APK Android de test. L’application web reste la version principale et continue de fonctionner sans compte ni serveur applicatif.

## Méthode recommandée depuis un téléphone

1. Ouvre l’onglet **Actions** du dépôt `Class_app`.
2. Sélectionne **Build Classe APK**, puis **Run workflow**.
3. Attends la fin de la compilation.
4. Ouvre l’exécution terminée puis télécharge l’artefact **Classe-Android-debug**.
5. Extrais `app-debug.apk` et installe-le sur Android.

## Important

- Android peut demander d'autoriser l'installation d'applications provenant du navigateur/fichiers.
- Pour une publication Play Store, il faudra ensuite générer une version signée avec une clé de signature et préparer la fiche Play Store.
- L’APK produit par ce workflow est un build debug destiné à l’installation et aux tests. Il ne constitue pas une version Play Store finale ni une publication signée de production.
- Le build déclare `CAMERA` (photo d’élève) et `POST_NOTIFICATIONS` (rappels de séance). Les rappels sont désormais planifiés nativement sur Android pour fonctionner même lorsque l’application est fermée. Aucun accès général au stockage Android n’est demandé : les données restent dans IndexedDB et les fichiers sont choisis via le sélecteur système.
- Les nouvelles installations démarrent sans données préchargées : crée tes classes depuis le bouton visible dans l’écran Élèves.
- Pour préserver les données, exporte une sauvegarde JSON avant une mise à jour ou un changement d’appareil. Les APK utilisent un versionCode croissant; configure et protège une clé de signature stable dans les secrets GitHub avant toute distribution de mises à jour à des utilisateurs.

## Identité Android

- Nom : Classe
- Application ID : `com.classe.gestion`
- Version : 4.9.0
