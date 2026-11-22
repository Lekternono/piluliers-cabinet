# Piluliers du cabinet

Application web (iPhone, iPad, ordinateur) qui remplace le classeur papier des traitements :
fiches patients, ordonnances photographiées, préparation guidée des piluliers, double contrôle
des changements de traitement et journal de toutes les modifications.

## Fonctionnement

- Page statique (HTML, CSS, JavaScript sans compilation), hébergée sur Vercel.
- Données dans Supabase (projet `piluliers-cabinet`, région Paris).
- Accès : compte personnel + code du cabinet. Sans le code, un compte connecté ne voit rien.
- Double contrôle imposé par la base : une modification de traitement doit être validée par une autre personne.
- Mode démo (patients fictifs, rien n'est enregistré) accessible depuis l'écran de connexion.
- Aide à la préparation, sans suivi des prises : contenu de chaque case (matin, midi, soir, nuit) jour par jour.
- Base publique des médicaments (ANSM) importée dans Supabase : recherche, génériques, lien vers la fiche officielle.
- Lecture d'ordonnance (photo ou PDF) dans le navigateur : Tesseract pour les images, pdf.js pour les PDF,
  puis repérage des médicaments dans la base officielle. Aucune donnée n'est envoyée à un service de lecture extérieur.

## Fichiers

- `index.html`, `css/app.css` : page et mise en forme
- `js/app.js` : écrans et logique
- `js/api.js` : accès à Supabase
- `js/demo.js` : données fictives du mode démo
- `js/ocr.js` : lecture d'ordonnance et analyse de la posologie
- `js/config.js` : adresse et clé publique du projet Supabase
- `sql/schema.sql` : structure de la base (tables, règles d'accès, journal, stockage des photos)
- `vercel.json` : en-têtes de sécurité
- `supabase/functions/maj-bdpm` : import de la base des médicaments depuis le site de l'ANSM
