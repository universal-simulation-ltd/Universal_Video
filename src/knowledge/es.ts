import type { Article } from './types'

const articles: Article[] = [
  {
    id: 'containers-and-codecs',
    title: 'Contenedores y códecs',
    summary: 'Por qué «MP4» indica la caja, no lo que hay dentro.',
    group: 'Lo básico',
    body: `Un archivo de vídeo son en realidad dos cosas que funcionan juntas: un contenedor y uno o varios códecs.

## El contenedor

El contenedor es la caja. Guarda la pista de imagen, la pista de sonido y la información que las mantiene sincronizadas, como cuánto dura cada fotograma y dónde se encuentra cada uno dentro del archivo. MP4, MOV y MKV son contenedores. La extensión de un archivo, como .mp4 o .mov, normalmente le indica el contenedor y nada más.

## El códec

Un códec es el método que se usa para comprimir la imagen o el sonido de modo que ocupen menos espacio, y para descomprimirlos de nuevo al reproducirlos. H.264 (también llamado AVC) y H.265 (también llamado HEVC) son códecs de vídeo habituales. AAC y Opus son códecs de audio habituales.

Por eso dos archivos que terminan en .mp4 pueden comportarse de forma distinta. Uno puede contener vídeo H.264, que casi cualquier dispositivo reproduce, mientras que otro usa un códec más reciente que un teléfono o un televisor antiguo no puede descodificar.

## Qué lee y qué escribe Universal Video

Universal Video abre archivos MP4, M4V y MOV, y genera MP4 con vídeo H.264 y sonido AAC. Se usa esa combinación porque se reproduce casi en cualquier sitio: en teléfonos, ordenadores y televisores, y en la mayoría de sitios web y aplicaciones de mensajería.

Hay archivos que no puede abrir:
- **MKV y WebM**, que usan otro tipo de contenedor.
- **AVI y WMV**, que normalmente también necesitan códecs que los navegadores no incluyen.
- **MP4 fragmentado**, una variante que generan algunas grabadoras de pantalla y aplicaciones de teléfono.

Si un archivo no se puede abrir, la aplicación le explica el motivo en cuanto lo añade, en lugar de fallar a mitad del proceso.`,
  },
  {
    id: 'resolution-bitrate-frame-rate',
    title: 'Resolución, tasa de bits y fotogramas por segundo',
    summary: 'Las tres cifras que deciden el aspecto de un vídeo y su tamaño.',
    group: 'Lo básico',
    body: `Tres cifras describen casi todo lo que necesita saber sobre un vídeo.

## Resolución

La resolución es el tamaño de cada fotograma en píxeles, expresado como ancho por alto. 1920×1080 suele llamarse Full HD o 1080p, 1280×720 es 720p y 3840×2160 es 4K. Más píxeles significan más detalle, pero también más datos que guardar en cada fotograma.

El número con la «p» indica el lado más corto de la imagen. Un vídeo 1080p grabado con el teléfono en vertical mide 1080 píxeles de ancho y 1920 de alto.

## Fotogramas por segundo

La frecuencia de fotogramas indica cuántas imágenes se muestran cada segundo, en fotogramas por segundo (fps). El cine suele ir a 24 fps, mucho vídeo va a 25 o 30 fps y los teléfonos graban a menudo a 60 fps para lograr un movimiento más fluido. El doble de fotogramas por segundo supone aproximadamente el doble de imágenes que guardar.

## Tasa de bits

La tasa de bits es la cantidad de datos que se dedica a cada segundo de vídeo, normalmente en megabits por segundo (Mbps). Es la cifra que más directamente determina el tamaño del archivo: un minuto a 8 Mbps ocupa unos 60 MB, sea cual sea la resolución.

Con la misma tasa de bits, una imagen más grande dispone de menos bits por píxel, así que puede verse peor que una más pequeña. Por eso reducir la resolución suele ser la forma más eficaz de aligerar un archivo sin que se note tosco.

## Cómo las usa Universal Video

Usted elige la resolución y uno de los tres ajustes de calidad: **Smaller** (más ligero), **Balanced** (equilibrado) o **Best** (máxima calidad). No se le pide ninguna tasa de bits. La aplicación la calcula a partir del tamaño del fotograma y de los fotogramas por segundo, de modo que un clip 4K recibe más presupuesto que uno de 720p con el mismo ajuste. Los fotogramas por segundo se mantienen como en el vídeo original.

El tamaño previsto del archivo final se calcula con estos ajustes y aparece en el botón de exportar antes de que lo pulse.`,
  },
  {
    id: 'why-video-files-are-big',
    title: 'Por qué los archivos de vídeo ocupan tanto',
    summary: 'Qué hace la compresión y por qué reducir un vídeo siempre implica ceder algo.',
    group: 'Lo básico',
    body: `Un vídeo son muchísimas imágenes. Un solo fotograma 1080p tiene algo más de dos millones de píxeles, y cada uno necesita un color. Sin ninguna compresión, un segundo de vídeo 1080p a 30 fotogramas por segundo ocuparía unos 190 MB, y una hora llenaría la mayoría de los portátiles.

## Cómo lo reduce la compresión

Los códecs de vídeo como H.264 se basan en dos ideas principales.

- **Dentro de un fotograma**, dedican menos detalle a las zonas donde es poco probable que el ojo note la diferencia, como un cielo uniforme o las texturas finas.
- **Entre fotogramas**, solo guardan lo que ha cambiado. En la mayoría de los vídeos, buena parte de cada imagen es igual a la anterior, así que un fotograma a menudo puede describirse como «el anterior, con estas partes movidas».

Los fotogramas que se guardan completos se llaman fotogramas clave. Los intermedios dependen de ellos, y por eso un programa de edición tiene que empezar a descodificar desde un fotograma clave aunque usted recorte en un punto intermedio.

## Por qué volver a codificar reduce el tamaño

Los teléfonos y las cámaras graban con una tasa de bits alta para poder seguir el ritmo en tiempo real y conservar mucho detalle. Volver a codificar con una tasa de bits más baja, una resolución menor o ambas cosas suele reducir varias veces el tamaño de un archivo sin que deje de verse bien en la pantalla de un teléfono o un portátil.

Aun así, siempre se cede algo. Cada vez que se comprime un vídeo se pierde definitivamente parte del detalle, y comprimirlo otra vez no lo recupera. Conserve el original si puede necesitar la máxima calidad más adelante.

## Cuando un archivo crece

Volver a codificar no siempre reduce el tamaño. Si el original ya estaba muy comprimido y usted elige una resolución mayor o el ajuste **Best**, el archivo nuevo puede ocupar más. Universal Video muestra el tamaño previsto antes de exportar, para que pueda verlo antes de decidirse.`,
  },
  {
    id: 'where-the-work-happens',
    title: 'Dónde se procesa su vídeo',
    summary: 'Todos los pasos ocurren en su navegador, en su dispositivo.',
    group: 'Cómo funciona',
    body: `Universal Video hace todo su trabajo dentro de la pestaña del navegador que usted está usando. Su vídeo se abre, se descodifica, se edita y se vuelve a codificar en su propio dispositivo, y el archivo final se guarda directamente en él.

## Cómo es posible

Los navegadores modernos llevan incorporados codificadores y descodificadores de vídeo, los mismos que usan para las videollamadas. Una función del navegador llamada WebCodecs permite que una página web los use directamente. Universal Video utiliza estos códecs integrados para la imagen y el sonido, y su propio código abierto para leer y escribir el archivo MP4 que los envuelve.

Como los códecs ya forman parte de su navegador, no hay una gran descarga antes de empezar y no hace falta instalar nada.

## Qué significa en la práctica

- **Sin subidas ni colas.** Nada tiene que viajar a un servidor y volver, así que lo que tarda una exportación depende de su propio dispositivo.
- **Sin límite de tamaño impuesto por nosotros.** El límite es la memoria de su dispositivo. El artículo sobre archivos grandes explica cómo funciona.
- **Funciona sin conexión.** Una vez cargada la aplicación, puede desconectarse de internet y seguir recortando, cortando, uniendo y exportando vídeos. Es también la forma más sencilla de comprobar que no se envía nada a ninguna parte.

## Qué navegadores funcionan

Universal Video está probado en Chrome y Edge en ordenador. Safari 16.4 y versiones posteriores incluyen WebCodecs y podrían funcionar, pero no se ha probado en él. Firefox no ofrece actualmente el codificador H.264 que necesita la aplicación, así que esta se lo indica nada más llegar, en lugar de tras una larga espera.

## Conviene saber

- Los vídeos que añade los mantiene la pestaña del navegador. Recargar o cerrar la pestaña pone fin a su edición, así que exporte antes de hacerlo.
- Durante una exportación, el tiempo restante se calcula según la velocidad real a la que codifica su dispositivo, por lo que se vuelve más preciso a medida que avanza.
- Una resolución de salida menor se codifica más rápido, además de ocupar menos.`,
  },
  {
    id: 'export-settings',
    title: 'Cómo elegir los ajustes de exportación',
    summary: 'Formato del encuadre, resolución, calidad, sonido y uno o varios archivos.',
    group: 'Cómo funciona',
    body: `Los ajustes del panel de exportación se aplican a todo el vídeo. Esto es lo que hace cada uno.

## Encuadre

El encuadre es la forma con la que se escribe el vídeo final. Puede mantener el tamaño con el que se grabó, elegir 1920×1080 (horizontal), 1080×1920 (vertical) o 1080×1080 (cuadrado), o escribir un tamaño propio.

Si un clip tiene una forma distinta a la del encuadre, se centra y el resto se rellena de negro. Nunca se recorta nada: un clip vertical en un encuadre horizontal conserva toda su imagen y gana una franja negra a cada lado. La vista previa muestra exactamente lo que se va a generar.

Los dos lados tienen siempre un número par de píxeles, porque H.264 trabaja por bloques y muchos codificadores rechazan los tamaños impares.

## Resolución

Mantenga el tamaño original o limítelo a 4K, 1440p, 1080p, 720p o 480p. El número indica el lado más corto, así que un clip vertical limitado a 1080p sale con 1080 píxeles de ancho. Un vídeo que ya es más pequeño que el límite conserva su tamaño en lugar de ampliarse.

## Calidad

- **Smaller** (más ligero) comprime al máximo. Suficiente para enviar y para la web.
- **Balanced** (equilibrado) es el ajuste predeterminado. Bastante más ligero y todavía fiel al original.
- **Best** (máxima calidad) conserva el mayor detalle y genera el archivo más grande de los tres.

## Sonido

Mantenga el sonido y elija su tasa de bits (96, 128, 192 o 256 kbps), o desactívelo para generar un vídeo sin sonido, que ocupa menos.

## Un vídeo o archivos separados

Si ha cortado el vídeo en varias partes, puede exportarlo como un solo vídeo o como archivos separados (**Separate files**). En ese caso, cada parte se escribe como su propio MP4 y todas llegan juntas en un único archivo zip, numeradas para que se ordenen igual que sus cortes. En Chrome y Edge se le pregunta primero dónde guardar el zip, y cada parte se escribe en él en cuanto termina.

Los archivos separados no están disponibles cuando hay clips apilados en más de una pista, porque dos clips que se reproducen a la vez no pueden repartirse en un archivo cada uno.

## Antes de exportar

El tamaño previsto del archivo aparece en el botón de exportar. Si la exportación no cabe en la memoria de su dispositivo, la aplicación se lo indica antes de empezar y le propone un ajuste que sí cabría.`,
  },
  {
    id: 'big-files',
    title: 'Archivos grandes y el límite de memoria',
    summary: 'Por qué importa más el tamaño del resultado que el del original.',
    group: 'Cómo funciona',
    body: `Como Universal Video funciona dentro de su navegador, está limitado por la memoria que el navegador puede usar. No hay límite de subida, porque no hay subida, pero sigue habiendo un techo.

## Qué ocupa la memoria

Cada clip de la línea de tiempo se carga entero en la memoria, y el vídeo final también se monta en ella antes de guardarse. Así que una edición de cinco clips necesita espacio para los cinco y además para el resultado.

## Lo que cuenta es el resultado

El techo ronda más o menos un gigabyte de vídeo final en un ordenador, y menos en un teléfono. Lo que más importa es el tamaño del archivo que está generando, no el del archivo de partida. Reducir un vídeo de 2 GB a 300 MB puede funcionar perfectamente, mientras que convertir uno de 400 MB en uno de 5 GB no.

## Se rechaza antes, no después

Cuando una pestaña del navegador se queda sin memoria, normalmente se cierra sin dar ocasión de guardar nada. Por eso la aplicación comprueba primero:

1. Al añadir un vídeo, lee solo la pequeña parte del archivo que lo describe, de modo que incluso un archivo muy grande se analiza casi al instante.
2. Calcula el tamaño previsto del resultado según sus ajustes.
3. Si no cabría, se lo dice antes de empezar y le ofrece un ajuste más ligero que sí cabe.

Durante la exportación puede ver cuántos fotogramas se han procesado, cuánto ocupa el archivo hasta el momento frente a lo previsto y cuánto falta.

## Cómo superar el techo

- Baje la resolución o elija un ajuste de calidad más ligero.
- Exporte por partes. En Chrome y Edge, los archivos separados (**Separate files**) se escriben de uno en uno en un zip en su disco, así que solo una parte tiene que caber en la memoria y el conjunto puede ser tan largo como quiera.
- Cierre otras pestañas y programas pesados antes de una exportación grande.`,
  },
  {
    id: 'what-leaves-your-device',
    title: 'Qué sale de su dispositivo',
    summary: 'Su vídeo, nunca. Esta es la breve lista de lo que sí sale.',
    group: 'Privacidad y seguridad',
    body: `Su vídeo nunca se sube. Lo abre, lo edita y lo exporta su propio navegador, y ninguna opción de la aplicación lo envía a ninguna parte. Tampoco existe una alternativa que mande los archivos grandes a un servidor.

## Para qué usa internet la aplicación

Algunas cosas pequeñas sí usan internet, y ninguna incluye su vídeo ni información sobre él.

- **Cargar la aplicación**, y las notas sobre las novedades de cada actualización.
- **El vídeo de ejemplo**, si decide probarlo. Es una descarga hacia usted, no una subida suya.
- **Iniciar sesión con un Universal ID**, solo si usted quiere. Nada en Universal Video necesita una cuenta.
- **Un aviso de que se abrió la aplicación**, enviado una vez por visita si ha iniciado sesión, para que la actividad de su cuenta sea correcta. No incluye el nombre, la duración ni el tamaño de ningún vídeo.
- **Una señal de «en uso»**, enviada cada 45 segundos mientras la aplicación está abierta y en pantalla, para poder mostrar cuántas personas la usan. Contiene el nombre de la aplicación, un identificador aleatorio creado en este dispositivo y su cuenta si ha iniciado sesión. No dice nada de aquello en lo que está trabajando.

No hay analítica de terceros, publicidad ni scripts de seguimiento.

## Archivos recientes

Para que pueda retomar su trabajo, la aplicación guarda sus vídeos más recientes en el almacenamiento de su propio navegador, en este dispositivo. Guarda cuatro como máximo, nunca guarda un archivo de más de 100 MB y no supera los 250 MB en total. Los vídeos más grandes se abren, pero no se recuerdan.

Estas copias nunca salen de su dispositivo. Puede quitar cualquiera de ellas con la cruz que aparece a su lado en la lista, y borrar los datos del navegador para este sitio las elimina todas.

## Compruébelo usted mismo

Cargue la aplicación, desactive la wifi y edite un vídeo. Recortar, cortar, unir y exportar siguen funcionando, porque nada de eso ocurría en otro lugar.`,
  },
]

export default articles
