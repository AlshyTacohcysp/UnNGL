# UnNGL — vue d'ensemble

**Des messages anonymisés où l'indice est la palette de couleurs entière d'une
personne — et ça ne coûte rien.**

UnNGL est une alternative libre et open source à NGL.link. Vous partagez un lien,
des inconnus vous écrivent anonymement, et au lieu de payer pour débloquer un
« indice de photo de profil » vague, vous obtenez la palette entière de
l'expéditeur : six couleurs extraites de sa photo par un algorithme publié
intégralement, versionné et vérifiable indépendamment.

---

## L'idée

Le modèle économique de NGL, *c'est* l'indice. L'application peut en produire un
pour quelques centimes, vous le facturer plusieurs euros, sans aucune pression à
le rendre réellement utile. La FTC a précisément visé les applications utilisant
ce type de mécanisme, y compris autour des données des enfants.

UnNGL inverse le rapport sur tous les axes :

| | Style NGL | UnNGL |
|---|---|---|
| Coût d'un indice | achat intégré, à chaque message | gratuit, toujours ; aucun bouton d'achat n'existe |
| Ce que vous obtenez | souvent vague, parfois fabriqué | six valeurs hex exactes issues d'un algorithme publié |
| Pouvez-vous le vérifier ? | non | oui — recalculez-le vous-même ; la spécification est publique |
| Que deviennent les photos | stockées, et vendues | supprimées 7 jours après extraction de la palette |
| Adresses IP | stockées | jamais stockées en clair ; une empreinte HMAC tronquée par message |
| Code source | fermé | AGPL-3.0, auto-hébergeable, une seule base PostgreSQL |

**Pourquoi une palette est un bon indice.** Pour quelqu'un qui *vous connaît*, six
couleurs issues de votre photo de profil constituent une empreinte impossible à
manquer. Pour quelqu'un qui ne vous connaît pas, c'est inutile. C'est exactement
la bonne forme pour la vie privée : cela ne révèle rien aux personnes qui vous
connaissent déjà, et rien à personne d'autre. Rien n'est indexable par recherche
inverse, et il n'y a rien à vendre.

---

## Le produit

| Route | Ce que c'est |
|---|---|
| `/` | la vitrine |
| `/[handle\|slug]` | **votre lien public.** n'importe qui peut écrire anonymement. Vous recevez un slug automatique, ou vous choisissez un handle comme `amina.k` — les deux continuent de marcher |
| `/i/[handle\|slug]` | votre boîte de réception : tous les messages, toutes les palettes, rien de verrouillé |
| `/h/[token]` | le lien privé de l'expéditeur, pour ajouter ou changer un indice plus tard |
| `/algorithm` | la spécification publique complète, plus un bac à sable qui s'exécute dans votre navigateur |
| `/login` | code par e-mail, ou OAuth |
| `/settings` | nom, avatar (stocké comme palette), e-mail, suppression du compte |
| `/privacy`, `/terms`, `/about` | les versions courtes |
| `/api/health` | état du service, avec un mode détail optionnel |

### Le parcours, de bout en bout

1. **Obtenez un lien.** Connectez-vous avec un code à 6 chiffres, ou un
   fournisseur OAuth. Vous obtenez un lien court qui est votre boîte de
   réception : 12 caractères tirés d'un alphabet de 31 symboles, soit 71 bits
   d'entropie.
2. **Quelqu'un vous écrit.** Pas de compte, pas de nom, pas de numéro. La
   personne peut joindre une photo, uniquement pour que vous voyiez ses
   couleurs.
3. **Vous voyez sa palette.** Six couleurs, calculées dans son navigateur *et*
   recalculées de notre côté à partir du fichier original. Si les deux
   divergent, le lecteur est prévenu et l'indice est marqué non vérifié. La
   photo est supprimée au bout de 7 jours.

Aucune étape n'implique de paiement, de compte, ni de tirage au sort.

### Connexion

**L'e-mail d'abord** : un code à 6 chiffres, aucun mot de passe nulle part. Les
codes ne sont stockés que sous forme d'empreinte HMAC, expirent en 10 minutes,
sont à usage unique, brûlent une tentative en cas d'échec, et sont limités par
adresse et par IP.

**OAuth** est un client 2.0/OIDC générique — ajouter un fournisseur est une
ligne de table, pas du nouveau code. Google, GitHub, Discord et Facebook sont
câblés et s'activent dès que leurs identifiants sont définis. Un fournisseur
donnant un e-mail *vérifié* correspondant à un compte existant y est rattaché :
c'est ce qui fait que l'e-mail et OAuth sont un seul compte, et non deux
demi-comptes.

**À propos d'Instagram** : Meta a retiré l'API Instagram Basic Display en
décembre 2024 ; aucune application ordinaire ne peut donc plus lire un profil
Instagram de cette façon. Un bouton de connexion qui ferait cela serait un bouton
qui ne peut pas fonctionner. Ce qui reste, c'est Facebook Login, qui peut
retourner un nom d'utilisateur Instagram — d'où le fournisseur libellé
**Facebook / Instagram**. Pour la palette elle-même, cela ne change rien : une
photo et un algorithme documenté suffisent.

---

## Le design

La direction reprise des maquettes d'écran, construite comme un système dans
`src/app/globals.css` :

- **Figtree** pour tout ce qui est structurel ; **Instrument Serif** (romain et
  italique) pour une seule chose à la fois : une voix humaine (corps des
  messages, la question au-dessus du composeur, légendes). Les deux sont
  embarquées via Fontsource.
- La page est un champ lavande doux (`#e9e9f2`) et les cartes flottent dessus en
  blanc pur, arrondies à 24 px. **Rien n'a de contour à l'encre** — les
  surfaces sont séparées par la couleur et le blanc, pas par une bordure.
- L'encre est un bleu marine profond (`#1b1b33`), jamais noir. Cela repose mieux
  sur le lavande.
- **La seule arête dure de l'application est l'ombre sous le bouton principal** :
  une dalle corail (`#f2543d`) qui dépasse en bas à droite, comme un décalage de
  risographie. C'est le seul endroit où une ombre dure apparaît.
- Six couleurs portent la promesse du produit : ambre, corail, sarcelle, indigo,
  rose, ciel.
- La palette est l'objet signature, et c'est toujours de la **couleur, jamais la
  photo** : un aplat avec quatre grands cercles rognés dans la boîte de réception,
  une pilule segmentée à coins arrondis sur le composeur, une pilule de points et
  un disque dans le schéma.

Le favicon et la carte Open Graph sont générés par `npm run assets` à partir des
mêmes six couleurs : l'identité et le produit sont visiblement la même chose.

---

## Pour aller plus loin

- [Démarrage](demarrage.md) — ça tourne en 60 secondes
- [Déploiement](deploiement.md) — Docker, VPS, PaaS, sauvegardes
- [Architecture](architecture.md) — organisation du code et choix techniques
- [L'algorithme de palette](algorithme.md) — la spécification complète
- [Référence de l'API](api.md) — tous les points d'entrée
- [Sécurité](securite.md) — modèle de menace, audit et durcissement
- [Contribuer](contribuer.md) — comment aider
