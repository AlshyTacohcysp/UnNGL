# Architecture

Environ 8 700 lignes de TypeScript, un processus, un fichier SQLite, et une
liste de dépendances assez courte pour être lue d'un trait. Cette page explique
comment tout s'assemble et, là où il y avait un choix, pourquoi ce choix-là.

## La forme du système

```
                    navigateur
                       │
    ┌──────────────────┴───────────────────┐
    │  /[slug]        composeur, anonyme   │
    │  /i/[slug]      boîte du propriétaire│
    │  /h/[token]     lien de réclamation  │
    │  /algorithm     spec + bac à sable   │
    │  /api/*         12 gestionnaires     │
    └──────────────────┬───────────────────┘
                       │
        ┌──────────────┴───────────────┐
        │                              │
   extract.ts                    extract.ts  ← littéralement le même
   (navigateur, canvas)         (serveur, png.ts)
        │                              │
        │  six valeurs hex           six valeurs hex
        └──────────┬───────────────────┘
                   │
              égalité ?  →  indice vérifié
                   │
              node:sqlite  (un fichier, WAL)
```

Le fait structurel le plus important : **`src/lib/palette/extract.ts` est importé
à la fois par le navigateur et par le serveur.** Le navigateur de l'expéditeur
calcule six couleurs depuis sa photo et les revendique. Le serveur décode ensuite
le *fichier original* et exécute la même fonction. Si les deux concordent,
l'indice est marqué vérifié ; sinon, le lecteur est prévenu. Le modèle de
confiance ne dépend pas de l'honnêteté de l'expéditeur, car sa revendication
n'est jamais prise pour argent comptant.

## Les dépendances

Dépendances de runtime, en totalité :

| Paquet | Pourquoi |
|---|---|
| `next` | le framework |
| `react`, `react-dom` | le framework |
| `zod` | chaque corps de requête est validé par un schéma |

Tout le reste est soit dans Node 22, soit écrit ici.

C'est une position délibérée, pas un accident de calendrier. Les pièces les plus
probables d'être attaquées sont précisément celles qu'un paquet couvrirait
d'habitude — décodage d'images, requêtes HTTP, SMTP, hachage, PNG — et chacune
tient dans un volume de code assez court pour être relu. La surface d'attaque de
l'arbre de dépendances est nulle par construction.

| Normalement un paquet | Ici | Lignes |
|---|---|---|
| Décodage PNG (`sharp`, `pngjs`) | `lib/palette/png.ts` | ~230 |
| Client HTTP (`node-fetch`) | `fetch` (intégré) | 0 |
| SMTP (`nodemailer`) | `lib/mail.ts` | ~300 |
| Hachage de mots de passe (`bcrypt`, `argon2`) | `lib/crypto.ts` (empreintes HMAC) | ~60 |
| Framework CSS | Tailwind v4 + ~700 lignes de CSS | — |
| Polices | paquets Fontsource, embarqués | — |
| Pilote de base (`better-sqlite3`) | `node:sqlite` (intégré) | 0 |
| Bibliothèque de dates | `Date` | 0 |

## Modèle de données

Onze tables. Les définitions complètes sont dans `src/lib/db.ts`, appliquées
comme des migrations numérotées et idempotentes à l'ouverture — il n'y a donc
aucune étape de migration séparée et rien à lancer à la main.

| Table | Contenu | Colonnes notables |
|---|---|---|
| `users` | une ligne par identité vérifiée par e-mail | `email`, `email_verified_at`, `display_name`, `avatar_palette` |
| `oauth_accounts` | le côté OAuth | `(provider, provider_user_id)`, `user_id` |
| `sessions` | une ligne par session active | `id` = **empreinte HMAC** du cookie, `expires_at` |
| `login_tokens` | codes e-mail à 6 chiffres | `code_hash`, `purpose`, `attempts`, `expires_at` |
| `inboxes` | le composeur public | `slug`, `owner_id`, `title`, `last_message_at` |
| `messages` | une ligne par message anonyme | `body`, `sender_ip` (haché), `seen_at`, `hint_id`, `claim_hash` |
| `hints` | la palette et sa preuve | `palette`, `primary_hex`, `weight`, `hash`, `algorithm`, `verified`, `image_id` |
| `images` | photos source des indices, en BLOB | `bytes`, `mime`, `bytes_len`, `delete_after` |
| `rate_limits` | compteurs | `key`, `window_start`, `count` |
| `meta`, `schema_migrations` | comptabilité | |

Le jeton de réclamation n'a pas sa propre table : c'est
`messages.claim_hash`, une empreinte HMAC du jeton contenu dans `/h/[token]`,
résolu par recherche. Une table de moins, une jointure de moins.

### Pourquoi des empreintes partout

Aucune table ne stocke un secret sous forme récupérable. Les identifiants de
session, les codes de connexion, les jetons de réclamation et l'état OAuth sont
stockés en `HMAC-SHA256(secret, valeur)`. Le texte en clair n'existe qu'une fois,
en mémoire, pendant la durée de la requête.

`messages.sender_ip` est une **HMAC tronquée de l'IP de l'expéditeur**, jamais
l'IP elle-même. Le propriétaire ne peut pas se voir montrer l'adresse même s'il
le demande, mais il peut encore reconnaître un expéditeur récurrent.

Le coût en performance est un hachage par recherche : rien.

## La chaîne de traitement de la palette

Trois étapes, séparables à dessein.

### 1. `extract.ts` — l'algorithme

Pur, déterministe, sans DOM ni E/S. Prend des octets RGBA et des dimensions,
renvoie six couleurs hexadécimales. Documenté ligne à ligne dans
[la page de l'algorithme](algorithme.md), et verrouillé par un test d'empreinte
de référence afin qu'une refactorisation qui changerait la sortie échoue dans
l'intégration continue.

### 2. `png.ts` — le décodeur côté serveur

Lorsqu'un indice est téléversé, le serveur a besoin de pixels pour vérifier la
revendication. `png.ts` décode le PNG sans aucune dépendance et impose des bornes
dures sur tout :

- côté le plus long ≤ 1024
- nombre total de pixels ≤ 1024 × 1024
- longueur de sortie déclarée ≤ 8 Mo

Ce sont ces trois bornes qui tuent les bombes de décompression. Vérifié sur de
vraies charges utiles :

| Charge utile | Sur disque | Résultat |
|---|---|---|
| PNG annonçant 3,6 gigapixels | 69 o | refusée en 1 ms, `image is larger than 1024px on its longest side` |
| 8 Mo de pixels derrière un en-tête 8×8 | 8,2 ko | refusée en 1 ms, `Cannot create a Buffer larger than 264 bytes` |
| Une photo honnête de 64×64 | 594 o | acceptée, 64×64, six couleurs en 25 ms |

La croissance du tas pour les deux bombes est de quelques mégaoctets seulement —
dont l'essentiel vient du chargement de modules de tsx. Aucune n'atteint le stade
de l'allocation de ce qu'elle annonce.

### 3. `hints.ts` — créer, vérifier, expirer

Recalcule la palette depuis le fichier stocké, la compare à la revendication, et
marque l'indice `verified` ou `unverified`. Le fichier d'origine obtient une
ligne qui le pointe et une date de suppression ; le balayage lancé depuis
`storeImage` retire tout ce qui dépasse `HINT_IMAGE_RETENTION_DAYS` avec sa
ligne. Les couleurs survivent dans le message ; le visage, non.

## Requêtes et réponses

`src/lib/http.ts` est le point de passage obligé, et presque toutes les routes y
passent.

- **`requireSameOrigin()`** — une seule fonction, appelée par chaque route
  mutante. Elle compare l'en-tête `Origin` à `NEXT_PUBLIC_ORIGIN` et refuse les
  requêtes cross-origin en 403. Elle est centralisée précisément pour qu'une
  nouvelle route ne puisse pas l'oublier. (L'absence d'en-tête `Origin` est
  autorisée, car les clients non-navigateur — curl, les liens e-mail, certains
  robots — n'en envoient pas, et les refuser casserait le produit sans ajouter la
  moindre sécurité.)
- **`clientIp()`** — renvoie une IP uniquement lorsque l'application est
  réellement derrière un proxy de confiance (`TRUSTED_PROXY=1`). Sinon, renvoie
  une constante. Le raisonnement est dans [sécurité](securite.md#le-rate-limiting-échoue-fermé).
- **`json()`, `fail()`** — formes uniformes, et des messages d'erreur qui
  disent ce qui n'allait pas sans dire si un enregistrement existe.

## Front end

Composants serveur par défaut ; composants client uniquement là où il y a de
l'interaction : le composeur, le sélecteur d'indice, le formulaire de
connexion, le formulaire de réglages et le bac à sable de l'algorithme. Aucune
bibliothèque d'état, aucune bibliothèque de récupération de données — les
formulaires postent vers les gestionnaires de routes et le routeur se recharge.

`extract.ts` s'exécute dans le navigateur sur un `canvas`, donc l'expéditeur voit
ses six couleurs à l'instant où il dépose une photo, avant tout envoi. C'est une
décision de latence qui se trouve être aussi une décision de vie privée.

## Authentification

Un seul mécanisme de session, deux entrées.

- **E-mail** : demander un code à 6 chiffres → stocké sous forme d'empreinte HMAC
  avec expiration à 10 minutes et compteur de tentatives → vérifier → émettre une
  session. Aucun mot de passe n'existe dans le code, donc aucune base de mots de
  passe à percer, aucun flux de réinitialisation à exploiter, aucune surface au
  credential stuffing.
- **OAuth** : `lib/oauth.ts` est un client 2.0 générique accompagné d'une table
  de fournisseurs. Il gère la redirection d'autorisation, l'état, l'échange de
  jeton et la résolution de l'identité. Les jetons fournisseurs sont **jetés
  immédiatement** après résolution de l'identité — l'application conserve un
  e-mail et un avatar, jamais un jeton tiers.

La correspondance se fait sur l'e-mail **vérifié**, et uniquement pour les
fournisseurs qui en fournissent un. Une adresse non vérifiée ne peut pas être
rattachée à un compte existant, sinon n'importe qui pourrait revendiquer
l'identité d'autrement en enregistrant une adresse sosie chez un fournisseur
permissif.

## Limitation de débit

`lib/ratelimit.ts` est une table de compteurs SQLite : nom de compartiment, début
de fenêtre, compteur. Les compartiments sont par IP et par boîte de réception,
toutes deux sur une base horaire. Elle fonctionne au travers des redémarrages et
des instances partageant la base, ce qu'une limitation purement en mémoire ne
fait pas.

Elle **échoue fermé** : sans `TRUSTED_PROXY`, l'application ne peut pas identifier
ses clients, donc chaque requête partage un compartiment au lieu de prétendre
pouvoir limiter par IP. Une limitation qu'on traverse en réglant un en-tête est
pire que pas de limitation du tout, parce qu'on y croit.

## Configuration et audit au démarrage

`lib/config.ts` analyse l'environnement une seule fois, avec des valeurs par
défaut sûres et des opts-in explicitement non sûrs. `lib/startup-check.ts` relit
ensuite cette configuration et affiche un avertissement pour tout ce qui
affaiblirait l'instance : un secret trop court, une origine non-HTTPS, un
courrier encore dirigé vers le journal, le détail du health activé, HSTS sans
HTTPS.

Ce sont des conseils, pas des verrous. Bloquer le démarrage sur une odeur de
configuration rendrait le produit plus difficile à utiliser pour ceux qui
savent ce qu'ils font, et le code refuse déjà de démarrer quand
`SESSION_SECRET` manque, ce qui est le seul cas où continuer est réellement
dangereux.

## Système de design

`globals.css` est un système, pas une feuille de style :

- Deux familles typographiques, toutes deux embarquées via Fontsource (Google
  Fonts est injoignable depuis l'environnement de build, et embarquer est de
  toute façon préférable) : **Bricolage Grotesque** pour la structure,
  **Instrument Serif italique** pour la voix humaine, utilisée avec parcimonie
  et à dessein.
- Ombres dures (4 px, zéro flou), contours à l'encre (2,5 px `#16130f`), grain de
  papier, et une inclinaison délibérée de 1 à 2° sur chaque carte.
- Aucun angle arrondi, nulle part.
- Le collage de palette est la composante signature : un grand morceau dominant
  plus cinq bandes déchirées, chacune étiquetée avec son hex.

`npm run assets` régénère le favicon et la carte Open Graph à partir des mêmes
six couleurs : l'identité et le produit sont le même objet.

## Tests

```bash
npm test        # 59 tests
npm run typecheck
```

- `tests/palette.test.ts` — 18 tests sur l'algorithme, dont une empreinte de
  référence (`26d88308`) qui fige la sortie pour une entrée donnée, plus les cas
  limites : niveaux de gris, entièrement transparent, monochrome, 1×1,
  non-carré.
- `tests/security.test.ts` — 41 tests couvrant le durcissement : enforcement
  same-origin, empreintes de jetons, nommage du cookie de session, robustesse du
  secret, bornes anti-bombes PNG, liste blanche SSRF, plafonds d'octets en
  réponse, et règles de divulgation du endpoint de santé.

## Ce qui n'est pas là, volontairement

- **Aucune analyse d'audience, au sens strict.** Ni plausible, ni GA, ni pixel.
  Rien qui surveille qui visite, y compris vous.
- **Aucune requête tierce à l'exécution.** La CSP ne contient aucune origine
  externe parce que l'application n'en fait aucune. Les polices sont
  embarquées, les images ne sont jamais liées à chaud, et rien n'est intégré.
- **Aucune bibliothèque de limitation de débit, d'authentification ou
  d'image.** Voir plus haut.
- **Pas de multi-tenants.** Un fichier SQLite, un seul écrivain. La mise à
  l'échelle horizontale est un fork.
