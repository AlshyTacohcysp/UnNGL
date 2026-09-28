# Démarrage

## Prérequis

- **Node 22 ou plus récent.**
- **Une base PostgreSQL.** En production, c'est le palier gratuit de Supabase. En
  développement, il n'y a rien à installer : `npm run db:serve` démarre un vrai
  PostgreSQL dans le même processus, servi par le protocole réseau, donc
  l'application s'y connecte avec le même pilote que celui qu'elle utilisera en
  production.

Vérifiez votre version :

```bash
node -v
```

## Lancer en local

```bash
git clone https://github.com/AlshyTacohcysp/UnNGL
cd UnNGL
npm install
cp .env.example .env.local

# Terminal 1 — un vrai PostgreSQL, en mémoire, pour la durée de ce lancement.
npm run db:serve

# Terminal 2 — l'application.
npm run dev
```

Ouvrez <http://localhost:3000>. Le schéma est créé automatiquement à la première
connexion.

> **Contre une vraie base de données :** mettez `DATABASE_URL` dans
> `.env.local` sur n'importe quel PostgreSQL 14 ou plus récent, et passez la
> commande `npm run db:serve`. Celle-ci garde ses données en mémoire et démarre
> donc vide à chaque fois.

> **Mode développement** (rechargement automatique, et le code de connexion
> affiché dans l'interface) :
> ```bash
> npm run dev
> ```
> Pour que le code apparaisse dans le navigateur, ajoutez `EXPOSE_DEV_CODES=1`
> dans `.env.local`. La variable est refusée en production — voir
> [sécurité](securite.md#le-drapeau-qu-il-ne-faut-jamais-activer).

## Tester tout le parcours en cinq minutes

### 1. Obtenir un lien

Cliquez sur **Sign in**, saisissez n'importe quelle adresse e-mail, puis
*Email me a code*. Sans serveur de messagerie configuré, le code s'affiche dans
le journal du serveur :

```
┌─ UnNGL login code ─────────────────────────────────
│ to:   you@example.com
│ code: 424242
│ link: http://localhost:3000/login?email=…&code=424242
└────────────────────────────────────────────────────
```

En mode développement, le code apparaît aussi à l'écran. Saisissez-le : vous
êtes connecté.

> Le lien contenu dans l'e-mail est la voie la plus élégante : il arrive avec le
> code pré-rempli, donc l'e-mail fonctionne même pour quelqu'un qui ne voit pas
> l'interface.

### 2. Recevoir un message

Votre nouvelle boîte de réception a un lien court comme
`unngl.link/a7k3m9xp2qvn`. Ouvrez-le dans une fenêtre privée — c'est le
composeur public, exactement ce que voit toute personne détenant votre lien.
Écrivez quelque chose.

Pour joindre un indice, déposez une photo. Les six couleurs apparaissent
immédiatement, dans votre navigateur, avant tout envoi.

### 3. Lire

Revenez sur `/inbox` (ou le lien `/i/<slug>`) : vous verrez le message avec sa
palette affichée en entier, estampillée *server-verified* si les couleurs
recalculées par le serveur à partir de la photo d'origine correspondent à ce que
le navigateur affirmait.

### 4. Essayer le lien de réclamation

Après l'envoi, le composeur vous remet un lien privé de la forme `/h/<token>`.
C'est le seul moyen de revenir à ce message, et il permet d'ajouter ou de
modifier votre palette après coup. Vous seul le possédez.

## Créer une boîte de démonstration

Pour passer tout là-dessus :

```bash
npm run seed
```

Cela crée `demo@unngl.link` avec une boîte contenant quatre messages, dont trois
avec de vraies palettes calculées par l'algorithme publié. Le script affiche le
code de connexion, le lien vers la boîte et le lien du composeur public. On peut
le relancer sans risque.

## Commandes

| Commande | Effet |
|---|---|
| `npm run dev` | serveur de développement avec rechargement à chaud, port 3000 |
| `npm run build` | build de production |
| `npm start` | serveur de production (sortie standalone si buildée, sinon `next start`) |
| `npm test` | la suite de tests complète (74 tests) |
| `npm run typecheck` | TypeScript, sans émission |
| `npm run seed` | créer le compte et la boîte de démonstration |
| `npm run samples` | régénérer les palettes d'exemple des pages marketing |
| `npm run assets` | régénérer le favicon et la carte Open Graph |

## Configuration

Chaque variable est documentée dans [`.env.example`](../../.env.example). Pour
une exécution locale, vous n'en avez besoin d'aucune.

Ce qui compte vraiment en production, c'est `SESSION_SECRET` :

```bash
openssl rand -base64 48
```

Le serveur refuse de démarrer en production sans elle, volontairement — voir
[sécurité](securite.md#les-secrets).

## Organisation du projet

```
src/
  app/
    [slug]/       le composeur public (le lien partageable ; un handle marche aussi)
    i/[slug]/     la boîte de réception du propriétaire
    h/[token]/    le lien de réclamation de l'expéditeur
    algorithm/    la spécification publiée + le bac à sable
    api/          tous les gestionnaires de routes
  components/     collage, composeur, sélecteur d'indice, panneaux, bac à sable
  lib/
    palette/
      extract.ts  L'ALGORITHME — s'exécute dans le navigateur et sur le serveur
      png.ts      décodeur PNG sans dépendance (la voie de vérification)
      client.ts   chaîne d'envoi côté navigateur
    db.ts         postgres, migrations, sans ORM
    auth.ts       utilisateurs, sessions, codes e-mail
    hints.ts      création et vérification d'un indice
    inbox.ts      boîtes, messages, jetons de réclamation
    media.ts      récupération d'images sur liste blanche
    mail.ts       client SMTP sans dépendance
    oauth.ts      un client, quatre fournisseurs
tests/            tests d'algorithme + tests de régression sécurité
scripts/          samples, assets, seed, start
docs/             cette documentation
```

## Pour aller plus loin

- [Déploiement](deploiement.md) — le mettre vraiment en ligne
- [Architecture](architecture.md) — comment les pièces s'assemblent
- [Sécurité](securite.md) — avant de l'exposer à quiconque
