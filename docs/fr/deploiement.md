# Déploiement

UnNGL, c'est un processus Node sans état et une base PostgreSQL. Pas de cache,
pas de file d'attente, pas de stockage objet, pas un seul fichier sur le disque.
C'est ce qui le rend déployable sur un palier gratuit : la seule chose à
conserver est la base de données.

Deux façons de le faire tourner, toutes deux gratuites :

| | Coût | Pour qui |
|---|---|---|
| **[Vercel + Supabase](#option-1--vercel--supabase-recommandé)** | gratuit | l'instance publique. Aucun serveur à maintenir. |
| **[Docker Compose](#option-2--docker-compose)** | gratuit sur votre propre matériel | l'auto-hébergement, ou un VPS. |

---

## Avant tout : deux points non négociables

1. **`SESSION_SECRET` doit être défini, et être aléatoire.** Le serveur refuse
   de démarrer en production sans lui — il quitte immédiatement en affichant
   les instructions, avant de servir une seule requête.
   ```bash
   openssl rand -base64 48
   ```
   Le changer plus tard déconnecte tout le monde et invalide toutes les empreintes
   stockées. Définissez-le une fois pour toutes.
2. **`NEXT_PUBLIC_ORIGIN` doit être votre vrai domaine en `https://`.** Les
   cookies de session sont `Secure` et préfixés `__Host-` en production : ils
   ne sont pas envoyés du tout en HTTP simple, et les liens des e-mails sont
   construits à partir de cette valeur.

---

## Option 1 — Vercel + Supabase (recommandé)

Les deux paliers gratuits. Sans carte bancaire, sans serveur, sans `docker`.

### 1. La base de données

1. Créez un projet sur [supabase.com](https://supabase.com) et attendez la fin de
   la construction.
2. Ouvrez **Project Settings → Database** et copiez la chaîne de connexion qui
   ressemble à ceci :

   ```
   postgresql://postgres.[project-ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
   ```

> **Utilisez le pooler sur le port `6543`**, pas la connexion directe sur `5432`.
> Une fonction serverless ouvre une connexion neuve à chaque invocation et la
> referme ensuite. La connexion directe est une session dédiée : un flot de
> requêtes épuise alors la limite de connexions du palier et le site tombe. Le
> *transaction pooler* est fait exactement pour ça. L'application se connecte
> avec `prepare: false` pour la même raison — le pooler n'a pas de session où
> suspendre une requête préparée.

Mettez **Transaction pooler** comme mode si Supabase vous le demande, et
activez **SSL** si le choix vous est proposé. L'application n'a pas besoin du
paramètre `pgbouncer=true` que portent les URL de type Prisma ; il est
inoffensif si vous le laissez.

3. Facultatif, mais recommandé : ouvrez **SQL Editor → New query**, collez
   [`supabase/schema.sql`](../../supabase/schema.sql) et exécutez. L'application
   applique le même schéma toute seule au démarrage, donc ce n'est pas requis —
   cela signifie simplement que les tables existent avant le premier visiteur, et
   que vous avez lu le schéma avant qu'il ne touche votre projet.

> **Le palier gratuit se met en veille après 7 jours d'inactivité.** Au
> réveil, la première requête peut prendre jusqu'à une trentaine de secondes le
> temps que la base redémarre. C'est le seul angle vif réel d'un déploiement à
> coût zéro ; tout le reste est sans histoire. Si ce compromis ne vous convient
> pas, l'[option 2](#option-2--docker-compose) sur du matériel que vous possèdez
> déjà le supprime.

### 2. L'application

1. Poussez ce dépôt sur GitHub, puis **Import Project** sur
   [vercel.com](https://vercel.com). Vercel détecte Next.js ; rien à changer.
2. Ajoutez ces **variables d'environnement** (Settings → Environment Variables) :

   | Variable | Valeur |
   |---|---|
   | `DATABASE_URL` | la chaîne en `6543` de l'étape 1 |
   | `SESSION_SECRET` | les 48 octets aléatoires ci-dessus |
   | `NEXT_PUBLIC_ORIGIN` | `https://votre-app.vercel.app` — puis votre vrai domaine |
   | `MAIL_TRANSPORT` | `smtp` une fois le SMTP configuré, voir [E-mail](#e-mail) |
   | `MAIL_FROM` | `UnNGL <no-reply@votre-domaine>` |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | ceux de votre fournisseur |
   | `ENABLE_HSTS` | `1` — voir la note ci-dessous |

   `TRUSTED_PROXY=1` **uniquement** si un proxy que vous contrôlez est le seul
   chemin vers l'application. Vercel est ce proxy, donc mettez-le : sans lui
   l'application ne voit pas les adresses IP des visiteurs et tout le monde
   partage un seul compartiment de limitation, ce qui désactive la limitation en
   pratique.

3. **Déployez.** La première requête applique le schéma. Rien d'autre à lancer.

4. Dès que vous avez un vrai domaine, mettez `NEXT_PUBLIC_ORIGIN` à jour et
   redéployez. `NEXT_PUBLIC_ORIGIN` est un réglage d'exécution — le changer et
   redéployer suffit, aucune recompilation n'est nécessaire.

### HSTS

```bash
ENABLE_HSTS=1 npm run build
```

HSTS dit aux navigateurs de refuser le texte en clair pendant deux ans. Ne
l'activez pas tant que la mise en place n'est pas terminée — les navigateurs ne
vous laisseront pas revenir en arrière.

> Sur Vercel, la commande de build est dans les réglages du projet : mettez-y la
> variable puis redéployez, plutôt que de compiler en local.

> **`ENABLE_HSTS` est un réglage de compilation, pas d'exécution.**
> `next.config` ne fait pas partie du déploiement : le mettre dans `.env` et
> redémarrer ne fait rigoureusement rien, silencieusement. Il faut le fixer au
> moment de la compilation. Le serveur sait avec quoi il a été compilé et le dit
> au démarrage, donc vous pouvez voir lequel des deux s'est produit. Avec Docker :
> ```bash
> docker build --build-arg ENABLE_HSTS=1 -t unngl:latest .
> ```

---

## Option 2 — Docker Compose

Lance l'application et un vrai PostgreSQL ensemble. Rien n'est exposé sur la
machine hôte à part le port de l'application.

```bash
git clone https://github.com/AlshyTacohcysp/UnNGL
cd UnNGL
cp .env.example .env
# définissez SESSION_SECRET et NEXT_PUBLIC_ORIGIN
docker compose up -d
```

La base vit dans un **volume nommé** Docker : `docker compose down` n'y touche
jamais, et `docker compose down -v` est la seule commande qui la supprime.
`docker-compose.yml` attend que la base accepte réellement les connexions avant
de lancer l'application, parce que celle-ci applique ses migrations au démarrage.

Pour utiliser un PostgreSQL que vous avez déjà au lieu de celui fourni, mettez
`DATABASE_URL` dans `.env` et supprimez la ligne `DATABASE_URL:` du bloc
`environment:` dans `docker-compose.yml`.

### Node seul sur un VPS

L'image Docker est toute l'histoire, et elle fonctionne aussi sans Docker :

```bash
git clone https://github.com/AlshyTacohcysp/UnNGL
cd UnNGL
npm ci
ENABLE_HSTS=1 npm run build
DATABASE_URL='postgresql://…' SESSION_SECRET="$(openssl rand -base64 48)" \
  NEXT_PUBLIC_ORIGIN='https://unngl.exemple.com' \
  node scripts/start.mjs
```

Placez-la derrière un reverse proxy qui termine le TLS. L'application est sans
état : vous pouvez en lancer autant que vous voulez contre une seule base.

---

## E-mail

Sans configuration, les codes de connexion partent dans le journal du serveur et
rien n'est envoyé. C'est très bien pour une instance privée, et inutilisable
pour une instance publique — l'e-mail est le moyen principal de se connecter,
donc une instance publique sans SMTP n'est pas utilisable du tout.

```bash
MAIL_TRANSPORT=smtp
MAIL_FROM=UnNGL <no-reply@unngl.exemple.com>
SMTP_HOST=smtp.exemple.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=unngl
SMTP_PASS=<mot de passe>
```

Le client SMTP est écrit à la main — pas de `nodemailer` — parce qu'il tient en
300 lignes d'AUTH/LOGIN et de cadrage MIME, et parce qu'une dépendance est une
dépendance. Il parle ESMTP avec `STARTTLS`, et les authentifications `PLAIN` et
`LOGIN`.

Si vous restez sur `console` en production, le serveur affiche un avertissement
au démarrage. Les codes ne sont toujours jamais renvoyés dans une réponse
d'API.

La plupart des gens se tournent vers Resend, Mailgun, Brevo ou le palier gratuit
de Postmark ; les quatre fonctionnent, et les quatre ont un palier gratuit qui
couvre une petite instance.

## OAuth (facultatif)

Définissez l'identifiant et le secret d'un fournisseur ; chacun s'active tout
seul. L'URL de rappel est toujours :

```
{NEXT_PUBLIC_ORIGIN}/api/auth/oauth/{provider}/callback
```

Avec `NEXT_PUBLIC_ORIGIN=https://unngl.exemple.com`, Google vaut
`https://unngl.exemple.com/api/auth/oauth/google/callback`. Voir
[démarrage](demarrage.md#se-connecter) pour ce que fait chaque fournisseur.

---

## Sauvegardes

Une base PostgreSQL se sauvegarde avec `pg_dump`, pas avec `cp`. Une simple copie
d'une base en activité peut capturer un état incoherent.

```bash
pg_dump "$DATABASE_URL" -Fc -f "/backups/unngl-$(date +%F).dump"
```

Avec le volume nommé Docker :

```bash
docker compose exec -T db pg_dump -U postgres -d unngl -Fc > "unngl-$(date +%F).dump"
```

Gardez une semaine de dumps quotidiens, hors de la machine. Une base de la
veille, c'est un jour de messages ; une base perdue, c'est tous les messages.

Sur Supabase, les sauvegardes quotidiennes sont incluses dans les paliers payants ;
sur le palier gratuit, faites les vôtres avec la commande ci-dessus, ou pointez
une tâche cron GitHub Actions gratuite dessus.

## Mises à jour

Sur Vercel : redéployez, ou laissez un nouveau commit le faire. Rien à lancer à
la main.

Avec Docker ou sur un serveur :

```bash
pg_dump "$DATABASE_URL" -Fc -f /tmp/pre-upgrade.dump
git pull
docker compose up -d --build     # ou : npm ci && npm run build && redémarrage
```

Les changements de schéma sont des `CREATE TABLE IF NOT EXISTS` idempotents,
enregistrés dans une table `schema_migrations` et exécutés au démarrage : il n'y
a pas d'étape de migration séparée et rien à lancer à la main. Si le serveur ne
redémarre pas, restaurez l'instantané.

## Exploitation

- `GET /api/health` renvoie `{"ok":true,"status":"ok","time":"…"}`. C'est
  volontairement ennuyeux ; ajoutez `HEALTH_DETAIL=1` seulement si vous voulez la
  version, le schéma et le nombre d'utilisateurs dans la réponse — et souvenez-vous
  qu'en production c'est de la reconnaissance.
- Au démarrage, le serveur audite sa propre configuration et affiche un
  avertissement pour tout ce qui est faible : secret manquant ou trop court,
  `DATABASE_URL` absent ou pointant sur localhost, `NEXT_PUBLIC_ORIGIN` non en
  HTTPS, courriels encore dirigés vers le journal, détail de santé activé, HSTS
  activé sans HTTPS. C'est un conseil, pas un blocage — lisez-le une fois après
  votre premier déploiement.
- Les journaux sont de simples sorties `console`, ce qui sur Vercel veut dire les
  journaux de fonction.
- Le balayage des photos sources s'exécute à l'opportuniste, à la création d'un
  message : toute photo de plus de `HINT_IMAGE_RETENTION_DAYS` (7) est supprimée
  avec la ligne qui la pointe. Aucune tâche cron n'est nécessaire. Si
  l'instance est inactive, les photos restent là jusqu'au message suivant ; la
  palette qu'elles ont produite est déjà dans la ligne du message.

## Liste de durcissement

- [ ] `SESSION_SECRET` aléatoire, ≥ 32 octets, hors du dépôt
- [ ] `NEXT_PUBLIC_ORIGIN` en `https://`, égal au vrai domaine
- [ ] TLS terminé devant ; HTTP redirigé vers HTTPS
- [ ] `DATABASE_URL` utilise le **pooler**, port `6543`
- [ ] Recompilé avec `ENABLE_HSTS=1` une fois le domaine définitif (compilation)
- [ ] `TRUSTED_PROXY=1` **uniquement** si un proxy que vous contrôlez est le seul
      chemin d'entrée
- [ ] `EXPOSE_DEV_CODES` non défini
- [ ] `HEALTH_DETAIL` non défini
- [ ] `MAIL_TRANSPORT=smtp` si l'instance est publique
- [ ] Un `pg_dump` quotidien part hors de la machine
