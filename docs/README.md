# UnNGL — documentation

The full documentation lives in two parallel editions. They cover the same
ground and are kept in sync; pick one and ignore the other.

| | English | Français |
|---|---|---|
| Overview | [en/README.md](en/README.md) | [fr/README.md](fr/README.md) |
| Getting started | [en/getting-started.md](en/getting-started.md) | [fr/demarrage.md](fr/demarrage.md) |
| Deployment | [en/deployment.md](en/deployment.md) | [fr/deploiement.md](fr/deploiement.md) |
| Architecture | [en/architecture.md](en/architecture.md) | [fr/architecture.md](fr/architecture.md) |
| The palette algorithm | [en/algorithm.md](en/algorithm.md) | [fr/algorithme.md](fr/algorithme.md) |
| API reference | [en/api.md](en/api.md) | [fr/api.md](fr/api.md) |
| Security | [en/security.md](en/security.md) | [fr/securite.md](fr/securite.md) |
| Contributing | [en/contributing.md](en/contributing.md) | [fr/contribuer.md](fr/contribuer.md) |

## In one paragraph

UnNGL is a free, open source alternative to NGL.link. You share a link, strangers
write to you anonymously, and instead of paying to unlock a vague "profile photo
hint" you get the sender's entire colour palette — six colours derived from their
photo by an algorithm that is published in full, versioned, and independently
verifiable. No paywall, no data sold, AGPL-3.0.

## En un paragraphe

UnNGL est une alternative libre et open source à NGL.link. Vous partagez un lien,
des inconnus vous écrivent anonymement, et au lieu de payer pour débloquer un
« indice de photo de profil » vague, vous obtenez la palette de couleurs
complète de l'expéditeur — six couleurs issues de sa photo via un algorithme
publié intégralement, versionné et vérifiable indépendamment. Aucun paywall,
aucune donnée vendue, AGPL-3.0.

## Before you self-host

Two things to know, both documented in detail but repeated here because they
are the ones that bite:

1. **The server refuses to start in production without `SESSION_SECRET`.** This
   is deliberate. Generate one with `openssl rand -base64 48`.
2. **Put it behind HTTPS.** Session cookies are marked `Secure` and prefixed
   `__Host-` in production, so they will not be sent over plain HTTP at all —
   which is correct, but will make local testing in production mode look broken
   until you set up a certificate.

## Avant de vous auto-héberger

Deux points à connaître, documentés en détail ailleurs mais répétés ici parce
que ce sont ceux qui posent problème :

1. **Le serveur refuse de démarrer en production sans `SESSION_SECRET`.** C'est
   délibéré. Générez-en un avec `openssl rand -base64 48`.
2. **Placez-le derrière HTTPS.** Les cookies de session sont marqués `Secure` et
   préfixés `__Host-` en production : ils ne sont donc jamais envoyés en HTTP
   clair. C'est le comportement correct, mais cela fera paraître les tests locaux
   en mode production cassés tant que vous n'aurez pas de certificat.
