# Audit complet de régression — Class App 4.9.21

Date : 4 novembre 2026

## Conclusion exécutive

La version 4.9.21 n’a pas supprimé les fonctions principales de gestion scolaire du fichier `app.js` : les parcours classes, élèves, emploi du temps, présence, devoirs, notes, coefficients, rapports, import/export, audit local, Pro, PIN, notifications et migration native sont encore présents sous forme de fonctions JavaScript.

En revanche, l’application a régressé sur deux points importants :

1. Plusieurs actions étaient mal exposées dans l’interface. Le gestionnaire de classes n’était pas directement accessible depuis le menu, et l’action rapide de création d’un devoir n’était pas rendue dans le dashboard.
2. Les fonctions matérielles et natives annoncées dans l’historique utilisateur ne sont pas réellement implémentées dans l’APK principale : Bluetooth, HID/XInput/gamepad, gyroscope, apprentissage de télécommande laser/projecteur et connexion de périphériques ne disposent d’aucun plugin ou code d’exécution complet.

## Vérification Git

Comparaison de `6c73401` (version Neon Aurora précédente) à `222d4ba` (version actuelle) :

- Aucun fichier de fonctionnalité métier scolaire n’a été supprimé dans les commits récents.
- `app.js` contient 119 fonctions métier dans `6c73401` et 123 dans `HEAD` ; les quatre fonctions supplémentaires concernent le son d’interface.
- Les changements récents portent surtout sur CSS, cache PWA, versionnement et branchements du dashboard.
- Le commit fonctionnel actuel est `222d4ba`.

## Fonctionnalités scolaires présentes dans `app.js`

| Domaine | État du code | Accès actuel |
|---|---|---|
| Classes | Présent | Élèves → Gérer les classes ; menu latéral ajouté dans le correctif |
| Matières/coefficient matière | Présent | Notes → Gérer les matières |
| Élèves | Présent | Élèves, FAB, formulaire |
| Emploi du temps semaine/mois | Présent | Emploi |
| Création/modification/suppression séance | Présent | Emploi → + Séance / clic séance |
| Journal de séance | Présent | Clic sur séance |
| Démarrer/terminer séance | Présent | Détail séance |
| Appel présence/retard/absence | Présent | Présences / séance |
| Devoirs | Présent | Devoirs ; action rapide ajoutée |
| Notes individuelles | Présent | Notes |
| Saisie collective des notes | Présent | Notes → saisie collective |
| Moyennes pondérées | Présent | `weightedAvg`, `weightedSubjectAvg` |
| Rapports/PDF | Présent | Rapports et planning PDF |
| Import/export JSON et CSV | Présent | Paramètres / dashboard |
| Audit local | Présent | Audit IA local |
| Accès Pro/PIN | Présent | Paramètres / Version Pro |
| Notifications | Partiel | Code JavaScript et plugin local présents, permissions à tester sur appareil |

## Régressions d’interface corrigées dans 4.9.21

- Ajout du menu `Classes et matières` dans la sidebar.
- Ajout de l’action dashboard `Créer un devoir` (`qaDevoir`).
- Invalidation du cache vers `classe-cache-v4-9-21-functional-flows`.
- Mise à jour du marqueur de reset PWA vers `classe_functional_reset_4921`.
- Version Android : `4.9.21`, version code `40921`.

## Fonctionnalités annoncées mais absentes de l’exécution réelle

### Bluetooth / périphériques

Le manifeste déclare `CAMERA`, `POST_NOTIFICATIONS` et `INTERNET`, mais aucune permission Bluetooth (`BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN`, `BLUETOOTH_ADVERTISE`) ni plugin Capacitor Bluetooth n’est présent.

Conclusion : la connexion Bluetooth ne peut pas fonctionner dans cette APK.

### Gamepad XInput / HID / clavier matériel avancé

Aucun code Android ou JavaScript ne gère `InputDevice`, `KeyEvent`, `MotionEvent`, XInput, USB HID ou les mappings de manette. Le support clavier visible dans l’historique correspond à des intentions précédentes, pas à une implémentation vérifiable dans la version actuelle.

Conclusion : le support XInput/HID n’est pas livré.

### Gyroscope et capteurs

Le manifeste ne déclare pas de capteur et aucun appel à `SensorManager`, `TYPE_GYROSCOPE`, `TYPE_ROTATION_VECTOR` ou plugin capteur n’a été trouvé.

Conclusion : le gyroscope n’est pas implémenté.

### Télécommande laser / projecteur

La caméra est déclarée mais aucun flux CameraX/Camera2, analyse d’intensité laser, apprentissage de signal, stockage de variables ou émetteur de commande projecteur n’est présent.

Conclusion : l’apprentissage de télécommande par variations laser n’est pas implémenté.

### Shell Kotlin/Compose

`NativeShellActivity` et `NativeDatabase` existent, mais `MainActivity` reste une `BridgeActivity` Capacitor et l’activité Compose est `exported=false`, sans chemin de navigation depuis l’interface web.

Le shell Compose est donc un prototype séparé, pas le shell utilisé par l’APK principale.

### Base native

La base SQLite native couvre classes, élèves, matières, notes, devoirs, présences et paramètres. Elle ne couvre pas le planning, les sessions/journaux, les photos, les coefficients de classe complets ni toutes les données IndexedDB. La version de base est `1`, alors que `onUpgrade` contient une migration conditionnée par `oldVersion < 2` : cette migration ne sera jamais exécutée tant que la version du helper ne passe pas à 2.

## Risques techniques identifiés

- Aucun test automatisé de parcours UI n’est configuré dans `package.json`.
- Les tests Android présents sont les tests exemples Capacitor et ne couvrent pas les fonctions métier.
- Les changements CSS sont empilés en fin de fichier au lieu de supprimer proprement les anciennes couches ; cela augmente le risque d’affichage incohérent.
- `registerServiceWorker` utilisait encore un ancien paramètre de cache avant le correctif 4.9.21 ; l’invalidation a été corrigée.
- La version web et le contenu Android doivent toujours être synchronisés par `prepare:web` puis `cap sync`.

## Priorités de restauration

1. Geler la branche actuelle et conserver l’APK précédente comme point de retour.
2. Ajouter des tests fonctionnels réels pour classes, élèves, séance, présence, devoir, note, coefficient, export/import et migration.
3. Décider explicitement si Bluetooth, HID/XInput, gyroscope et télécommande projecteur font partie de Class App ou d’HIDFlow ; ils ne doivent pas être annoncés comme livrés sans plugins Android vérifiés.
4. Si ces fonctions appartiennent à Class App, créer des plugins Android séparés avec permissions, gestion du cycle de vie, tests appareil et UI de diagnostic.
5. Faire du shell Compose une migration progressive réelle uniquement après parité fonctionnelle avec le dashboard web.

## Verdict

La régression visible actuelle vient principalement du manque de branchements et de la promesse de fonctionnalités natives non livrées, pas d’une suppression totale du moteur scolaire JavaScript. La prochaine version doit être une version de restauration fonctionnelle et testée, pas une nouvelle couche esthétique.
