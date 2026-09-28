# Sécurité

UnNGL est une application de messages anonymes. C'est une forme hostile par
défaut : des inconnus vous écrivent, ils téléversent des octets arbitraires,
ils n'ont pas de compte, et votre lien est public. Cette page est un compte
rendu honnête de ce qui a été fait face à cela — ce qui est appliqué, ce qui n'est
que supposé, et ce qui vous revient.

Lisez le [modèle de menace](#modèle-de-menace) avant les [contrôles](#contrôles),
et les [responsabilités de l'exploitant](#ce-qui-vous-revient) avant de
déployer.

---

## État des lieux

| | |
|---|---|
| `npm audit` (production) | **0 vulnérabilité** |
| `npm audit` (y compris le développement) | **0 vulnérabilité** |
| Suite de tests | **99 réussis** (18 algorithme, 56 régression sécurité, 25 handles) |
| TypeScript | propre, `strict` |
| En-têtes de sécurité | CSP, HSTS (optionnel), `X-Frame-Options`, COOP, CORP, `nosniff`, `Referrer-Policy`, `Permissions-Policy` |
| Dépendances de runtime | 8 — `next`, `react`, `react-dom`, `zod`, `nanoid`, `postgres`, et deux paquets Fontsource |

Il n'y a pas d'audit de sécurité externe. Ceci est un auto-audit par les gens qui
ont écrit le code, ce qui vaut moins qu'un audit indépendant — et c'est dit ici
pour que personne n'ait à le deviner.

## Signaler une vulnérabilité

Ouvrez un rapport de faille de sécurité GitHub sur le dépôt. Merci de ne pas
ouvrir de ticket public pour quoi de soit exploitable. Donnez aux mainteneurs un
délai raisonnable avant la publication, et vous serez crédité.

---

## Modèle de menace

### Ce que nous défendons

| Actif | Pourquoi c'est important |
|---|---|
| **Cookies de session** | Prise de contrôle totale du compte : la boîte, le profil, tous les messages. |
| **Codes de connexion** | Prise de contrôle de compte, et voie de récupération des utilisateurs OAuth seuls. |
| **Jetons de réclamation** | Seul identifiant dont dispose un expéditeur. Le divulguer expose le message et permet d'en réécrire l'indice. |
| **Corps des messages** | Écrits par des inconnus, lus par leur destinataire. Non chiffrés au repos. |
| **Photos source des indices** | Des visages. Supprimées par minuterie précisément parce que c'est ce que l'application a de plus sensible. |
| **Disponibilité du service** | Un processus sans état, une base partagée. Un plantage est une panne jusqu'au redémarrage ; un mauvais déploiement est une panne pour tout le monde. |
| **L'instance elle-même** | Un SSRF vers l'hôte, un saut via le proxy vers le réseau privé, ou l'endpoint de métadonnées du cloud. |

### Ce que nous ne défendons pas

- **L'analyse du trafic.** Nous ne pouvons pas vous dire qui vous a écrit au-delà
  d'une HMAC tronquée de son IP, conservée pour reconnaître un expéditeur
  récurrent. Nous n'essayons pas.
- **Une boîte hostile.** Si quelqu'un vous envoie quelque chose d'horrible et que
  vous voulez que ce disparaisse, le bouton de suppression le supprime.
  L'application n'est pas un système de modération et ne prétend pas l'être.
- **Le caractère secret de l'algorithme.** Il ne l'est pas, et il ne doit pas
  l'être. L'hypothèse de conception est que vous le réimplémenterez et nous
  contrôlerez.
- **Un attaquant déterminé avec un exploit navigateur.** La CSP n'est pas une
  défense contre un bogue du navigateur.

### Frontières de confiance

```
  expéditeur anonyme  ──non fiable──▶  gestionnaire de routes Next.js  ──▶  PostgreSQL (poolé)
        │                                     │
        │ téléverse des octets               │ résout la session
        ▼                                     ▼
  png.ts (bornes vérifiées)          auth.ts (empreinte HMAC)
  media.ts (liste blanche d'hôtes)
```

L'expéditeur n'est pas fiable dans **les deux** sens : son texte et sa palette
revendiquée. Sa palette revendiquée n'est jamais prise pour argent comptant — le
serveur la recalcule à partir des octets qu'il a reçus.

---

## Contrôles

### 1. Cookies de session

| | Développement | Production |
|---|---|---|
| Nom | `unngl_session` | `__Host-unngl_session` |
| `HttpOnly` | oui | oui |
| `Secure` | non | **oui** |
| `SameSite` | `Lax` | `Lax` |
| `Path` | `/` | `/` |
| `Domain` | hôte seul | hôte seul (exigé par `__Host-`) |

Le préfixe `__Host-` est un contrat appliqué par le navigateur : un cookie qui le
porte est **rejeté par le navigateur** sauf s'il est `Secure`, s'il a
`Path=/` et s'il n'a pas d'attribut `Domain`. Cela élimine les attaques de
fixation par sous-domaine et de cookie shadowing sans aucune défense côté
serveur — et c'est pourquoi l'application semble cassée quand vous la lancez en
mode production sur du HTTP simple : le cookie n'est pas envoyé, exprès.

Les jetons de session font 32 octets de `crypto.randomBytes` en base64 sûr pour
URL — 256 bits. La base de données stocke
`HMAC-SHA256(SESSION_SECRET, jeton)`, **jamais le jeton** : un vidage de la base
ne fournit donc aucune session exploitable. La recherche se fait par empreinte ;
la comparaison est en temps constant.

L'expiration est `SESSION_DAYS` (30 par défaut). Les lignes expirées sont
supprimées à la consultation, elles ne peuvent donc pas s'accumuler. La
déconnexion supprime la ligne et efface le cookie avec le même nom, le même
`Path` et les mêmes drapeaux que ceux du dépôt — le décalage qui ferait échouer
silencieusement la déconnexion est exactement le type de bogue que cela
attrape.

### 2. Codes de connexion

- 6 chiffres issus de `crypto.randomInt`, pas `Math.random`. Un test de
  distribution de la suite vérifie l'uniformité du premier chiffre.
- Stockés uniquement sous forme d'empreinte HMAC, avec `attempts`, `created_at` et
  `expires_at`.
- Expiration à 10 minutes, à usage unique — une vérification réussie supprime la
  ligne.
- Chaque erreur incrémente `attempts` ; au-delà, le code est mort.
- Limités en débit par adresse et par IP, avant et après la vérification.
- **Jamais renvoyés dans une réponse d'API en production.** La réponse est
  toujours `{"ok":true,"sent":true,"expiresInSeconds":600}`, dans tous les
  environnements.

### 3. Le drapeau dev-code — celui qu'il ne faut jamais activer

`EXPOSE_DEV_CODES=1` fait renvoyer le code de connexion par l'API, pour qu'un
formulaire de connexion local puisse le remplir. Il n'est honoré **que** si
`NODE_ENV !== production` **et** `MAIL_TRANSPORT=console` **et** que le secret
conserve encore sa valeur de développement par défaut. Les trois, ou rien. L'audit
au démarrage affiche un avertissement rouge s'il était activé en production.

C'est le drapeau le plus dangereux du fichier, parce qu'il transforme la
connexion par e-mail en « demandez le code au serveur ». Considérez-le comme une
prise de contrôle de compte.

### 4. CSRF — contrôle same-origin centralisé

`route()` enveloppe **tous** les gestionnaires. Toute méthode autre que `GET`,
`HEAD` ou `OPTIONS` doit voir l'hôte de son `Origin` correspondre à l'en-tête
`Host` de la requête, ou bien reçoit `403 {"ok":false,"error":"Cross-origin
request refused."}`. L'hôte est comparé à la requête elle-même plutôt qu'à une
constante configurée — c'est ce que signifie « same origin » pour la plateforme
web, et cela continue de fonctionner derrière un proxy ou sur un nom de domaine
personnalisé qui n'a jamais figuré dans le `.env`.

Le schéma est vérifié séparément et de façon plus stricte : quand l'instance
est configurée pour HTTPS, une origine `http` est refusée même si l'hôte
correspond, si bien que `http://unngl.example` ne peut jamais autoriser quoi que
ce soit sur une instance https. Un navigateur sur une page https n'envoie jamais
une origine `http` : cela ne coûte donc rien de légitime.

Le centralisation est l'essentiel. Un contrôle par route est un contrôle que
quelqu'un oublie sur la route qu'il ajoute à 2h du matin. Il n'y a qu'un seul
endroit où se tromper, et il est testé.

Les requêtes **sans** en-tête `Origin` sont autorisées. Les navigateurs en
envoient toujours un sur les requêtes cross-origin modifiant l'état : on ne perd
donc rien contre le CSRF, et les refuser casserait curl, les liens des e-mails de
connexion et certains robots.

Vérifié en conditions réelles :

```
POST /api/messages   Origin: https://evil.example        -> 403
POST /api/messages   Origin: https://unngl.example       -> 201
POST /api/messages   (aucun en-tête Origin)              -> 201
```

`SameSite=Lax` sur le cookie de session constitue la deuxième couche, et
`form-action 'self'` dans la CSP la troisième.

### 5. Redirection ouverte

`?next=` après la connexion passe par `safeRedirectPath()`, qui n'accepte que les
chemins commençant par un unique `/` et non relatifs au protocole (`//evil.com`).
Tout le reste retombe sur `/inbox`. Testé.

### 6. Limitation de débit — échoue fermé

`ratelimit.ts` est une table de compteurs : compartiment, début de fenêtre,
compteur. Les compartiments sont par boîte (10 envois/heure) et par IP
(30/heure), plus des compartiments distincts pour les demandes de code, les
vérifications de code, la création de boîtes et les récupérations de médias.

Le compartiment `handle` existe parce que la disponibilité d'un handle est un
oracle d'énumération : sans limitation, n'importe qui de connecté pourrait
parcourir l'espace de noms et apprendre quels noms d'autres personnes
occupent. Vérifier un nom coûte 120/heure par utilisateur et 200/heure par IP ;
réclamer ou renommer réellement un nom coûte 10/heure par utilisateur et
30/heure par IP, en plus du compartiment `create` qui protège déjà la création
de boîtes.

Le compteur est incrémenté et relu en **une seule** instruction — un `upsert` avec
`RETURNING` — et le compteur de tentatives d'un code de connexion est réclamé de
la même façon par un `UPDATE … RETURNING`. Ce n'est pas une micro-optimisation.
La limitation a été écrite quand la base était un unique fichier SQLite, où une
lecture suivie d'une écriture ne pouvait pas s'entrelacer avec quoi que ce soit.
Un pool de connexions supprime cette garantie : une douzaine de tentatives de
connexion simultanées liraient chacune `count = 0`, chacune se croirait la
première, et chacune serait acceptée — la limite de cinq essais devant un code à
six chiffres serait donc de cinq essais *par rafale* plutôt que cinq essais en
tout. `tests/security.test.ts` vérifie que les deux sont des instructions uniques,
et `npm run test:pg` lance huit tentatives concurrentes sur un vrai PostgreSQL et
contrôle que exactement cinq sont acceptées.

L'essentiel est ce qui se passe quand l'application **ne peut pas** identifier
ses clients :

> Sans `TRUSTED_PROXY`, `clientIp()` renvoie une constante. Chaque requête
> partage un compartiment.

Cela ressemble à un produit moins bon, et c'est délibéré. Si l'application est
directement accessible et fait confiance à `X-Forwarded-For`, un attaquant met un
en-tête aléatoire par requête et toutes les limites par IP deviennent dénuées de
sens — une limitation qu'on traverse est pire que pas de limitation, car on y
croit.

N'activez `TRUSTED_PROXY=1` **que** si un proxy que vous contrôlez constitue
l'unique voie d'accès. L'audit au démarrage affiche une note lorsque vous le
faites.

Vérifié en conditions réelles : 40 requêtes avec des valeurs `X-Forwarded-For`
falsifiées distinctes ont toutes atterri dans un seul compartiment, et la limite
a tenu.

### 7. Décodage d'images — épuisement de ressources

La voie de vérification doit décoder des octets fournis par un attaquant : c'est
le point le plus risqué de l'application. `src/lib/palette/png.ts` est écrit pour
cela spécifiquement :

- Côté le plus long ≤ `MAX_EDGE` (1024), vérifié sur l'IHDR **avant** la moindre
  allocation.
- Nombre total de pixels ≤ `MAX_PIXELS` (1024 × 1024), ce qui intercepte un
  1×1 048 576 d'apparence légale.
- La décompression est plafonnée à la longueur que l'IHDR déclare lui-même : un
  flux zlib qui dépasse la taille propre à l'image est refusé en cours de route.
- Les PNG entrelacés sont refusés plutôt que mal décodés.
- Les types de couleur et les filtres de ligne inconnus sont refusés.
- Taille de téléversement plafonnée à 2 Mo avant même d'atteindre le décodeur.

Mesuré sur de vraies charges utiles, via le chemin de code de production :

| Charge utile | Sur disque | Résultat |
|---|---|---|
| Annonce 3,6 gigapixels | 69 o | refusée en 1 ms — `image is larger than 1024px on its longest side` |
| 8 Mo de pixels derrière un en-tête 8×8 | 8,2 ko | refusée en 1 ms — `Cannot create a Buffer larger than 264 bytes` |
| Image honnête de 64×64 | 594 o | acceptée, 64×64, six couleurs en 25 ms |

La croissance du tas pour les deux bombes est de quelques mégaoctets,
essentiellement le chargement de modules par tsx. Aucune n'atteint l'allocation.

### 8. SSRF — liste blanche fixe, et plafond en streaming

`/api/media/fetch` existe pour afficher une photo de profil depuis un CDN social
sans que le navigateur ne divulgue l'IP du visiteur. Cela en fait une primitive
SSRF par construction, donc :

- **Uniquement** `https:`, uniquement le port 443, et uniquement des hôtes d'une
  liste fixe de suffixes de CDN de médias sociaux.
- La correspondance se fait par étiquette contre la liste : `cdninstagram.com.evil.com`
  et `evilcdninstagram.com` sont tous deux refusés, tout comme `notcdninstagram.com`.
- Boucle locale, link-local (`169.254.0.0/16`, qui contient l'endpoint de
  métadonnées du cloud) et autres plages privées sont refusées.
- `file:`, `gopher:` et le HTTP simple sont refusés.
- Les identifiants dans l'URL (`https://cdninstagram.com@evil.com/`) sont refusés.
- Les redirections ne sont pas suivies aveuglément.
- Le corps de la réponse est **lu en streaming avec un plafond strict d'octets**,
  et le socket est détruit dès qu'il est dépassé. Un serveur qui ment sur son
  `Content-Length` puis streame indéfiniment ne peut pas saturer la mémoire.
- Le `Content-Type` doit être une image, revérifié en sortie.

Chacun de ces refus possède un test dans `tests/security.test.ts`.

### 9. Réponses et gestion d'erreurs

- Une exception non rattrapée dans une route renvoie un 500 générique avec
  `"Something went wrong on our side. Nothing you sent was lost."` — pas de
  trace d'appels, pas de SQL, pas de chemins de fichiers.
- Les messages d'erreur ne distinguent pas « boîte inexistante », « message
  inexistant » et « réclamation inexistante » lorsque cette distinction
  aiderait un attaquant à énumérer.
- `Cache-Control: no-store` sur les réponses de messages.
- Toutes les requêtes sont paramétrées. Il n'y a aucune interpolation de chaîne
  dans du SQL dans tout le code.

### 10. Injection

- Ni `eval`, ni `new Function`, ni `require` dynamique.
- Le seul `dangerouslySetInnerHTML` est un bloc **statique** JSON-LD sans donnée
  utilisateur interpolée.
- Chaque corps de requête est validé par un schéma `zod` ; les clés inconnues
  sont rejetées.
- Le rendu passe par l'échappement par défaut de React. Aucun
  `dangerouslySetInnerHTML` sur une chaîne fournie par un utilisateur.
- Les corps de messages sont rendus comme du texte, jamais comme du HTML.

### 11. En-têtes HTTP

Définis dans `next.config.mjs`, sur tous les chemins :

```http
Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none';
  script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:; font-src 'self'; connect-src 'self';
  media-src 'none'; worker-src 'self'; manifest-src 'self';
  form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()
X-DNS-Prefetch-Control: off
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload   ← uniquement avec ENABLE_HSTS=1
```

La CSP ne contient **aucune origine externe**, parce que l'application n'effectue
aucune requête tierce. Les polices sont embarquées via Fontsource, il n'y a aucun
script d'analyse, aucun CDN, et rien n'est intégré. `'unsafe-inline'` pour les
scripts et les styles est requis par le bootstrap de Next.js et par les
propriétés `style` de React ; c'est la dernière zone souple restante, et elle
n'est pas retirable sans casser le framework.

`Strict-Transport-Security` est **optionnel** (`ENABLE_HSTS=1`) à dessein.
L'activer sur une machine de préproduction en HTTP bannit les navigateurs
pendant deux ans. Activez-le une fois le domaine durablement en HTTPS.
### 12. Divulgation d'informations

`GET /api/health` renvoie, en production :

```json
{"ok":true,"status":"ok","time":"2026-09-28T14:22:19.665Z"}
```

Ni version, ni schéma, ni nombre d'utilisateurs, ni pile d'appels. Avec
`HEALTH_DETAIL=1`, il les ajoute ; le drapeau est désactivé par défaut en
production parce qu'un nombre d'utilisateurs et une version de schéma publics
constituent du renseignement.

Les réponses d'erreur ne divulguent ni trace d'appels ni SQL. Les réponses de
connexion ne révèlent pas si une adresse possède un compte.

### 13. Minimisation des données

- **Aucune analyse d'audience.** Pas une seule, pas même « respectueux de la vie
  privée ». Rien n'enregistre qui visite, vous compris.
- **Aucune adresse IP en clair.** `messages.sender_ip` vaut
  `HMAC-SHA256(IP_KEY, ip)` tronquée à 32 caractères hexadécimaux.
- **Aucun jeton tiers.** Les jetons OAuth d'accès et de rafraîchissement sont
  jetés immédiatement après la résolution de l'identité.
- **Les photos d'indice sont supprimées** `HINT_IMAGE_RETENTION_DAYS` (7) après
  l'extraction de la palette, avec la ligne qui les référence. La palette survit ;
  le visage, non.
- **Les avatars sont stockés comme palettes** — six valeurs hexadécimales. Le
  fichier téléversé est décodé, validé, puis abandonné.
- **La suppression de compte est en cascade** vers sessions, comptes OAuth,
  boîtes, messages, indices et images. Un handle est une colonne de la ligne de
  la boîte, et les handles retirés y sont rattachés eux aussi : un nom choisi
  disparaît donc avec le compte, au lieu d'être orphelin et récupérable par un
  inconnu.
- Rien n'est vendu, et aucun mécanisme ne le permettrait.

### 14. Secrets

`SESSION_SECRET` est le seul, et l'application **refuse de démarrer en production
sans lui**. `IP_KEY` en est dérivé.

`auditSecretStrength()` avertit en production s'il fait moins de 32 caractères.
L'audit est un conseil, pas un verrou — un exploitant peut avoir une raison, et le
contrôle au démarrage couvre déjà le cas où continuer est réellement dangereux.

### 15. Audit de configuration au démarrage

La plupart des affirmations « sécurisé par défaut » sont en réalité des
affirmations sur un déploiement que quelqu'un a réussi une fois.
`startup-check.ts` s'exécute à l'ouverture et annonce à voix haute :

- `MAIL_TRANSPORT=console` en production — les codes ne quittent jamais le
  journal
- `EXPOSE_DEV_CODES` défini en production
- `SESSION_SECRET` encore à sa valeur de développement, ou sous 32 caractères
- `NEXT_PUBLIC_ORIGIN` qui n'est pas en `https://`
- `SESSION_DAYS` supérieur à un an
- `TRUSTED_PROXY=1` (une note, pas un avertissement — c'est parfois correct)

Une mauvaise configuration est donc visible dans les journaux au moment du
déploiement, plutôt que découverte des mois plus tard.

---

## Chaîne d'approvisionnement

```
npm audit                -> 0 vulnérabilité
npm audit --omit=dev     -> 0 vulnérabilité
```

PostCSS est épinglé en **8.5.28** via une surcharge de paquet, au-delà de
l'avis de 8.5.23, et Vitest est en **5.0.2**, au-delà du sien. Next.js est
maintenu en **15.5.26 ou plus** — ne le rétrogradez pas.

Les dépendances de runtime sont `next`, `react`, `react-dom`, `zod`, `nanoid`,
`postgres`, et deux paquets Fontsource. Les pièces qui seraient normalement des
paquets — décodage PNG, SMTP, hachage, requêtes HTTP — sont écrites dans le
dépôt précisément pour que la surface d'attaque de l'arbre de dépendances soit
assez petite pour être auditée par lecture. Voir
[architecture](architecture.md#les-dépendances).

> **Auto-hébergeurs :** le pilote PostgreSQL est le paquet `postgres` en
> JavaScript pur, et non `pg` ou `better-sqlite3` : il n'y a aucun module natif à compiler et
> aucune étape `node-gyp` — ce qui signifie aussi aucun téléchargement d'en-têtes
> Node à l'installation.

## Tests

`tests/security.test.ts` contient 56 tests de régression. Chacun correspond soit
à un vrai défaut ayant existé, soit à une attaque que la conception doit refuser.
Ils sont écrits pour échouer bruyamment si la protection est un jour retirée :

- **Épuisement de ressources PNG** (9) — bombes de dimensions, plafonds de pixels
  avec des côtés individuellement légaux, bombes zip, dimensions nulles ou
  absurdes, flux tronqués, cas limites exactement à la limite et exactement une
  unité au-delà, et un contrôle positif pour que la suite ne puisse pas passer en
  refusant tout.
- **Liste blanche média** (16) — chaque CDN social qui doit être autorisé, et
  chaque confusion qui ne doit pas l'être : boucle locale, alias de boucle
  locale, link-local métadonnées, schémas `file` et `gopher`, HTTP simple,
  confusion de suffixe et de préfixe, userinfo, identifiants embarqués, ports non
  standard, hôtes sans rapport, et entrée malformée qui ne doit pas lever.
- **Sûreté des redirections** (3) — chemins internes acceptés ; URL absolues,
  URL relatives au protocole et chemins hors site refusés ; `null`/`undefined`
  retombent sur la valeur par défaut.
- **Génération de jetons** (2) — 256 bits en base64 sûr pour URL ; premier chiffre
  uniforme sur 20 000 codes.
- **Invariants de déploiement** (3) — la base ne peut jamais être créée dans `.next` (un rebuild supprimerait silencieusement tous les messages) ; le repli `next start` ne peut jamais être un `npx` nu qui télécharge une autre version majeure ; et un `SESSION_SECRET` manquant est refusé au démarrage, avec la commande pour le corriger.
- **Typage des rejets** (2) — chaque échec du décodeur est une `ImageError`, donc les routes répondent 400 avec une raison au lieu d'un 500 générique ; plus un contrôle positif pour que le typage ne puisse pas passer en refusant tout.
- **Entrées hostiles** (4) — octets qui ressemblent seulement à un PNG, tampons
  vides, signatures tronquées, images entrelacées, types de couleur et filtres
  inconnus.

Plus `tests/palette.test.ts` (18) pour l'algorithme, dont une empreinte de
référence (`26d88308`) qui fige la sortie pour une entrée donnée, et
`tests/handle.test.ts` (25), qui couvre les parties d'un handle qui touchent à
la sécurité plutôt que au cosmétique : qu'un nom ne puisse jamais masquer une
route que l'application possède, usurper le service ou sa messagerie, se lire
comme un domaine de premier niveau, ni cacher un nom réservé derrière des
points et des tirets ; qu'un point initial, un séparateur de chemin, du balisage,
un octet nul et tout ce qui n'est pas ASCII soient refusés d'emblée ; et que
l'indication affichée pendant la saisie ne révèle jamais si un nom est pris.

```bash
npm test
npm run typecheck
```

## Ce qui vous revient

UnNGL ne peut appliquer que ce qu'il voit. Ces points sont les vôtres :

- [ ] **`SESSION_SECRET` est aléatoire, ≥ 32 octets, hors de git.**
- [ ] **HTTPS, terminé devant.** Les cookies sont `Secure` en production ; il n'y
      a aucun repli en texte clair.
- [ ] **`TRUSTED_PROXY=1` uniquement derrière un proxy que vous contrôlez.**
      Sinon, laissez-le désactivé et acceptez le compartiment de limitation
      partagé.
- [ ] **`.env` en `chmod 600`, détenu par l'utilisateur du service.**
- [ ] **La base de données n'est pas accessible depuis Internet.** Sur Supabase,
      cela veut dire l'URL du pooler, pas la connexion directe. Elle contient des
      corps de messages, non chiffrés au repos.
- [ ] **`pg_dump` quotidien hors de la machine.** Voir
      [déploiement](deploiement.md#sauvegardes) — utilisez `pg_dump`, pas `cp`.
- [ ] **Sauvegardez `SESSION_SECRET`.** Le faire tourner déconnecte tout le monde
      et orpheline toutes les empreintes stockées.
- [ ] **Lisez l'audit au démarrage** après chaque déploiement.

## Limites honnêtes

- **Les corps de messages ne sont pas chiffrés au repos.** Ils sont lus par leur
  destinataire par conception, et les protéger exigerait une clé que
  l'exploitant détient. Quiconque a le fichier de base peut les lire.
- **Une boîte est publique.** Quiconque a le lien peut la lire. C'est le
  produit. Utilisez un lien que vous acceptez de partager.
- **La palette est un indice, pas une preuve.** Quelqu'un qui connaît vos
  couleurs peut joindre une photo qui les produit. La vérification prouve que les
  couleurs viennent *du fichier joint* ; elle ne peut pas prouver que ce fichier
  est une photo de l'expéditeur.
- **Le palier gratuit de Supabase se met en veille après sept jours
  d'inactivité**, et la première requête au réveil peut prendre une trentaine de
  secondes. C'est l'angle vif du déploiement à coût zéro, et le seul.
- **Il n'y a aucune chaîne de signalement d'abus.** Le texte des messages n'est
  pas filtré. Si vous exploitez une instance publique, vous finirez par avoir
  besoin de modération, et vous devriez le dire clairement sur votre propre
  déploiement.
- **Aucun audit indépendant.** Voir [État des lieux](#état-des-lieux).
- **Les limites de 2 Mo / 1024 px sont autant un choix de compatibilité qu'un
  choix de sécurité.** C'est ce qui rend tenable le décodeur sans dépendance.
