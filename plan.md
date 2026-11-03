# Refonte senior de Class App

## Direction choisie

**Command Center calme** : une interface de pilotage pédagogique, dense mais respirable, inspirée des outils professionnels de gestion plutôt que des dashboards marketing.

### Principes

- Une hiérarchie nette : une action primaire par écran, les informations secondaires en niveaux de contraste.
- Une palette claire et professionnelle : bleu nuit pour la navigation, bleu électrique pour l’action, surfaces froides pour le contenu, accent ambre pour les alertes.
- Une structure en rail latéral + contenu flexible, sans barre de navigation basse concurrente sur tablette et desktop.
- Des composants compacts, accessibles, avec des zones tactiles d’au moins 44 px sur mobile.
- Les animations servent la compréhension : transitions courtes, aucun effet décoratif permanent.

### Architecture visuelle

- Sidebar persistante sur tablette/DeX/desktop, tiroir modal sur téléphone.
- Topbar compacte avec titre de contexte, recherche et actions système.
- Dashboard composé d’un résumé d’activité, de KPI courts et de panneaux opérationnels.
- Cartes avec bordure légère, ombres modérées et états vides explicites.
- Formulaires dans des sheets cohérentes, avec boutons primaires uniformes.

### Typographie et voix

- Système natif : `Inter` si disponible, sinon `system-ui`.
- Titres courts et orientés action : « Aujourd’hui », « Notes », « Prochaines échéances ».
- Microcopy factuelle : « Aucune donnée », « Ajouter une classe », « Enregistrer la note ».

### Signature

- Couleur propriétaire : `--command-blue: #2563EB`.
- Motif signature : rail latéral bleu nuit avec indicateur actif en barre verticale, surfaces “frosted” uniquement pour les éléments de contexte.

## Mise en œuvre

La refonte est livrée dans `class-senior-redesign.css`, chargé après les styles historiques. Les IDs et classes fonctionnels restent inchangés pour ne pas casser `app.js`. Les anciennes règles pourront ensuite être supprimées par lots après validation visuelle.
