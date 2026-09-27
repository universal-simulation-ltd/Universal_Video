import type { Article } from './types'

const articles: Article[] = [
  {
    id: 'containers-and-codecs',
    title: 'Conteneurs et codecs',
    summary: 'Pourquoi « MP4 » désigne la boîte, et non ce qu’elle contient.',
    group: 'Les bases',
    body: `Un fichier vidéo, ce sont en réalité deux choses qui fonctionnent ensemble : un conteneur et un ou plusieurs codecs.

## Le conteneur

Le conteneur, c’est la boîte. Il renferme la piste image, la piste son et les informations qui les maintiennent synchronisées, comme la durée de chaque image et son emplacement dans le fichier. MP4, MOV et MKV sont des conteneurs. L’extension d’un fichier, par exemple .mp4 ou .mov, vous indique généralement le conteneur, et rien de plus.

## Le codec

Un codec est la méthode qui sert à compresser l’image ou le son pour qu’ils prennent moins de place, puis à les décompresser à la lecture. H.264 (aussi appelé AVC) et H.265 (aussi appelé HEVC) sont des codecs vidéo courants. AAC et Opus sont des codecs audio courants.

C’est pourquoi deux fichiers qui se terminent tous deux par .mp4 peuvent se comporter différemment. L’un peut contenir de la vidéo H.264, que presque tous les appareils savent lire, tandis que l’autre utilise un codec plus récent qu’un ancien téléphone ou téléviseur ne sait pas décoder.

## Ce que Universal Video lit et écrit

Universal Video ouvre les fichiers MP4, M4V et MOV, et produit des fichiers MP4 avec de la vidéo H.264 et du son AAC. Cette combinaison a été choisie parce qu’elle se lit presque partout : sur les téléphones, les ordinateurs et les téléviseurs, ainsi que sur la plupart des sites web et des messageries.

Certains fichiers ne peuvent pas être ouverts :
- **MKV et WebM**, qui utilisent un autre type de conteneur.
- **AVI et WMV**, qui nécessitent en général aussi des codecs absents des navigateurs.
- **Le MP4 fragmenté**, une variante produite par certains enregistreurs d’écran et certaines applications de téléphone.

Si un fichier ne peut pas être ouvert, l’application vous en indique la raison dès que vous l’ajoutez, au lieu d’échouer en cours de route.`,
  },
  {
    id: 'resolution-bitrate-frame-rate',
    title: 'Résolution, débit et fréquence d’images',
    summary: 'Les trois chiffres qui déterminent l’aspect d’une vidéo et sa taille.',
    group: 'Les bases',
    body: `Trois chiffres décrivent l’essentiel de ce qu’il faut savoir sur une vidéo.

## La résolution

La résolution est la taille de chaque image en pixels, notée largeur × hauteur. 1920×1080 est souvent appelé Full HD ou 1080p, 1280×720 correspond au 720p, et 3840×2160 au 4K. Plus de pixels signifie plus de détails, mais aussi davantage de données à stocker pour chaque image.

Le chiffre suivi d’un « p » désigne le petit côté de l’image. Une vidéo 1080p filmée avec un téléphone tenu à la verticale mesure 1080 pixels de large et 1920 de haut.

## La fréquence d’images

La fréquence d’images indique combien d’images sont affichées chaque seconde, en images par seconde (ips). Le cinéma est traditionnellement à 24 ips, beaucoup de vidéos sont à 25 ou 30 ips, et les téléphones filment souvent à 60 ips pour des mouvements plus fluides. Doubler la fréquence d’images revient à peu près à doubler le nombre d’images à stocker.

## Le débit

Le débit est la quantité de données consacrée à chaque seconde de vidéo, généralement exprimée en mégabits par seconde (Mbit/s). C’est le chiffre qui détermine le plus directement la taille du fichier : une minute à 8 Mbit/s représente environ 60 Mo, quelle que soit la résolution.

À débit égal, une image plus grande dispose de moins de bits par pixel, et peut donc paraître moins nette qu’une image plus petite. C’est pourquoi réduire la résolution est souvent le moyen le plus efficace d’alléger un fichier sans qu’il paraisse dégradé.

## Comment Universal Video les utilise

Vous choisissez la résolution et l’un des trois réglages de qualité : **Smaller** (le plus léger), **Balanced** (équilibré) ou **Best** (la meilleure qualité). Aucun débit ne vous est demandé. L’application le calcule à partir de la taille de l’image et de la fréquence d’images, si bien qu’un clip 4K reçoit un budget plus important qu’un clip 720p avec le même réglage. La fréquence d’images reste celle de votre vidéo d’origine.

La taille prévue du fichier final est calculée à partir de ces réglages et affichée sur le bouton d’exportation avant même que vous appuyiez dessus.`,
  },
  {
    id: 'why-video-files-are-big',
    title: 'Pourquoi les fichiers vidéo sont si lourds',
    summary: 'Ce que fait la compression, et pourquoi réduire une vidéo est toujours un compromis.',
    group: 'Les bases',
    body: `Une vidéo, c’est une grande quantité d’images. Une seule image 1080p compte un peu plus de deux millions de pixels, et chacun a besoin d’une couleur. Sans aucune compression, une seconde de vidéo 1080p à 30 images par seconde occuperait environ 190 Mo, et une heure remplirait la plupart des ordinateurs portables.

## Comment la compression réduit tout cela

Les codecs vidéo comme H.264 reposent sur deux grandes idées.

- **À l’intérieur d’une image**, ils consacrent moins de détails aux zones où l’œil a peu de chances de remarquer la différence, comme les étendues de ciel uniformes ou les textures fines.
- **D’une image à l’autre**, ils ne stockent que ce qui a changé. Dans la plupart des vidéos, une grande partie de chaque image est identique à la précédente : une image peut donc souvent se résumer à « la précédente, avec ces éléments déplacés ».

Les images stockées en entier s’appellent des images clés. Les images intermédiaires en dépendent, c’est pourquoi un logiciel de montage doit commencer le décodage à partir d’une image clé, même si vous coupez entre deux.

## Pourquoi le réencodage allège les fichiers

Les téléphones et les caméras enregistrent à un débit élevé pour suivre le rythme en temps réel et conserver beaucoup de détails. Réencoder à un débit plus faible, à une résolution plus petite, ou les deux, permet souvent de diviser la taille d’un fichier par plusieurs, tout en gardant un bon rendu sur l’écran d’un téléphone ou d’un ordinateur portable.

C’est toutefois toujours un compromis. Chaque compression élimine définitivement une partie des détails, et compresser à nouveau ne les fait pas revenir. Conservez l’original si vous risquez d’avoir besoin de la qualité maximale plus tard.

## Quand un fichier grossit

Le réencodage ne réduit pas toujours la taille. Si l’original était déjà fortement compressé et que vous choisissez une résolution plus élevée ou le réglage **Best**, le nouveau fichier peut être plus lourd. Universal Video affiche la taille prévue avant l’exportation, ce qui vous permet de le constater avant de vous lancer.`,
  },
  {
    id: 'where-the-work-happens',
    title: 'Où votre vidéo est traitée',
    summary: 'Chaque étape se déroule dans votre navigateur, sur votre appareil.',
    group: 'Fonctionnement',
    body: `Universal Video effectue tout son travail dans l’onglet de navigateur que vous utilisez. Votre vidéo est ouverte, décodée, montée et réencodée sur votre propre appareil, et le fichier final y est enregistré directement.

## Comment est-ce possible ?

Les navigateurs modernes intègrent des encodeurs et des décodeurs vidéo, ceux-là mêmes qu’ils utilisent pour les appels vidéo. Une fonctionnalité appelée WebCodecs permet à une page web de s’en servir directement. Universal Video utilise ces codecs intégrés pour l’image et le son, et son propre code open source pour lire et écrire le fichier MP4 qui les entoure.

Comme les codecs font déjà partie de votre navigateur, il n’y a pas de gros téléchargement avant de commencer, et rien à installer.

## Ce que cela change concrètement

- **Aucun envoi, aucune file d’attente.** Rien ne transite par un serveur : la durée d’une exportation dépend uniquement de votre appareil.
- **Aucune limite de taille imposée par nous.** La limite, c’est la mémoire de votre appareil. L’article consacré aux fichiers volumineux explique comment cela fonctionne.
- **Cela fonctionne hors ligne.** Une fois l’application chargée, vous pouvez couper votre connexion internet et continuer à découper, couper, assembler et exporter une vidéo. C’est aussi le moyen le plus simple de vérifier que rien n’est envoyé nulle part.

## Quels navigateurs conviennent

Universal Video est testé dans Chrome et Edge sur ordinateur. Safari 16.4 et les versions ultérieures intègrent WebCodecs et pourraient fonctionner, mais l’application n’y a pas été testée. Firefox ne fournit pas actuellement l’encodeur H.264 dont l’application a besoin : elle vous le signale donc dès votre arrivée, plutôt qu’après une longue attente.

## Bon à savoir

- Les vidéos que vous ajoutez sont conservées par l’onglet du navigateur. Actualiser ou fermer l’onglet met fin à votre montage : exportez avant de le faire.
- Pendant une exportation, le temps restant est calculé d’après la vitesse réelle d’encodage de votre appareil, et il devient donc plus précis au fil de l’avancement.
- Une résolution de sortie plus petite est plus rapide à encoder, en plus d’être plus légère.`,
  },
  {
    id: 'export-settings',
    title: 'Choisir vos réglages d’exportation',
    summary: 'Format de l’image, résolution, qualité, son, et un ou plusieurs fichiers.',
    group: 'Fonctionnement',
    body: `Les réglages du panneau d’exportation s’appliquent à l’ensemble de la vidéo. Voici le rôle de chacun.

## Le cadre

Le cadre est le format dans lequel la vidéo finale est écrite. Vous pouvez conserver la taille d’origine, choisir 1920×1080 (paysage), 1080×1920 (portrait) ou 1080×1080 (carré), ou saisir votre propre taille.

Si un clip n’a pas le même format que le cadre, il est centré et le reste est rempli de noir. Rien n’est jamais rogné : un clip filmé à la verticale placé dans un cadre paysage conserve toute son image et gagne une bande noire de chaque côté. L’aperçu montre exactement ce qui sera produit.

Les deux côtés comptent toujours un nombre pair de pixels, car le H.264 fonctionne par blocs et de nombreux encodeurs refusent les tailles impaires.

## La résolution

Conservez la taille d’origine, ou plafonnez-la à 4K, 1440p, 1080p, 720p ou 480p. Le chiffre désigne le petit côté : un clip vertical plafonné à 1080p sort donc avec 1080 pixels de large. Une vidéo déjà plus petite que le plafond garde sa taille au lieu d’être agrandie.

## La qualité

- **Smaller** (le plus léger) compresse au maximum. Convient pour l’envoi et le web.
- **Balanced** (équilibré) est le réglage par défaut. Nettement plus léger, et toujours fidèle à l’original.
- **Best** (la meilleure qualité) conserve le plus de détails, et produit le fichier le plus lourd des trois.

## Le son

Conservez le son et choisissez son débit (96, 128, 192 ou 256 kbit/s), ou désactivez-le pour obtenir une vidéo muette, plus légère.

## Une vidéo ou plusieurs fichiers

Si vous avez coupé votre vidéo en plusieurs morceaux, vous pouvez l’exporter en une seule vidéo ou en fichiers séparés (**Separate files**). Chaque morceau est alors écrit dans son propre MP4, et tous arrivent ensemble dans un seul fichier zip, numérotés pour se ranger dans l’ordre de vos coupes. Dans Chrome et Edge, on vous demande d’abord où enregistrer le zip, et chaque morceau y est écrit dès qu’il est terminé.

Les fichiers séparés ne sont pas disponibles lorsque des clips sont superposés sur plusieurs pistes, car deux clips lus au même moment ne peuvent pas être répartis dans un fichier chacun.

## Avant d’exporter

La taille prévue du fichier est affichée sur le bouton d’exportation. Si l’exportation ne tient pas dans la mémoire de votre appareil, l’application vous le dit avant de commencer et propose un réglage qui conviendrait.`,
  },
  {
    id: 'big-files',
    title: 'Fichiers volumineux et limite de mémoire',
    summary: 'Pourquoi la taille du résultat compte davantage que celle de l’original.',
    group: 'Fonctionnement',
    body: `Comme Universal Video fonctionne dans votre navigateur, il est limité par la quantité de mémoire dont le navigateur dispose. Il n’y a pas de limite d’envoi, puisqu’il n’y a pas d’envoi, mais il existe tout de même un plafond.

## Ce qui occupe la mémoire

Chaque clip de la timeline est chargé entièrement en mémoire, et la vidéo finale y est également assemblée avant d’être enregistrée. Un montage de cinq clips nécessite donc de la place pour les cinq, plus le résultat.

## C’est le résultat qui compte

Le plafond se situe autour d’un gigaoctet environ de vidéo finale sur un ordinateur, et moins sur un téléphone. Ce qui compte le plus, c’est la taille du fichier que vous produisez, et non celle du fichier de départ. Réduire une vidéo de 2 Go à 300 Mo peut parfaitement fonctionner, alors que transformer une vidéo de 400 Mo en un fichier de 5 Go n’y parviendra pas.

## Refusé avant, pas après

Quand un onglet de navigateur manque de mémoire, il se ferme généralement sans laisser la moindre chance d’enregistrer. L’application vérifie donc d’abord :

1. Lorsque vous ajoutez une vidéo, elle ne lit que la petite partie du fichier qui la décrit, si bien que même un très gros fichier est analysé presque instantanément.
2. Elle prévoit la taille du résultat à partir de vos réglages.
3. Si cela ne tient pas, elle vous prévient avant de commencer et propose un réglage plus léger qui conviendrait.

Pendant l’exportation, vous voyez combien d’images sont traitées, la taille actuelle du fichier par rapport à la prévision, et le temps restant.

## Dépasser le plafond

- Baissez la résolution ou choisissez un réglage de qualité plus léger.
- Exportez en plusieurs morceaux. Dans Chrome et Edge, les fichiers séparés (**Separate files**) sont écrits un par un dans un zip sur votre disque : un seul morceau doit tenir en mémoire, et l’ensemble peut être aussi long que vous le souhaitez.
- Fermez les autres onglets et programmes gourmands avant une grosse exportation.`,
  },
  {
    id: 'what-leaves-your-device',
    title: 'Ce qui quitte votre appareil',
    summary: 'Votre vidéo, jamais. Voici la courte liste de ce qui en sort.',
    group: 'Confidentialité et sécurité',
    body: `Votre vidéo n’est jamais envoyée. Elle est ouverte, montée et exportée par votre propre navigateur, et aucune option de l’application ne l’envoie où que ce soit. Il n’existe pas non plus de solution de repli qui confierait les gros fichiers à un serveur.

## Ce pour quoi l’application utilise internet

Quelques petites choses passent par internet, et aucune ne contient votre vidéo ni la moindre information à son sujet.

- **Le chargement de l’application**, ainsi que les notes sur les nouveautés de chaque mise à jour.
- **La vidéo d’exemple**, si vous choisissez de l’essayer. Il s’agit d’un téléchargement vers vous, pas d’un envoi de votre part.
- **La connexion avec un Universal ID**, uniquement si vous le souhaitez. Rien dans Universal Video n’exige de compte.
- **Une note indiquant que l’application a été ouverte**, envoyée une fois par visite si vous êtes connecté, pour que l’activité de votre compte soit exacte. Elle ne contient ni le nom, ni la durée, ni la taille d’aucune vidéo.
- **Un signal « en cours d’utilisation »**, envoyé toutes les 45 secondes tant que l’application est ouverte et affichée, pour qu’elle puisse indiquer combien de personnes l’utilisent. Il contient le nom de l’application, un identifiant aléatoire créé sur cet appareil, et votre compte si vous êtes connecté. Il ne dit rien de ce sur quoi vous travaillez.

Il n’y a aucun outil d’analyse tiers, aucune publicité et aucun script de suivi.

## Fichiers récents

Pour que vous puissiez reprendre là où vous en étiez, l’application conserve vos vidéos les plus récentes dans le stockage de votre navigateur, sur cet appareil. Elle en garde quatre au maximum, ne conserve jamais un fichier de plus de 100 Mo, et ne dépasse pas 250 Mo au total. Les vidéos plus lourdes sont ouvertes, mais pas mémorisées.

Ces copies ne quittent jamais votre appareil. Vous pouvez supprimer chacune d’elles avec la croix située à côté dans la liste, et effacer les données de votre navigateur pour ce site les supprime toutes.

## Vérifier par vous-même

Chargez l’application, coupez votre Wi-Fi, puis montez une vidéo. Découper, couper, assembler et exporter continuent de fonctionner, car rien de tout cela ne se passait ailleurs.`,
  },
]

export default articles
