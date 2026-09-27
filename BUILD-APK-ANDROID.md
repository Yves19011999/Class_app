# Construire Classe.apk sans ordinateur

Cette version contient un projet Android Capacitor et un workflow GitHub Actions.

## Méthode recommandée depuis un téléphone

1. Crée un dépôt GitHub depuis le navigateur de ton téléphone.
2. Envoie tous les fichiers de ce ZIP dans le dépôt.
3. Ouvre l'onglet **Actions**.
4. Sélectionne **Build Classe APK**.
5. Appuie sur **Run workflow**.
6. Attends la fin de la compilation.
7. Ouvre l'exécution terminée puis télécharge l'artefact **Classe-Android-debug**.
8. Extrais `app-debug.apk` et installe-le sur Android.

## Important

- Android peut demander d'autoriser l'installation d'applications provenant du navigateur/fichiers.
- Pour une publication Play Store, il faudra ensuite générer une version signée avec une clé de signature et préparer la fiche Play Store.
- L'APK debug est destiné à l'installation et aux tests. Il ne faut pas le considérer comme une version Play Store finale.

## Identité Android

- Nom : Classe
- Application ID : `com.classe.gestion`
- Version : 4.0.0
