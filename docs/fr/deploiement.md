# Déploiement

Tout le service tient en un processus Node et un fichier SQLite. Il n'y a ni
serveur de base de données, ni cache, ni file d'attente, ni stockage objet à
provisionner. Si vous savez lancer un conteneur et copier un fichier, vous savez
f tourner UnNGL.

## Avant toute chose : deux non-négociables

1. **`SESSION_SECRET` doit être définie, et aléatoire.** Le serveur refuse de
   démarrer en production sans elle — il s'arrête immédiatement avec les
   instructions à suivre, avant de servir la moindre requête.
   ```bash
   openssl rand -base64 48
   ```
2. **Terminez le TLS devant.** Les cookies de session sont `Secure` et
   préfixés `__Host-` en production : ils ne sont pas envoyés en HTTP clair.
   C'est le comportement correct, et cela fera paraître les tests locaux cassés
   tant que vous n'aurez pas de vrai certificat. Utilisez un vrai nom de
   domaine, pas une IP.

Éventuellement, une fois le HTTPS définitif sur le domaine :

```bash
ENABLE_HSTS=1
```

HSTS indique aux navigateurs de refuser le texte brut pendant deux ans. Ne
l'activez pas pendant vos réglages — les navigateurs ne vous laisseront plus
revenir en arrière.

---

## Option 1 — Docker Compose (recommandé)

```bash
git clone https://github.com/AlshyTacohcysp/UnNGL
cd UnNGL
cp .env.example .env
```

Modifiez `.env` et définissez au minimum :

```bash
NEXT_PUBLIC_ORIGIN=https://unngl.exemple.com
SESSION_SECRET=<collez la sortie d'openssl>
```

Puis :

```bash
docker compose up -d --build
docker compose logs -f
```

Le fichier SQLite vit dans un **volume nommé** Docker : `docker compose down`
ne touche donc jamais à vos messages, et la base n'est lisible depuis nulle part
ailleurs sur l'hôte. L'image s'exécute en utilisateur non privilégié sur le
port 3000, possède un healthcheck, et embarque la sortie *standalone* de
Next.js : l'image finale ne contient ni outillage de build ni `node_modules`
superflus.

> **Vous voulez voir vos données ?** Passez à un bind mount — mais lancez d'abord
> `mkdir -p data && sudo chown 1001:1001 data`. L'image s'exécute avec l'uid
> 1001, et un répertoire que Docker crée pour un bind mount appartient à root :
> SQLite ne peut alors pas créer ses fichiers `-wal`/`-shm` et le conteneur
> s'arrête au premier démarrage. C'est l'échec de premier lancement le plus
> fréquent. Les lignes exactes à modifier sont commentées en bas de
> `docker-compose.yml`.

Placez un reverse proxy devant (Caddy, nginx, Traefik) pour le TLS. Un
`Caddyfile` minimal :

```
unngl.exemple.com {
    reverse_proxy 127.0.0.1:3000
}
```

Caddy obtient le certificat tout seul.

## Option 2 — Node seul sur un VPS

```bash
git clone https://github.com/AlshyTacohcysp/UnNGL
cd UnNGL
npm ci
npm run build
```

Exécutez-le sous un superviseur, avec une unité systemd :

```ini
[Unit]
Description=UnNGL
After=network.target

[Service]
Type=simple
User=unngl
WorkingDirectory=/srv/unngl
Environment=NODE_ENV=production
EnvironmentFile=/srv/unngl/.env
ExecStart=/usr/bin/node scripts/start.mjs
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/srv/unngl/data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now unngl
```

## Option 3 — PaaS (Fly, Railway, Render, Koyeb)

Fonctionne tel quel, avec une exigence : **le système de fichiers doit être
persistant**, car la base est un fichier. Montez un volume et pointez
`DATABASE_PATH` dessus.

- **Fly.io** : `fly volumes create unngl_data`, définissez
  `mounts: ["/srv/data"]` et `DATABASE_PATH=/srv/data/unngl.sqlite`.
- **Railway / Render** : attachez un disque, définissez la même variable.
- **Les plateformes serverless (Vercel, Lambda) ne fonctionneront pas**, car
  leurs systèmes de fichiers sont éphémères. Faire tourner plusieurs instances
  ne fonctionnera pas non plus, pour la même raison : SQLite signifie
  exactement un écrivain.

Si vous avez besoin de mise à l'échelle horizontale, c'est un fork avec une
autre base de données, pas un changement de configuration. Dites-le honnêtement
dans votre README si vous le faites.

---

## E-mail

Sans configuration, les codes de connexion partent dans le journal du serveur et
rien n'est envoyé. C'est parfait pour une instance privée, inutilisable pour une
instance publique.

Définissez :

```bash
MAIL_TRANSPORT=smtp
MAIL_FROM=UnNGL <no-reply@unngl.exemple.com>
SMTP_HOST=smtp.exemple.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=unngl
SMTP_PASS=<mot de passe>
```

Le client SMTP est écrit de zéro — pas de `nodemailer` — parce qu'il fait
environ 300 lignes d'AUTH/LOGIN et de cadrage MIME, et parce qu'une dépendance
est une dépendance. Il parle ESMTP avec `STARTTLS`, et les authentifications
`PLAIN` et `LOGIN`.

Si vous restez sur `console` en production, le serveur affiche un avertissement
au démarrage. Les codes ne sont toujours pas renvoyés dans les réponses de
l'API.

## OAuth (optionnel)

Définissez l'identifiant et le secret du fournisseur de votre choix ; chacun
s'active de lui-même. L'URL de rappel est toujours :

```
{NEXT_PUBLIC_ORIGIN}/api/auth/oauth/{fournisseur}/callback
```

Avec `NEXT_PUBLIC_ORIGIN=https://unngl.exemple.com`, Google est
`https://unngl.exemple.com/api/auth/oauth/google/callback`. Voir
[démarrage](demarrage.md#connexion) pour ce que fait chaque fournisseur.

---

## Sauvegardes

Tout ce qui compte tient dans un fichier.

```bash
sqlite3 /srv/unngl/data/unngl.sqlite ".backup '/backups/unngl-$(date +%F).sqlite'"
```

Avec le volume nommé Docker :

```bash
docker run --rm -v unngl_data:/data -v "$PWD":/backup alpine \
  sh -c 'cd /data && sqlite3 unngl.sqlite ".backup /backup/unngl-$(date +%F).sqlite"'
```

Utilisez `.backup`, pas `cp`. La base fonctionne en mode WAL : un simple `cp`
d'un fichier vivant peut capturer un état incohérent. `.backup` prend un instantané
cohérent en toute sécurité.

Conservez une semaine de sauvegardes quotidiennes, hors de la machine. Une base
de la veille, c'est une journée de messages ; une base perdue, c'est tous les
messages.

## Mises à jour

```bash
cd /srv/unngl
sqlite3 data/unngl.sqlite ".backup '/tmp/pre-upgrade.sqlite'"
git pull
npm ci
npm run build
sudo systemctl restart unngl
```

Les changements de schéma sont des instructions `CREATE TABLE IF NOT EXISTS` /
`ALTER TABLE … ADD COLUMN` idempotentes exécutées à l'ouverture : il n'y a donc
aucune étape de migration séparée et rien à lancer à la main. Si le serveur ne
redémarre pas, restaurez l'instantané.

## Exploiter le service

- `GET /api/health` renvoie `{"ok":true,"status":"ok","time":"…"}`. C'est
  volontairement ennuyeux ; ajoutez `HEALTH_DETAIL=1` seulement si vous voulez
  la version, le schéma et le nombre d'utilisateurs dans la réponse — et
  souvenez-vous qu'en production cela constitue du renseignement.
- Au démarrage, le serveur audite sa propre configuration et affiche un
  avertissement pour tout point faible : secret absent ou trop court,
  `NEXT_PUBLIC_ORIGIN` non en HTTPS, courrier encore dirigé vers le journal,
  détail du health activé, HSTS activé sans HTTPS. Ce sont des conseils, pas des
  blocages — lisez-les une fois après votre premier déploiement.
- Les journaux sont de simples sorties `console`. Il n'y a aucun fichier de log
  à faire tourner.
- Le balayage des images d'indice s'exécute à l'occasion de la création d'un
  message : toute photo plus ancienne que `HINT_IMAGE_RETENTION_DAYS` (7) est
  supprimée avec la ligne qui la référence. Aucune cron n'est nécessaire. Si
  l'instance est inactive, les photos restent simplement là jusqu'au prochain
  message ; la palette qu'elles ont produite est déjà dans la ligne du message.

## Liste de durcissement

- [ ] `SESSION_SECRET` aléatoire, ≥ 32 octets, hors de git
- [ ] `NEXT_PUBLIC_ORIGIN` en `https://`
- [ ] Le TLS se termine devant ; HTTP redirige vers HTTPS
- [ ] `ENABLE_HSTS=1` une fois le domaine définitif
- [ ] `TRUSTED_PROXY=1` **uniquement** si un proxy que vous contrôlez est le
      seul chemin d'accès
- [ ] `EXPOSE_DEV_CODES` non défini
- [ ] `HEALTH_DETAIL` non défini
- [ ] `MAIL_TRANSPORT=smtp` si l'instance est publique
- [ ] `.env` en `chmod 600`, détenu par l'utilisateur du service
- [ ] `.backup` quotidien hors de la machine
- [ ] `/srv/unngl/data` hors de toute racine web lisible par tous
