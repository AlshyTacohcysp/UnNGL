# L'algorithme de palette, en entier

**Version 1.0.0.** Cette page est la spécification. L'implémentation de référence
est [`src/lib/palette/extract.ts`](../../src/lib/palette/extract.ts) — le même
fichier qu'importent le navigateur et le serveur. Il existe un bac à sable
interactif sur [`/algorithm`](https://unngl.link/algorithm) qui l'exécute dans votre navigateur, et
une suite de tests avec une empreinte de référence, de sorte que toute
modification de la sortie fasse échouer l'intégration continue.

L'intérêt de tout publier est simple : **un indice que l'on ne peut pas vérifier
est un indice auquel on ne peut pas faire confiance.** Si vous prétendez dire à
des gens que six codes hexadécimaux viennent d'une photo précise, le processus
qui les a produits doit être vérifiable par quelqu'un qui ne nous fait pas confiance.

---

## Contrat

```
extractPalette(data: octets RGBA, width: number, height: number) -> {
  colors:  string[6],   // "#rrggbb", la plus dominante en premier
  primary: string,      // == colors[0]
  weight:  number       // 0..1, 3 décimales : part de la masse pondérée dans colors[0]
}
```

Pure. Sans DOM, sans E/S, sans aléa, sans horloge, sans réseau. mêmes octets
d'entrée, même sortie, sur n'importe quelle machine, dans n'importe quel moteur
JavaScript, pour toujours.

### Constantes

| Nom | Valeur | Signification |
|---|---|---|
| `PALETTE_SIZE` | `6` | combien de couleurs. La palette *entière*, pas un aperçu. |
| `SAMPLE_GRID` | `64` | la grille de rééchantillonnage fait 64 × 64 |
| `LONG_EDGE` | `256` | la source est réduite par filtre box à au plus cette taille |
| `MIN_ALPHA` | `0.5` | les échantillons sous cette opacité sont totalement ignorés |
| `CHROMA_FLOOR` | `0.35` | chaque échantillon conserve au moins cette part de son poids |
| `CHROMA_REF` | `0.16` | chroma auquel un échantillon obtient son poids chromatique complet |
| `KMEANS_ITERATIONS` | `24` | budget d'itérations fixe, non basé sur un epsilon |
| `MERGE_DISTANCE` | `0.01` | deux groupes plus proches que cela en OKLab sont fusionnés |
| `CHROMA_OUTLIER` | `0.012` | les groupes sous ce chroma sont écartés comme valeurs aberrantes |
| `MAX_OUTLIER_WEIGHT` | `0.4` | …sauf si cela écarterait plus de 40 % du poids |

Chacune de ces valeurs est publique et versionnée. En modifier une seule impose
un changement de version majeure et un nouveau `ALGORITHM_VERSION`.

---

## Étape 1 — sRGB → linéaire → OKLab

Regrouper des couleurs dans l'espace sRGB serait une erreur : le sRGB n'est pas
perceptivement uniforme, donc « couleur la plus proche » en RGB n'est pas
« couleur la plus proche » pour l'œil humain. Tout se fait en **OKLab** (Björn
Ottosson, 2020).

**sRGB → linéaire** (fonction de transfert IEC 61966-2-1) :

```
c_lin = c ≤ 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ^ 2.4
```

**sRGB linéaire → OKLab** : on prend la racine cubique des réponses coniques
LMS, puis on applique M2.

```
l = (0.4122214708·r + 0.5363325363·g + 0.0514459929·b) ^ (1/3)
m = (0.2119034982·r + 0.6806995451·g + 0.1073969566·b) ^ (1/3)
s = (0.0883024619·r + 0.2817188376·g + 0.6299787005·b) ^ (1/3)

L =  0.2104542553·l + 0.7936177850·m − 0.0040720468·s
a =  1.9779984951·l − 2.4285922050·m + 0.4505937099·s
b =  0.0259040371·l + 0.7827717662·m − 0.8086757660·s
```

Le **chroma** vaut `C = hypot(a, b)` — le degré de couleur d'un échantillon,
indépendamment de la clarté.

## Étape 2 — Rééchantillonnage déterministe

L'image est réduite à un nombre **fixe** d'échantillons : le temps de calcul et
la sortie ne dépendent donc jamais des dimensions d'entrée.

1. **Filtre box** : la source est réduite à au plus `LONG_EDGE` (256) sur son
   côté le plus long. La moyenne se calcule en **alpha prémultiplié**, afin que
   les bords transparents ne fassent pas couler du noir vers l'intérieur. Si
   l'image est déjà assez petite, cette étape est entièrement sautée.
2. **Échantillonnage d'une grille 64 × 64.** Chaque cellule de la grille est
   réduite par filtre box en un échantillon. Si une cellule est totalement
   transparente, elle est ignorée — un pixel transparent n'a pas de couleur, et
   lui en inventer une biaiserait le résultat.
3. On **démultiplie l'alpha** de la cellule survivante, on convertit en OKLab, et
   on calcule son poids :

```
alpha = opacité moyenne de la cellule
si alpha < 0.5          -> ignorer la cellule
C      = chroma(lab)
poids  = alpha × (0.35 + 0.65 × min(1, C / 0.16))
```

**Pourquoi cette biaiserie chromatique.** Sans elle, un portrait est surtout fait
de fond — peau, ciel, murs — et les six emplacements se remplissent de beiges et
de gris. L'indice cesse d'être un signal « regardez cette personne ». Le plancher
signifie qu'un pixel gris compte toujours, à 35 % de son poids d'opacité : une
vraie image en niveaux de gris produit donc une palette grise ; la biaiserie
empêche seulement le gris de *dominer*.

Résultat : exactement 4096 échantillons (moins seulement si des cellules entières
étaient transparentes), chacun un triplet OKLab plus un poids. Tout en
`Float64Array`.

## Étape 3 — k-means pondéré déterministe

Six groupes. Chaque source d'aléa est éliminée.

**Initialisation — point le plus éloigné :**

1. Le premier centre est l'échantillon de **poids le plus élevé**. Les égalités
   se tranchent par `L` le plus bas, puis `a` le plus bas.
2. Chaque centre suivant est l'échantillon **le plus éloigné de tous les centres
   déjà choisis**, selon la métrique ci-dessous. Les égalités vont à l'indice le
   plus bas.

**La métrique** accentue le chroma d'un facteur 1,4 :

```
d² = ΔL² + (1,4·Δa)² + (1,4·Δb)²
```

Deux couleurs de même clarté mais de teintes différentes sont bien plus
distingables que deux nuances du même gris, et la métrique le dit.

Les **itérations de Lloyd** s'exécutent pendant un budget **fixe de 24
itérations**, et non jusqu'à convergence. Une sortie anticipée fondée sur un
epsilon est la manière classique dont deux machines finissent par diverger sur une
frontière en virgule flottante ; un budget fixe ne le peut pas. Les affectations
et le recalcul des centres se font en `f64`, et l'arrondi n'a lieu qu'une seule
fois, tout à la fin.

Les groupes de poids nul sont écartés.

## Étape 4 — Fusion, élimination, ordre

**Fusion.** Deux centres distants de moins de `MERGE_DISTANCE` (0,01) en OKLab
sont combinés en leur position pondérée par les poids. 0,01 représente environ
0,6 % de la diagonale de l'espace gamut unitaire — en dessous, deux couleurs
« différentes » sont la même couleur pour un humain. Après fusion, il peut rester
moins de six.

**Élimination des valeurs aberrantes.** Tout centre dont le chroma est inférieur
à `CHROMA_OUTLIER` (0,012) est écarté — la petite tache saturée qui se trouve par
hasard dans la photo, comme la voiture rouge sur une photo grise. Mais si les
écarter devait supprimer **plus de 40 %** du poids total, ces « valeurs
aberrantes » étaient en fait l'image : on les remet donc toutes. C'est ce garde-fou
qui empêche une photo presque entièrement grise avec un coin coloré de renvoyer
une palette monochrome.

**Ordre.** Par poids décroissant. Les égalités se tranchent par angle de teinte
(`atan2(b, a)`, 0..360), puis par `L` croissant. Entièrement spécifié, donc l'ordre
est stable.

## Étape 5 — Sortie

Chaque centre est reconverti via OKLab → sRGB linéaire → sRGB, ** borné par
canal** entre 0 et 255, et formaté en `#rrggbb` minuscule. Pas d'alpha, pas de
hex à 8 chiffres, pas de noms de couleurs.

S'il subsiste moins de six centres, les emplacements restants sont remplis par
**répétition de la couleur dominante**. La palette fait toujours exactement six
entrées, donc la mise en page du collage est toujours la même, et une image à
deux couleurs est honnêtement rapportée comme telle plutôt que complétée par du
bruit.

`weight` est la part de `colors[0]` dans la masse pondérée totale, à trois
décimales.

### Cas limites, spécifiés

| Entrée | Sortie |
|---|---|
| image totalement transparente | six × `#000000`, `weight: 0` |
| image monochrome | cette couleur × 6 |
| image en niveaux de gris | des gris (le plancher de chroma les conserve, à poids réduit) |
| 1 × 1 pixel | la couleur de ce pixel × 6 |
| rapport d'aspect extrême | inchangée — la grille fait toujours 64 × 64 |

## Intégrité

Chaque palette est livrée avec une empreinte permettant de vérifier qu'elle n'a
pas été altérée en transit :

```
canonique = {"v":"1.0.0","colors":[...],"weight":0.123}   // ordre des clés fixe
empreinte  = FNV-1a 32 bits(canonique), hex minuscule, 8 caractères
```

La forme canonique fixe à la fois l'ordre des clés et la longueur du tableau :
l'empreinte est donc stable pour toujours. FNV-1a n'est pas une fonction de
hachage cryptographique — c'est une somme de contrôle dont le seul rôle est de
détecter une palette corrompue ou modifiée à la main, et elle ne sert à aucune
décision de sécurité. Tout ce qui compte est vérifié en **recalculant** la
palette depuis l'image, pas en comparant des empreintes.

---

## Comment le serveur vérifie un indice

C'est ce qui rend l'ensemble honnête.

1. Le navigateur de l'expéditeur décode sa photo, exécute `extractPalette`, et lui
   montre immédiatement six couleurs. Il envoie l'image **et** les six valeurs
   hexadécimales.
2. Le serveur décode le **fichier téléversé original** avec son propre décodeur
   (`src/lib/palette/png.ts` — sans dépendance, avec des bornes de taille dures)
   et exécute `extractPalette` sur les vrais pixels.
3. Il compare son résultat à la revendication.
4. **Égal** → l'indice est stocké comme `verified`. **Différent** → stocké comme
   `unverified`, et le lecteur voit que la revendication ne correspondait pas au
   fichier.

La revendication de l'expéditeur n'est jamais prise pour argent comptant, et
l'application n'a pas besoin d'y être pour que ce soit vrai. Quelqu'un pourrait
modifier le navigateur, forger les valeurs hexadécimales, et le serveur
calculerait quand même la vérité à partir des octets reçus.

C'est aussi pourquoi le serveur accepte le PNG : un format dont le chemin de
décodage est entièrement spécifié, sans dépendance, et vérifiable par bornes
avant la moindre allocation.

## Réimplémenter l'algorithme

Si vous voulez contrôler notre travail — et vous le devriez — l'algorithme
représente environ 200 lignes d'arithmétique sans aucune dépendance. Dans
l'ordre :

1. Décodez en RGBA.
2. Filtre box jusqu'à 256 sur le côté long, en alpha prémultiplié.
3. Échantillonnez une grille 64 × 64, en ignorant les cellules sous 0,5 d'opacité.
4. Convertissez en OKLab ; pondérez par `alpha × (0.35 + 0.65·min(1, C/0.16))`.
5. Initialisez 6 groupes par point le plus éloigné ; exécutez 24 itérations de
   Lloyd pondérées avec la métrique chromatique × 1,4.
6. Fusionnez à moins de 0,01 ; écartez chroma < 0,012 sauf si cela dépasse 40 % du
   poids.
7. Triez par poids, puis teinte, puis clarté. Convertissez en sRGB, bornez,
   formatez.
8. Complétez à six par répétition de la couleur dominante.

La suite de tests fige la sortie pour des entrées fixes via une empreinte de
référence (`26d88308`) : une implémentation indépendante qui concorde sur les
fixtures concordera partout.

## Versionnage

`ALGORITHM_VERSION` est stockée sur chaque ligne d'indice. Si l'algorithme change
d'une manière qui altère la sortie, la version change aussi, et les anciens
indices continuent d'être rendus avec la version qui les a produits. Une palette
en `1.0.0` est un fait historique sur une photo, pas un recalcul en attente
d'invalidation par un déploiement.

## Licence

L'algorithme et son implémentation de référence font partie d'UnNGL et sont
sous **AGPL-3.0-or-later**. Réimplémentez-le, traduisez-le, ou utilisez-le dans
votre propre service à code fermé — l'algorithme est une méthode publiée, et seul
le logiciel qui le livre porte l'obligation de copyleft.
