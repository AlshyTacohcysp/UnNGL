# Contribuer

UnNGL est sous AGPL-3.0-or-later. Les contributions sont bienvenues, et la barre
porte sur l'intention, pas sur la cérémonie : un changement devrait améliorer le
produit *ou* le rendre plus difficile à abuser, et il devrait venir avec une
raison.

## Mise en place

```bash
git clone https://github.com/AlshyTacohcysp/UnNGL
cd UnNGL
npm install
npm run dev
```

Node 22 ou plus récent est requis — le pilote PostgreSQL est le paquet `postgres`,
en JavaScript pur, donc aucun module natif à compiler. Si `npm install` tente de
lancer `node-gyp`, quelque chose cloche ; il ne le devrait pas.

```bash
npm test          # doit réussir
npm run typecheck # doit réussir
npm run build     # doit réussir
```

```bash
npm run test:pg   # la couche de données face à un vrai PostgreSQL
```

`npm test` vérifie le source ; `npm run test:pg` exécute le vrai pilote, la vraie
réécriture des `?` et le vrai DDL contre un vrai PostgreSQL (PGlite, servi par
le protocole réseau, dans le processus). C'est ce qui attrape une requête qui
compile, qui passe le typage, et qui n'est pas du SQL Postgres valide. Si vous
touchez `lib/db.ts`, le schéma ou quoi que ce soit qui parle à la base, lancez-le.

```bash
npm run db:serve &   # un vrai PostgreSQL dans ce processus
npm run dev &
npm run test:e2e     # tout le produit, en HTTP
```

`npm run test:e2e` pilote une instance en cours d'exécution comme le ferait un
navigateur : connexion, création de boîte, envoi d'une photo, relecture de
l'indice, réclamation, remplacement, renommage, déconnexion. C'est le seul
contrôle qui couvre tout le chemin de bout en bout, et celui qui aurait attrapé
la couche de données rendue asynchrone au mauvais endroit.

Les trois sont attendus avant d'ouvrir une pull request.

## Ce qui est utile

**Dans l'ordre approximatif d'utilité :**

1. **Les traductions.** L'interface est aujourd'hui uniquement en anglais. Une
   traduction française est déjà documentée ; d'autres langues seraient
   réellement précieuses.
2. **Des fournisseurs OAuth.** `src/lib/oauth.ts` est une table plus un peu de
   métadonnées par fournisseur. En ajouter un devrait coûter quelques lignes,
   pas un nouveau module.
3. **Un second format d'image sur la voie de vérification.** Pour l'instant le
   PNG uniquement, parce que c'est le seul format dont le chemin de décodage est
   entièrement spécifié, vérifiable par bornes, et réalisable sans dépendance. Le
   JPEG serait l'étape suivante logique, et exigerait le même soin : bornes avant
   allocation, aucune décompression non bornée, aucune confiance accordée à
   `Content-Length`.
4. **L'accessibilité.** Un vrai chantier : parcours au clavier dans le composeur,
   gestion du focus dans la boîte de réception, `prefers-reduced-motion` partout,
   et vérification des contrastes sur le collage de palette. Le design est
   volontairement bruyant ; il n'a pas besoin d'être inaccessible.
5. **Des points d'accroche de modération.** L'application n'a aujourd'hui aucun
   signalement d'abus, et c'est une vraie lacune pour un déploiement public. Un
   circuit de signalement documenté et auto-hébergeable aiderait.
6. **Des bugs et des failles.** Voir
   [sécurité](securite.md#signaler-une-vulnérabilité).

## Ce qui sera probablement refusé

- **Un paywall, un niveau premium, ou le moindre bouton d'achat.** Ce n'est pas
  une divergence de goût : c'est la prémisse entière du projet. Un indice qui
  coûte de l'argent est précisément ce que ce projet existe pour remplacer.
- **De l'analyse d'audience, quelle qu'elle soit.** Ni agrégée, ni auto-hébergée.
  La promesse de vie privée porte le produit, et un script qui surveille les
  visiteurs serait une régression dans le seul sens qui compte ici.
- **Une nouvelle dépendance de runtime**, pour simplifier. Voir
  [architecture](architecture.md#les-dépendances) pour le raisonnement. Si vous
  en avez réellement besoin, ouvrez d'abord une issue et défendez le cas.
- **Une modification de l'algorithme de palette qui change la sortie**, sans
  changement de version et sans discussion. L'algorithme est une spécification
  publiée et un test d'empreinte de référence le protège. Le modifier en silence
  invaliderait tous les indices déjà existants.
- **Retirer un contrôle de sécurité** sans une très bonne raison et un test
  prouvant que la raison tient toujours.

## Style

Il n'y a pas de configuration de linter, et le code est écrit dans un style
plutôt simple. Suivez le fichier que vous modifiez.

- **Les commentaires expliquent *pourquoi*, pas *quoi*.** La base de code
  comporte des commentaires là où une décision n'est pas évidente — pourquoi la
  limitation échoue fermé, pourquoi le décodeur PNG plafonne la décompression,
  pourquoi l'initialisation est par point le plus éloigné. Elle n'a pas de
  commentaires qui paraphrasent le code.
- **Pas de code astucieux.** Ces fichiers sont lus par des personnes qui
  auditent une application de messages anonymes dans l'urgence. La clarté l'emporte
  sur la compacité.
- **Toute route passe par `route()`** dans `src/lib/http.ts`. C'est ce qui rend le
  contrôle same-origin impossible à contourner par un futur contributeur.
- **Chaque corps de requête obtient un schéma `zod`** dans
  `src/lib/validation.ts`.
- **Les secrets sont stockés sous forme d'empreintes HMAC**, jamais en clair.
  Si vous ajoutez un jeton, suivez le modèle de `src/lib/crypto.ts`.

## Tests

Deux fichiers, et ils diffèrent par nature :

- `tests/palette.test.ts` fige la sortie de l'algorithme, avec une empreinte de
  référence qui échoue en cas de modification non intentionnelle. Si votre
  changement modifie la sortie, c'est un acte délibéré, pas un accident.
- `tests/security.test.ts` est une suite de régression. Chaque test correspond à
  un vrai défaut ou à une vraie attaque, et il est écrit pour échouer bruyamment
  si la protection est retirée. **Ajouter un test ici est l'une des
  contributions les plus précieuses que vous puissiez faire** — trouvez une
  faiblesse, corrigez-la, et laissez le test derrière vous.

## Pull requests

1. Partir de `main`.
2. Vérifier que `npm test && npm run typecheck && npm run build` réussissent.
3. Expliquez ce qui change et pourquoi. Si cela ferme un ticket, dites-le.
4. Si cela touche l'algorithme, le schéma de la base, ou quoi que ce soit de lié à
   la sécurité, dites-le explicitement — ces changements sont examinés avec plus
   d'attention.

## Licence

Les contributions sont acceptées sous **AGPL-3.0-or-later**, les mêmes termes
sous lesquels le projet est distribué. Si vous contribuez au nom d'un
employeur, vérifiez que cela est permis.

Le copyleft est délibéré et n'est pas un accident de licence. Une version
hébergée de cette application a le devoir d'en proposer le code source
correspondant à ses utilisateurs. C'est une fonctionnalité : cela signifie que
personne ne peut reprendre ce projet pour en faire un produit fermé avec paywall.
