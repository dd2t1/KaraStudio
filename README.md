# Karaoke

Application web de karaoké moderne avec synchronisation audio temps réel, animations de paroles, ambiance visuelle réactive, mode QCM et intégrations Home Assistant / Cast.

---

## Démarrage rapide

### 1. Prérequis
- [Node.js](https://nodejs.org/) (version LTS recommandée, v18+ ou v20+).
- Python 3.10+ (optionnel, uniquement pour la transcription audio locale Faster-Whisper).

### 2. Configuration
Copiez le modèle de variables d'environnement et adaptez-le selon vos besoins :
```bash
cp .env.example .env
```

### 3. Lancement

- **Sous Windows (recommandé)** :  
  Double-cliquez sur `lancer.bat`. Le script vérifie Node.js, installe automatiquement les dépendances si nécessaire, libère les ports si besoin et démarre le serveur API et l'interface web dans votre navigateur par défaut.

- **En ligne de commande (Windows, macOS, Linux)** :
  ```bash
  # Installation des dépendances
  npm install

  # Lancement du serveur API et de l'interface avec ouverture du navigateur
  npm run dev:open
  ```

---

## Enregistrer sur le PC ou Home Assistant

Dans l'éditeur, choisissez **Mon PC** pour télécharger un ZIP avec la musique
et le JSON, ou **Home Assistant** pour envoyer les deux fichiers. L'export
**JSON seul** reste disponible. Le serveur utilise `HASS_URL` et `HASS_TOCKEN`
(ou `HASS_TOKEN`) du `.env` ; redémarrez-le après modification.

Home Assistant nécessite le composant fourni pour accepter le JSON avec l'audio.
Voir [l'installation et le choix du dossier média ou www](home-assistant/README.md).

## Lancer sous Windows

Double-cliquez sur **lancer.bat**. Le lanceur se place dans le dossier du projet,
installe les dépendances JavaScript si nécessaire, démarre l'API et l'interface,
puis ouvre le navigateur. Node.js et npm doivent être installés et accessibles
dans le PATH (utilisez une version LTS récente).

La console affiche les étapes du démarrage. Si les ports 8787 ou 5173 sont
déjà utilisés, le choix **1** arrête les serveurs identifiés comme appartenant
à ce projet, puis relance l'ensemble. Le choix **2** annule sans rien arrêter.
Un programme étranger ou un ancien lancement impossible à identifier bloque
le redémarrage automatique ; aucun processus existant n'est arrêté sans choix.
Le navigateur utilise toujours la même adresse locale pour conserver les préférences.
L'interface ne bascule pas silencieusement sur un autre port. LM Studio se lance
séparément si vous souhaitez utiliser l'aide IA.

Gardez la fenêtre ouverte pendant l'utilisation. Appuyez sur **Ctrl+C** pour
arrêter les services et confirmez l'arrêt si Windows le demande.
Si un service s'arrête, l'autre est arrêté également.

Le lanceur ne configure pas le moteur de transcription. La configuration
existante dans `.env` reste utilisée. Par défaut, la transcription locale attend
Python dans `.venv-local\Scripts\python.exe` et les dépendances de
`transcribe_local.py`. Le fournisseur `openai` nécessite `OPENAI_API_KEY`.
L'interface redirige les appels API vers le port **8787** ; conservez ce port
pour l'API sauf si vous adaptez aussi `vite.config.js`.

## Commandes utiles

Dans Paramètres → Paramètres expérimentaux, « Remonter les erreurs au serveur
local » active un diagnostic opt-in pour les adresses locales seulement. Les
erreurs JavaScript, promesses non gérées et échecs IA sont remontés avec des
champs techniques filtrés, jamais leurs messages bruts ni les contenus du
morceau. Les rapports sont visibles dans la console API et conservés en mémoire
pendant une heure, au maximum cent entrées ; aucun fichier de télémétrie n'est
créé. Le navigateur limite les envois à dix par minute et déduplique les erreurs.
Le serveur local expose `GET /api/browser-errors` pour le diagnostic, avec accès
limité aux requêtes locales. Désactiver l'option arrête les nouveaux envois sans
effacer les rapports déjà reçus ; un redémarrage du serveur efface ces rapports.

La transcription locale conserve tout l’audio : le filtre de détection de parole
peut supprimer des passages chantés. Pour un enregistrement parlé, vous pouvez
le réactiver avec `LOCAL_WHISPER_VAD=true` dans `.env`, puis redémarrer l’API.
Vérifiez les paroles et leur calage avant d’utiliser le JSON généré.

- `npm run dev:open` : démarrer les deux services et ouvrir le navigateur.
- `npm run dev` : démarrer les deux services sans ouvrir le navigateur.
- `npm run build` : générer l'interface dans `dist`.
- `npm run lint` : vérifier le code JavaScript.
- `npm test` : vérifier les paroles, le calage, les effets, les QCM et le cycle de vie audio.

Après une modification des dépendances, exécutez `npm ci` pour les réinstaller.

## Ambiance Concert

Les parcours « Jouer » et « Tester le Jeu » partagent une scène avec halos,
faisceaux et particules réactifs au fichier audio. Cliquez sur Lecture pour
démarrer : aucun microphone n'est utilisé. Le plein écran est accessible en
haut à droite ; Échap permet d'en sortir. Sans Web Audio, le fond reste statique.
La préférence système de réduction des animations désactive les mouvements et
les confettis, y compris lorsqu'elle change pendant une partie.

Dans l'éditeur, sélectionnez un mot puis choisissez Saut, Vague, Néon,
Pulsation, Élastique ou Balancement. Réglez la durée (0,2 à 3 secondes), puis
choisissez une boucle ou un instant depuis le début de la phrase et cliquez
sur « Appliquer l'effet ». « Caler l'effet maintenant » (C hors du champ)
utilise la position audio courante. Choisissez « Mot ou mots sélectionnés » ou
« Toute la phrase » dans Animation texte. Le texte s’édite sans balises ; les
passages soulignés et colorés portent C (animation) ou V (mot caché).
L’aperçu reste en haut du panneau sur ordinateur. Survolez un passage (ou
ciblez-le au clavier) pour voir son code au-dessus ; cliquez pour le sélectionner
avant de presser C ou V, hors des champs de saisie. Le code brut reste accessible
dans « Code de la phrase · avancé ». Exportez le JSON pour conserver les réglages.

Les nouveaux codes acceptent une durée : `*pulse/1.20:mot*` en boucle,
`*saut@1.20/0.80:mot*` pour un saut de 0,80 seconde à 1,20 seconde dans la phrase.
Les anciens codes restent compatibles et utilisent 0,80 seconde par défaut.
Les animations des paroles suivent la position audio, même en pause ou après
un retour arrière. Le catalogue des thèmes est préparé avec le thème `concert` ;
le choix de plusieurs thèmes n'est pas encore exposé dans les paramètres.

## Créer et éditer un karaoké

Le panneau « Éditeur de Jeu » permet de modifier le texte sans changer les
repères. Entrée, `\n` et `/n` créent un retour à la ligne dans la même phrase.
Sélectionnez du texte et utilisez les boutons pour colorer, mettre en gras ou
animer des mots. Les codes sont conservés dans le JSON :

- `&crouge&r`, `&#55ffffcyan&r` : couleurs, puis retour au style de la phrase.
- `**gras**`, `*italique*` : mise en forme.
- `*saut:mot*`, `*vague:mot*`, `*flash:mot*` : animation en boucle.
- `*saut@1.20:mot*` : saut à 1,20 seconde après le début de la phrase.
- `*cache:secret*` : mot caché ; le bouton « Mot manquant » active automatiquement
  le mode QCM. Plusieurs mots ou groupes peuvent être cachés dans une phrase.
- `*cache@1.20/2.00:secret*` : question à 1,20 seconde dans la phrase, avec coupure
  du son pendant 2 secondes au maximum.
- `*cache@1.20/0.00:secret*` : pause à ce repère, puis reprise manuelle par Espace.

La liste « Mots cachés » associe à chaque mot son repère, son comportement et
ses mauvaises réponses. Sélectionnez une entrée, lancez la musique puis appuyez
sur **V** hors des champs de saisie pour poser son repère. Le bouton « Caler… »
fait la même chose ; le repère peut aussi être corrigé en secondes.
Choisissez **0 — Pause manuelle (Espace)** pour arrêter réellement la musique.
Répondre au QCM ne relance pas cette pause : appuyez ensuite sur Espace ou Lecture.
Reprendre sans répondre passe la question sans point. Les réglages sont exportés
dans le JSON. Pour plusieurs mots dans une phrase, posez un repère distinct sur
chacun avant de tester ou d’exporter. Les anciens niveaux à un seul mot gardent
leur déclenchement avant la fin de la phrase tant qu’aucun repère V n’est posé.

Pour enregistrer un saut, sélectionnez le mot dans le champ de texte, lancez
la musique, puis cliquez sur « Caler l’effet maintenant » au moment voulu.
La touche C fait la même chose lorsque le curseur est hors d’un champ de saisie.
Exportez ensuite le JSON pour conserver les modifications.

Dans « Créer / Éditer », chargez la musique et les paroles. Pendant le calage,
appuyez sur **Espace au premier mot de la première phrase**, puis au premier
mot de chaque phrase suivante. La phrase en cours reste au centre ; la suivante
apparaît dessous. Après la dernière phrase, appuyez une dernière fois pour terminer.
L’export prend le nom du fichier audio : enregistrez le JSON avec sa musique.

Si la phrase chantée correspond déjà à la deuxième ligne affichée, les repères
ont peut-être été pris en fin de phrase. Chargez le JSON dans l’éditeur, ouvrez
« Les paroles ont une phrase de retard ? », indiquez le début réel du chant en
secondes, puis appliquez la correction une seule fois. Vérifiez avec « Tester le Jeu »
avant d’exporter.

---

## Licence

Ce projet est distribué sous licence **GNU Affero General Public License v3.0 (AGPL-3.0)**. Consultez le fichier `LICENSE` pour plus de détails.

