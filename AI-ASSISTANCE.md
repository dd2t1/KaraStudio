# Aide IA expérimentale

## Galerie et signatures de mots

Dans l'éditeur d'une phrase, ouvrir **Animation texte → Ouvrir la galerie et les signatures**. Les six effets existants se prévisualisent sur le même mot, sans IA et sans modifier le morceau. Choisir un mot répété ou une courte expression, puis la portée : phrase actuelle, même section ou chanson entière. Le détail des occurrences permet de retirer certaines cibles. « Même section » regroupe les phrases portant le même libellé, même si elles ne sont pas contiguës.

L'application reste explicite. Remplacer une animation existante demande confirmation ; ses repères, les styles et les QCM sont conservés. Les placements sans alignement par mot sont signalés « À caler ». C permet ensuite de les ajuster à l'écoute. L'annulation restaure la dernière application tant que les phrases concernées n'ont pas été modifiées entre-temps.

Avec l'aide IA activée, décrire une idée visuelle puis demander des variantes à LM Studio. Cette demande manuelle utilise `POST /api/ai/animation`, la file d'inférence et le cache serveur ; elle ne fait pas un appel par occurrence et ne passe pas par le filtre automatique Laya. Le modèle reçoit le mot, l'idée et la phrase courante (500 caractères maximum), pas l'audio ni la chanson complète.

Les variantes sont des profils JSON contrôlés, jamais du JavaScript ou du CSS libre : 2 à 6 étapes, durée de 0,4 à 3 secondes, déplacements, rotation, échelle, opacité et lueur bornés, début et fin au repos. Les profils invalides sont rejetés. Le mouvement suit l'horloge de lecture et respecte la préférence système de réduction des animations.

Seuls les profils acceptés sont enregistrés dans `animationProfiles` et leurs associations dans `animationSignatures`, avec les phrases du JSON exporté. Les propositions non appliquées restent hors du morceau. Les profils acceptés sont réutilisables dans la galerie ; les nouvelles occurrences ajoutées ultérieurement ne sont pas animées automatiquement. Sauvegarder avant de rafraîchir la page. Redémarrer l'API avec le choix **1** du lanceur pour activer le nouvel endpoint. Le bundle du récepteur a été recompilé ; un récepteur Home Assistant déjà installé nécessite son déploiement habituel pour lire ces nouveaux profils.

Vérifications : tests de validation, accents et répétitions, conservation des annotations imbriquées, conflits, placements, export/import et cache ; parcours navigateur séparé pour prévisualisation, application multiple, annulation, clavier et export/rechargement. La génération a également été essayée avec le vrai modèle LM Studio ; le parcours navigateur des variantes utilise une réponse contrôlée pour être reproductible.

Le grand panneau « Suivi IA » remplace le panneau d'édition pendant la consultation du suivi. « Retour à l'éditeur » et « Voir le suivi IA » basculent sans interrompre les analyses. Cliquer sur une phrase ou son badge revient à l'édition. Le flux serveur affiche les étapes réelles : cache, attente, chargement Laya, sélection, génération LM Studio, validation et fin. Il ne diffuse pas de raisonnement interne. Les anciens clients JSON restent compatibles. Redémarrer une fois l'API après cette mise à jour pour activer le flux d'événements.

Laya présélectionne les phrases intéressantes avant tout appel à LM Studio. Une phrase écartée n'est jamais envoyée à LM Studio ; si Laya est indisponible, seuls les contrôles locaux restent disponibles. LM Studio enrichit les phrases retenues, sans recevoir la chanson complète. La sélection est expérimentale, pas un quota garanti : la réduction des tokens dépend du nombre de phrases retenues.

Lancer `npm run dev`, activer l’aide dans Paramètres → Paramètres expérimentaux, puis ouvrir des paroles synchronisées dans l’éditeur. L’analyse démarre après une seconde et progresse phrase par phrase. Cliquer sur un badge IA pour afficher ses suggestions. « Appliquer » modifie le morceau ; « Ignorer » masque la proposition pendant la session. L’annulation est disponible tant que la phrase appliquée n’a pas été modifiée à nouveau.

LM Studio doit servir `google/gemma-4-e4b` sur `http://127.0.0.1:1234/v1`. La bibliothèque Laya est une dépendance locale (`../laya`) ; son bundle doit être présent dans `../laya/.laya-cache/receptron--laya-onnx/main`. Aucun poids n’est téléchargé automatiquement.

Variables serveur optionnelles dans `.env` :

```
LM_STUDIO_URL=http://127.0.0.1:1234/v1
LM_STUDIO_MODEL=google/gemma-4-e4b
LAYA_MODEL_DIR=D:/dev/laya/.laya-cache/receptron--laya-onnx/main
AI_CACHE_DIR=D:/dev/karaoke-react/.ai-cache
AI_QCM_EVERY=4
```

Redémarrer le serveur API après installation ou modification de configuration. `GET /api/ai/status` indique l’état des moteurs. Laya se charge au premier appel d’analyse et reste en mémoire. Les appels sont sérialisés pour limiter la consommation mémoire. Une analyse peut prendre plusieurs secondes, notamment au premier chargement.

Les nouveaux QCM sont limités à une phrase admissible sur quatre par défaut (positions 1, 5, 9, etc.), sans obligation d'en proposer : Laya doit aussi retenir la phrase. Ce plafond expérimental est configurable côté serveur avec `AI_QCM_EVERY` (2 à 20). Les phrases comportant déjà un mot caché ne reçoivent pas de nouveau QCM ; les problèmes de ces QCM restent signalés dans « À vérifier ». La limite s'applique aussi aux réponses LM Studio hors consigne et au mode partiel. Les autres catégories restent disponibles. Changer cette politique invalide le cache des anciennes propositions, sans supprimer les modifications acceptées.

Les placements « À caler » sont estimés à partir de la position dans la phrase. Ils doivent être vérifiés à l’écoute. Les timings par mot sont utilisés uniquement si les mots et les horaires correspondent à la phrase. L’IA ne reçoit pas l’audio. Les propositions restent hors du projet exporté ; seuls les changements acceptés sont exportés. Si LM Studio échoue, les propositions de Laya restent disponibles. Si Laya échoue, aucun appel d'inférence LM Studio n'est effectué ; les contrôles locaux restent disponibles avec un avertissement et « Réessayer ».

Les analyses terminées sont conservées côté serveur dans `.ai-cache/suggestions.json`, pendant sept jours et pour les mille dernières analyses au maximum. Recharger le même morceau après un rafraîchissement ou un redémarrage du serveur retrouve les résultats sans relancer les moteurs. Une phrase, ses voisins, ses repères ou ses annotations modifiés produisent une nouvelle analyse. « Réessayer » force une nouvelle analyse des résultats en échec ou partiels. Ce cache ne sauvegarde ni le fichier audio ni les modifications non exportées du projet.
