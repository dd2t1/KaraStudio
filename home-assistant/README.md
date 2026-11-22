# Stockage du karaoké sur Home Assistant

## Recherche de chansons — version 1.7.1

La carte et le panneau Karaoké proposent une barre « Titre ou artiste ».
La validation cherche d’abord dans les projets Home Assistant. Si aucun projet
ne correspond, une recherche Spotify et une recherche LRCLIB sont effectuées.
Les badges indiquent uniquement les résultats obtenus : projet existant, audio
local, Spotify, paroles synchronisées ou paroles seules. Une correspondance entre
Spotify et LRCLIB exige le même titre, le même artiste et une durée à deux secondes
près. Les autres versions restent des résultats distincts à vérifier.

Pour activer le catalogue Spotify, utiliser l’intégration Spotify déjà connectée
à Home Assistant. Dans Paramètres → Appareils et services → Karaoké → Configurer,
choisir son compte Spotify, ou laisser Automatique s’il n’y en a qu’un.
Aucun nouveau Client ID, Client Secret ou Redirect URI n’est nécessaire.
La recherche réutilise côté serveur la session de l’intégration Spotify chargée.
Si cette session est indisponible ou expirée, la carte indique de reconnecter
Spotify ; les résultats Home Assistant et LRCLIB restent disponibles.
Cette recherche ne pilote pas la musique et ne remplace pas la connexion
personnelle PKCE utilisée par le lecteur de contrôle.

La version 1.7.1 corrige également le choix « Racine du dossier média » dans
le formulaire, qui pouvait être considéré comme un champ obligatoire vide.
Le dossier de stockage existant n’est pas modifié.

La recherche est déclenchée par le bouton ou Entrée, jamais à chaque frappe.
Les résultats externes sont mis en cache une minute ; les limites temporaires
des fournisseurs sont respectées. Une source indisponible est signalée sans
masquer les autres résultats. Les liens ouvrent Spotify, LRCLIB ou le projet
enregistré ; rechercher ne crée et ne sauvegarde aucun projet automatiquement.

## Projets Spotify — version 1.6

L’envoi vers Home Assistant accepte les projets Spotify sans fichier audio.
Le JSON conserve l’identifiant du morceau et les paroles importées depuis LRCLIB,
avec leurs repères. La bibliothèque distingue les sources Spotify et audio.
Les anciens projets restent compatibles, sans migration de leurs fichiers.

Pour un projet Spotify, « Lancer le karaoké » ouvre l’application de contrôle
configurée dans un onglet, avec le projet sélectionné. Connectez Spotify depuis
cet onglet et démarrez le morceau dans Spotify. Gardez l’application ouverte :
« Caster la page » transmet son horloge et ses paroles à l’écran Cast de la même
session. Le son reste sur l’appareil Spotify choisi. Le Cast n’effectue aucun
appel Spotify. Une horloge Spotify sans nouvelles données se fige après 25 secondes.
Le lecteur autonome et le navigateur média audio restent réservés aux projets
avec fichier audio. Aucun token Spotify n’est enregistré dans le projet.

Installation : remplacer `/config/custom_components/karaoke_storage` par le
dossier fourni, redémarrer Home Assistant et recharger son panneau Karaoké.
Mettre aussi à jour l’application Node/React. La connexion Spotify doit être
effectuée dans un onglet du navigateur ; les réglages du Client ID sont propres
à l’origine de cette application. L’URI de redirection doit correspondre à
l’adresse utilisée pour la connexion.

## Configuration visuelle — version 1.5

Après copie du composant et redémarrage, ouvrez **Paramètres → Appareils et
services → Ajouter une intégration → Karaoke Storage**. Une seule entrée
**Karaoké** suffit. Son bouton **Configurer** permet de modifier l’adresse de
l’application, le dossier média et l’emplacement des projets. Les applications
détectées sont proposées dans la liste des adresses ; une adresse manuelle reste
possible. L’adresse est facultative pour lire les morceaux déjà sauvegardés.

Les options s’appliquent sans redémarrage. Changer de dossier ne déplace aucun
fichier. Si le dossier média pointe déjà vers `/config/www/karaoke`, sélectionnez
sa racine comme emplacement des projets. Les déclarations natives
`homeassistant.media_dirs` restent gérées par Home Assistant.

Le panneau Karaoké ne présente plus de champs de configuration : il contient
le lecteur, les commandes Cast et les musiques. Rechargez-le après modification
des options pour utiliser la nouvelle adresse de l’application.

Pour une installation existante, le premier démarrage importe le bloc YAML
`karaoke_storage` et l’adresse enregistrée dans l’ancien panneau. Après avoir
vérifié que l’entrée est chargée et que les morceaux sont présents, retirez
uniquement le bloc `karaoke_storage` de `configuration.yaml`, puis redémarrez.
Les modifications ultérieures se font exclusivement dans **Configurer**.
Les fichiers MP3/JSON ne sont ni déplacés ni supprimés, même si l’intégration
est désactivée ou supprimée. Les routes de bibliothèque et les services Cast
restent identiques. L’ancienne écriture des réglages depuis le panneau est retirée.

Les exemples YAML des sections historiques ci-dessous décrivent les versions
précédentes ; ils ne sont pas nécessaires pour ajouter l’intégration en 1.5.

## Bibliothèque intégrée — version 1.4

Le panneau **Karaoké** affiche désormais les morceaux envoyés dans **Mes musiques
karaoké**, sous les réglages. **Actualiser les musiques** recharge la liste sans
quitter le panneau. **Lancer le karaoké** joue le son et les paroles sur l’écran
Cast sélectionné ; une enceinte Cast ou un autre lecteur reçoit seulement l’audio.
**Écouter le MP3 ici** lit le fichier audio dans le panneau (le format original
est conservé si l’envoi était un WAV, OGG, etc.).

Dans **Multimédia → Karaoké**, les titres jouent uniquement l’audio, sur tous les
appareils. L’ancien lien « Parcourir les médias » a été retiré du panneau.
Le lecteur des morceaux sauvegardés est servi par Home Assistant : il n’a pas
besoin du PC, de l’application Node ou du relais de session. Son horloge audio
pilote directement les paroles. Les couleurs et effets sont conservés ; ce mode
chanson affiche toutes les paroles, sans les questions du jeu à mots cachés.

Pour limiter « My media » au sous-dossier karaoké au lieu de tout `www`, remplacer
l’ancienne entrée `www` et le réglage de stockage par :

```yaml
homeassistant:
  media_dirs:
    local: /media
    karaoke: /config/www/karaoke
karaoke_storage:
  media_directory: karaoke
  project_subdirectory: ""
```

Les fichiers déjà envoyés restent au même emplacement. Ne pas conserver
simultanément `www: /config/www` si l’objectif est de masquer ses autres dossiers.
Les fichiers dans `www` conservent leur accès public `/local/` ; ce réglage limite
uniquement leur présentation dans le navigateur média.

L’action `karaoke_storage.play_project` prend `entity_id` et `project_id`
(l’identifiant du dossier sauvegardé). Les liens de lecture de cette action sont
signés pour quatre heures, sans transmettre le token administrateur. Le lecteur
doit pouvoir joindre l’URL de Home Assistant. DashCast peut nécessiter une
interaction de lecture sur certains appareils si leur navigateur bloque l’audio.

Avant de distribuer le composant après une modification du lecteur, exécuter
`npm run build:receiver` ; les fichiers générés sont dans `frontend/receiver/`.
L’ancien mode **Caster la page** reste disponible et fonctionne avec le PC,
comme décrit plus bas.

L'API native `media_source/local_source/upload` refuse les fichiers JSON.
Le composant fourni ajoute un endpoint authentifié qui enregistre la musique
et `niveau.json` ensemble dans un nouveau dossier `karaoke/<identifiant>/`.
Le dossier n'est publié qu'une fois les deux fichiers écrits. Les sauvegardes
précédentes sont conservées. L'audio est visible dans le navigateur média natif.
Le JSON conserve paroles, repères, couleurs, effets et paramètres de jeu ;
il n'apparaît pas dans le navigateur média natif qui filtre les types non médias.

## Installation

1. Copier le dossier `custom_components/karaoke_storage` de cette livraison
   dans `/config/custom_components/karaoke_storage` sur Home Assistant.
   **Le composant Python ne doit pas être installé dans `www`.**
2. Dans `/config/configuration.yaml`, ajouter une seule fois :

   ```yaml
   karaoke_storage:
   ```

3. Redémarrer Home Assistant. Le dossier média `local` est utilisé par défaut,
   sinon le premier dossier déclaré dans `homeassistant.media_dirs`.
4. Sur le PC, ajouter `HASS_URL=http://homeassistant.local:8123` et
   `HASS_TOCKEN=...` dans le `.env` du projet, puis relancer `npm run dev`.
   `HASS_TOKEN` est également accepté. Le token doit être celui d'un administrateur.
   Ne pas utiliser de variables préfixées `VITE_` pour ces identifiants.
5. Dans l'éditeur, sélectionner **Home Assistant · stockage média** et envoyer.

## Utiliser le dossier www

Le dossier `www` correspond habituellement à `/config/www`. Pour y stocker les
projets tout en exposant la musique dans le navigateur média, fusionner ces
entrées avec la configuration existante (ne pas dupliquer `homeassistant:`) :

```yaml
homeassistant:
  media_dirs:
    local: /media
    www: /config/www

karaoke_storage:
  media_directory: www
```

Adapter `/config/www` si l'installation utilise réellement un autre chemin.
Les projets seront dans `/config/www/karaoke/<identifiant>/`, accessibles via
`/local/karaoke/<identifiant>/musique.mp3` (extension selon le fichier d'origine)
et `/local/karaoke/<identifiant>/niveau.json`.
**Les fichiers dans www sont accessibles sans authentification à toute personne
qui connaît leur URL.** Utiliser `/media` pour le stockage média authentifié.

## Utilisation et limites

- **Mon PC** télécharge un ZIP contenant la musique originale et le JSON.
  Extraire l'archive puis ouvrir les deux fichiers dans « Jouer ».
- **JSON seul** conserve l'ancien export sans recopier la musique.
- **Home Assistant** accepte un audio de 20 Mio maximum et un JSON de 2 Mio.
  Formats : MP3, WAV, OGG, FLAC, M4A, AAC, OPUS et WEBM.
- En cas de délai dépassé, vérifier si le dossier existe avant de recommencer.
- Les projets sauvegardés sont accessibles dans la bibliothèque du panneau.
- Le token reste dans l'API Node, jamais dans l'interface ou les fichiers exportés.
  L'API Node est destinée à cette application locale, pas à être exposée directement
  sur Internet. En production, conserver un proxy de même origine pour `/api`.

Référence : [API et source média Home Assistant](https://developers.home-assistant.io/docs/core/platform/media_source/).

## Afficher la page sur Chromecast / Google TV

Version 1.1 : l’action **Karaoke Storage : Afficher le karaoké**
(`karaoke_storage.cast_page`) apparaît dans Outils de développement → Actions,
et peut être ajoutée à un script, une automatisation ou un bouton de dashboard.
L’intégration Google Cast doit déjà avoir découvert l’écran.

```yaml
action: karaoke_storage.cast_page
data:
  entity_id: media_player.4k_google_tv_box
  url: http://192.168.0.5:3000/
```

Cette URL est un **exemple pour le futur Docker**, pas un déploiement existant.
Pendant le développement, utiliser l’IP LAN du PC et le port du serveur web,
en s’assurant qu’il écoute sur le réseau et que le pare-feu autorise l’accès.
`localhost` désignerait l’écran et est donc refusé.

Pour définir l’URL une seule fois, ajouter `app_url` à la configuration existante :

```yaml
karaoke_storage:
  media_directory: www
  app_url: http://192.168.0.5:3000/
```

Redémarrer Home Assistant après modification. Le champ `url` de l’action devient
facultatif ; il peut toujours remplacer l’URL configurée pour un lancement.
Au passage sur Docker, il suffit de changer cette adresse. Le Docker devra
servir l’interface et son API `/api` sous une même origine accessible sur le LAN ;
les variables HASS restent dans son serveur, jamais dans la page envoyée à l’écran.

Le lancement utilise le récepteur **DashCast**, via la plateforme Cast de Home
Assistant. Les enceintes et groupes audio sont refusés. L’acquittement Cast
confirme l’envoi de la commande, pas le rendu de la page. Le Chromecast doit avoir
accès à l’URL et au récepteur DashCast ; les pages avec authentification interactive
et les politiques navigateur peuvent empêcher l’affichage ou l’audio automatique.

Depuis la version 1.3, le bouton **Caster la page** du panneau crée une session
partagée avec **Afficher ici**. Rechargez le panneau après mise à jour, ouvrez
l’aperçu, chargez musique et JSON dans « Jouer », puis lancez le Cast.
L’écran distant affiche uniquement la phrase en cours et la suivante, avec les
couleurs, animations et mots masqués. Lecture, pause, vitesse, retours dans la
chanson et réponses aux mots cachés suivent l’appareil de contrôle. L’aperçu de
l’éditeur transmet également ses paroles après le calage.

Le son reste sur l’appareil qui pilote la lecture ; aucun fichier audio n’est
envoyé au Chromecast. Le relais de synchronisation dans l’API Node doit rester
actif. Un arrêt de connexion de plus de deux secondes affiche un message de
synchronisation interrompue, puis la réception reprend automatiquement.
La synchronisation est vérifiée entre deux navigateurs ; le décalage réel sur
un Chromecast dépend du réseau et de ses performances.

Les deux pages doivent être ouvertes depuis le même widget : celui-ci fournit
un identifiant de session aléatoire et un secret d’écriture réservé à l’aperçu.
Le secret reste dans le fragment de l’URL de contrôle et n’est pas envoyé au Cast.
Une action manuelle sans identifiant de session affiche une invitation à ouvrir
le panneau Karaoké. Les sessions en mémoire expirent après une heure sans mises
à jour, et sont perdues au redémarrage de l’API ; l’aperçu actif les recrée.
