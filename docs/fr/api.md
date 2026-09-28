# Référence de l'API

Chaque route est un gestionnaire Next.js sous `src/app/api`. Il n'y a ni GraphQL,
ni versionnement, ni bibliothèque cliente — l'application est sa propre première
consommatrice.

## Conventions

**URL de base** : `NEXT_PUBLIC_ORIGIN` (par ex. `https://unngl.exemple.com`).

**Réponses JSON**, toujours sous cette forme :

```jsonc
{ "ok": true,  "...": "..." }            // succès
{ "ok": false, "error": "message humain" } // échec
```

Les messages d'erreur sont écrits pour la personne qui les lit, pas pour un
fichier de journal.

**Same-origin sur toute mutation.** Toutes les routes non-`GET` passent par
`route()` dans `src/lib/http.ts`, qui exige que l'hôte de l'en-tête `Origin`
corresponde à l'en-tête `Host` de la requête et renvoie `403
{"ok":false,"error":"Cross-origin request refused."}` en cas de divergence. Sur
une instance configurée en HTTPS, une origine `http` est refusée même si l'hôte
correspond. Ce contrôle est centralisé : une nouvelle route
ne peut pas l'oublier. Les requêtes sans aucun en-tête `Origin` sont autorisées —
curl, les liens dans les e-mails et certains robots n'en envoient pas, et les
refuser casserait le produit sans ajouter la moindre sécurité.

**L'authentification** repose sur un cookie de session `HttpOnly`, nommé
`unngl_session` en développement et `__Host-unngl_session` en production. Le
préfixe `__Host-` impose `Secure`, `Path=/` et l'absence de `Domain`, ce que les
navigateurs contrôlent.

**Limitation de débit** : `429` accompagné d'un message destiné à être affiché
à l'utilisateur.

**Validation** : un schéma `zod` par route (`src/lib/validation.ts`). Les champs
inconnus sont rejetés ; rien ne transite sans validation.

---

## Authentification

### `POST /api/auth/email` — demander un code de connexion

```jsonc
// requête
{ "email": "vous@exemple.com" }
```

```jsonc
// 200
{ "ok": true, "sent": true, "expiresInSeconds": 600 }
```

Envoie un code à 6 chiffres, valable 10 minutes, à usage unique, avec compteur
de tentatives. Limité par adresse et par IP.

La réponse est **identique dans tous les environnements**. En développement
uniquement, et seulement si `EXPOSE_DEV_CODES=1` est défini *et* que
`MAIL_TRANSPORT=console`, un champ `devCode` supplémentaire est ajouté. Ce
drapeau ne peut pas être honoré en production : c'est une primitive de prise de
contrôle de compte, et l'API ne le sert pas là-bas.

**429** si trop de codes ont été demandés pour cette adresse.

### `POST /api/auth/verify` — échanger un code contre une session

```jsonc
{ "email": "vous@exemple.com", "code": "424242" }
```

```jsonc
// 200
{ "ok": true, "user": { "id": "...", "email": "vous@exemple.com", "displayName": null } }
```

Pose le cookie de session. Les codes sont comparés en temps constant à une
empreinte HMAC ; le texte en clair n'est jamais stocké, ni journalisé à ce niveau.

**401/400** `That code is not right, or it has expired.`
**429** `That code has been used too many times. Ask for a new one.`

### `GET /api/auth/oauth/{fournisseur}` — démarrer OAuth

`fournisseur` ∈ `google` | `github` | `discord` | `facebook`.

302 vers le fournisseur. Pose un cookie `state` signé.

**404** fournisseur inconnu · **501** fournisseur non configuré sur ce serveur.

### `GET /api/auth/oauth/{fournisseur}/callback` — terminer OAuth

Échange, résout l'identité, rattache à un compte existant si le fournisseur
déclare un e-mail **vérifié** qui correspond à un compte, crée sinon, puis
redirige vers `/inbox`. Les jetons fournisseurs sont jetés immédiatement.

### `POST /api/auth/logout`

Détruit la ligne de session et efface le cookie avec le même nom, le même
`Path` et les mêmes attributs que ceux utilisés au moment du dépôt.

---

## Boîtes de réception

Une **boîte** est le composeur public. Elle a deux noms publics :

- un **slug** — 12 caractères tirés d'un alphabet de 31 symboles, 71 bits
  d'entropie. C'est le secret d'accès. Il est généré, jamais choisi, et il
  reste valable tant que la boîte existe.
- un **handle** — un nom choisi par une personne, comme `amina.k`. Facultatif,
  et seul le propriétaire peut le définir.

Les deux fonctionnent dans l'URL. `/{handle}` et `/{slug}` mènent à la même
boîte, et `/i/{handle}` comme `/i/{slug}`. Un lien partagé avant que le
propriétaire n'ait nommé sa boîte continue de fonctionner, et un lien
partagé après un renommage continue de fonctionner via `handle_aliases`.

### `POST /api/inboxes` — créer

Session requise. Corps : `{ "title"?: "chaîne ≤ 60", "handle"?: "chaîne" }`.

```jsonc
{
  "ok": true,
  "inbox": { "id": "...", "slug": "a7k3m9xp2qvn", "handle": "amina.k", "title": "..." },
  "handleRejected": false
}
```

Un `handle` passé ici est une commodité, jamais une condition : si le nom est
pris ou invalide, la boîte est quand même créée et fonctionne toujours par
son slug, et la réponse porte `handleRejected: true`. Perdre une course pour
un nom ne doit jamais coûter son lien à quelqu'un.

`id` est renvoyé pour qu'un client puisse revendiquer un handle pour cette
boîte juste après. Ce n'est pas un secret d'accès — chaque endpoint de handle
revérifie que l'appelant possède la boîte qu'il nomme.

**429** à `INBOXES_PER_USER` (5 par défaut), ou en cas de limitation.

### `PATCH /api/inboxes/{slug}` — renommer

Réservé au propriétaire ; toute autre personne reçoit **403** `That is not your
inbox.`
Corps : `{ "title"?: "chaîne ≤ 60", "notify"?: boolean }`.

---

## Handles

Les handles sont les seules chaînes choisies par l'utilisateur que
l'application place dans une URL. Chaque endpoint ici revalide donc côté
serveur : rien de ce que dit le navigateur n'est faisant foi.

### Ce qu'un handle peut être

| Règle | Valeur |
|---|---|
| Longueur | 3 à 24 caractères, mesurée après normalisation de la casse |
| Alphabet | `a–z`, `0–9`, `.`, `-`, `_` — **ASCII uniquement** |
| Extrémités | une lettre ou un chiffre ; ni `.`, ni `-`, ni `_` en tête ou en fin |
| Points doubles | refusés (`amina..k`) |
| Casse | repliée en minuscules : `Amina.K` et `amina.k` sont un seul nom |
| Réservés | chaque segment de route de l'application, plus les noms qui font passer pour ceux du service |

L'ASCII uniquement est le fond de l'histoire. Un `а` cyrillique a la même
forme pour un lecteur et une chaîne différente pour une base de données, et
un handle n'a pas le droit d'en être un. Un handle n'est pas non plus un
signal de confiance : il est toujours affiché à côté de sa propre boîte, et
le destinataire peut vérifier les couleurs du message.

### `GET /api/handles/check?handle=amina.k` — disponibilité

Connecté uniquement : la seule personne qui a besoin de la réponse est celle
qui s'apprête à prendre le nom. Un oracle ouvert permettrait de cartographier
quels noms existent sans rien créer.

```jsonc
{ "ok": true, "available": true, "handle": "amina.k" }
{ "ok": true, "available": false, "reason": "reserved", "message": "That one is taken by UnNGL itself." }
{ "ok": true, "available": false, "reason": "taken",    "message": "Someone already has that name." }
```

`reason` vaut `empty`, `too-short`, `too-long`, `characters`, `reserved`,
`taken`, ou `rate`/`unauthenticated` quand l'appel lui-même est refusé.
Limité par utilisateur et par IP.

### `POST /api/handles` — prendre ou renommer

Connecté. Corps : `{ "inboxId": "...", "handle": "amina.k" }`.

```jsonc
{ "ok": true, "inbox": { "handle": "amina.k", "slug": "a7k3m9xp2qvn", "url": "https://…/amina.k" },
  "replaced": null }
```

| Statut | Quand |
|---|---|
| **200** | pris, renommé, ou déjà le vôtre |
| **400** | nom inutilisable — le `message` dit pourquoi |
| **404** | boîte inexistante, ou qui n'est pas la vôtre |
| **409** | nom déjà pris. Tranché par l'index unique, pas par un vérifier-puis-écrire |
| **429** | limitation de débit |

Le renommage écrit l'ancien nom dans `handle_aliases` dans la même
instruction : un lien déjà transmis continue donc de résoudre. Rendre un nom à
la même boîte efface l'alias au lieu de le brûler définitivement.

Reprendre le nom qu'une boîte possède déjà renvoie **200**, pas **409** : ce
n'est pas un conflit, c'est une opération sans effet.

---

## Messages

### `POST /api/messages` — envoyer anonymement

`multipart/form-data`. **Ni session, ni compte, ni nom.**

| Champ | Type | Remarques |
|---|---|---|
| `to` | chaîne | le slug de la boîte |
| `body` | chaîne | ≤ 1000 caractères (`MAX_MESSAGE_CHARS`) |
| `website` | chaîne | **leurre** — à laisser vide |
| `palette` | chaîne JSON | palette revendiquée facultative, `{"colors":["#rrggbb",…]}` |
| `image` | fichier | PNG facultatif, ≤ 2 Mo, ≤ 1024 px sur le côté long |

```jsonc
// 201
{ "ok": true, "claimUrl": "/h/<jeton>", "palette": { "colors": [...], "verified": true } }
```

`claimUrl` est le lien privé de l'expéditeur. Il est affiché **une seule fois** ;
le serveur n'en conserve que l'empreinte HMAC, il ne peut donc pas être récupéré
plus tard.

Si le leurre `website` est rempli, la réponse est **202** `That message could not
be delivered.` — la même forme qu'un échec normal, pour qu'un robot n'apprenne
rien sur sa détection, et rien n'est stocké.

**429** `This inbox has had a lot of messages today. Try again later.` (10/h par
boîte) ou `You have sent a lot of messages recently. Try again in an hour.`
(30/h par IP).

**Vérification** : si `image` est présent, le serveur décode le vrai fichier et
recalcule la palette. `verified: true` signifie que son résultat correspond à la
palette revendiquée ; `false` qu'il ne correspond pas, et la revendication est
stockée comme non vérifiée.

### `GET /api/messages/{slug}` — lire une boîte

Public, par conception — c'est tout le produit. Renvoie tous les messages avec
leur palette, les métadonnées de l'indice, l'état de vérification et
l'indicateur de droit de suppression.

**Sans effet de bord.** Lire ne marque rien comme vu ; robots et préchargeurs ne
peuvent donc pas gonfler votre état de lecture. Le marquage fait l'objet d'un
appel explicite distinct.

**404** `That link has expired or never existed.`

### `POST /api/messages/{slug}` — marquer comme lu

Corps : `{ "id": "<id du message>" }`. `id: "*"` facultatif marque toute la boîte
comme lue. Ne marque que les messages non déjà vus, et renvoie le nombre modifié.

### `DELETE /api/messages/{slug}` — supprimer un message

Corps : `{ "id": "<id du message>" }`. **Propriétaire uniquement.**

**403** `Only the owner of this inbox can delete messages.`
**404** `Message not found`

L'expéditeur ne peut pas supprimer non plus par ce point d'entrée ; c'est
précisément à cela que sert le lien de réclamation.

---

## Indices et liens de réclamation

### `GET /h/{jeton}` — la page privée de l'expéditeur

Pas une route d'API : une page affichant le message envoyé et l'indice courant.
Le jeton seul fait office d'identifiant.

### `GET /api/claim/{jeton}` — lire la réclamation

```jsonc
{ "ok": true, "message": { "id": "...", "body": "...", "hint": { "colors": [...], "verified": true } } }
```

**404** `This claim link is not valid any more.`

### `POST /api/claim/{jeton}` — joindre ou remplacer l'indice

`multipart/form-data` : `image` (PNG, ≤ 2 Mo) et/ou `palette` (JSON).
Même recalcul et même vérification que lors de l'envoi.

Limité par jeton : **429** `Too many attempts on this link.`

---

## Compte

### `GET /api/profile`

Session requise. Renvoie l'utilisateur, sa palette d'avatar et ses boîtes.

### `PATCH /api/profile`

Session requise. `{ "displayName"?: "chaîne ≤ 60" }`.

### `POST /api/avatar` — définir une photo d'avatar

`multipart/form-data`, champ `image`. L'avatar est stocké sous forme de sa
**palette** — six valeurs hexadécimales — et l'image elle-même est abandonnée.
Le téléversement reste validé comme image au préalable, afin que la valeur
stockée soit une vraie réponse et non une devinette.

### `DELETE /api/avatar`

Supprime la palette stockée.

### `POST /api/account/email` — ajouter une adresse

Session requise. `{ "email": "..." }`. Envoie un code de vérification à la
**nouvelle** adresse : ajouter une adresse ne demande donc pas de prouver qu'on
possède celle avec laquelle on est connecté — la possession de la session fait
office d'autorisation.

**400** `That email is already used by another account.`

### `PUT /api/account/email` — vérifier la nouvelle adresse

`{ "email": "...", "code": "123456" }`.

### `DELETE /api/account` — supprimer le compte

Session requise. Cascades : sessions, comptes OAuth, boîtes, messages, indices
et images disparaissent avec lui. Irréversible ; l'interface demande une double
confirmation.

---

## Médias

### `GET /api/media/fetch?url=…`

Relais une image **depuis une liste blanche fixe de CDN sociaux**, afin que
l'application n'effectue jamais de requête vers un hôte arbitraire. C'est une
frontière anti-SSRF, pas une commodité.

- Longueur d'URL ≤ 2000, schéma `https:` uniquement
- L'hôte doit figurer sur la liste ; la correspondance par sous-domaine est
  exacte, étiquette par étiquette
- Les redirections ne sont pas suivies aveuglément
- Le corps de la réponse est lu en streaming avec un **plafond strict d'octets**,
  et la connexion est coupée dès qu'il est dépassé : un `Content-Length: petit`
  suivi d'un corps sans fin ne peut donc pas saturer la mémoire
- Le `Content-Type` doit être une image ; le type est revérifié en sortie

Limité en débit. **429** `Too many fetches from your connection. Try again later.`
**400** messages `MediaError`, par exemple un hôte absent de la liste.
**502** `Could not download that image.`

---

## Santé du service

### `GET /api/health`

```jsonc
{ "ok": true, "status": "ok", "time": "2026-09-28T14:22:19.665Z" }
```

En production, c'est la réponse entière. Avec `HEALTH_DETAIL=1` — ou
automatiquement hors production — elle ajoute la version, la version du schéma et
le nombre d'utilisateurs.

Ce détail constitue du renseignement s'il est public : c'est pourquoi il est
optionnel et désactivé par défaut en production.

---

## Table complète des routes

| Méthode | Chemin | Auth | Rôle |
|---|---|---|---|
| `POST` | `/api/auth/email` | — | demander un code de connexion |
| `POST` | `/api/auth/verify` | — | échanger un code contre une session |
| `GET` | `/api/auth/oauth/{fournisseur}` | — | démarrer OAuth |
| `GET` | `/api/auth/oauth/{fournisseur}/callback` | — | terminer OAuth |
| `POST` | `/api/auth/logout` | session | clore la session |
| `POST` | `/api/inboxes` | session | créer une boîte |
| `PATCH` | `/api/inboxes/{slug}` | propriétaire | renommer / activer les notifications |
| `GET` | `/api/handles/check` | session | ce nom est-il libre ? |
| `POST` | `/api/handles` | session | prendre ou renommer le handle d'une boîte |
| `POST` | `/api/messages` | — | envoyer anonymement |
| `GET` | `/api/messages/{slug}` | — | lire une boîte (sans effet de bord) |
| `POST` | `/api/messages/{slug}` | — | marquer comme lu |
| `DELETE` | `/api/messages/{slug}` | propriétaire | supprimer un message |
| `GET` | `/api/claim/{jeton}` | jeton | lire la réclamation |
| `POST` | `/api/claim/{jeton}` | jeton | joindre ou remplacer l'indice |
| `GET` | `/api/profile` | session | lire le profil |
| `PATCH` | `/api/profile` | session | modifier le profil |
| `POST` | `/api/avatar` | session | définir la palette d'avatar |
| `DELETE` | `/api/avatar` | session | effacer l'avatar |
| `POST` | `/api/account/email` | session | ajouter une adresse |
| `PUT` | `/api/account/email` | session | vérifier la nouvelle adresse |
| `DELETE` | `/api/account` | session | supprimer le compte |
| `GET` | `/api/media/fetch` | — | relais d'image sur liste blanche |
| `GET` | `/api/health` | — | état du service |

## Codes de statut

| Code | Signification ici |
|---|---|
| `200` / `201` | succès (`201` pour un message nouvellement envoyé) |
| `202` | leurre déclenché — ressemble à un échec, ne stocke rien |
| `400` | validation échouée, ou requête sans sens |
| `401` | aucune session |
| `403` | mauvaise origine, ou pas le propriétaire |
| `404` | aucune boîte, message ou réclamation correspondante |
| `429` | quota dépassé |
| `500` | erreur serveur ; le message indique que rien n'a été perdu |
