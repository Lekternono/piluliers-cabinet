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

## Fichiers

- `index.html`, `css/app.css` : page et mise en forme
- `js/app.js` : écrans et logique
- `js/api.js` : accès à Supabase
- `js/demo.js` : données fictives du mode démo
- `js/config.js` : adresse et clé publique du projet Supabase
- `sql/schema.sql` : structure de la base (tables, règles d'accès, journal, stockage des photos)
- `vercel.json` : en-têtes de sécurité
