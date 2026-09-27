import type { Article } from './types'

const articles: Article[] = [
  {
    id: 'containers-and-codecs',
    title: 'Contenitori e codec',
    summary: 'Perché «MP4» indica la scatola, non quello che c’è dentro.',
    group: 'Le basi',
    body: `Un file video è in realtà fatto di due cose che lavorano insieme: un contenitore e uno o più codec.

## Il contenitore

Il contenitore è la scatola. Contiene la traccia video, la traccia audio e le informazioni che le tengono sincronizzate, come la durata di ogni fotogramma e la sua posizione nel file. MP4, MOV e MKV sono contenitori. L’estensione di un file, come .mp4 o .mov, di solito ti dice il contenitore e nient’altro.

## Il codec

Un codec è il metodo usato per comprimere l’immagine o il suono in modo che occupino meno spazio, e per decomprimerli di nuovo durante la riproduzione. H.264 (detto anche AVC) e H.265 (detto anche HEVC) sono codec video comuni. AAC e Opus sono codec audio comuni.

Ecco perché due file che finiscono entrambi con .mp4 possono comportarsi in modo diverso. Uno può contenere video H.264, che quasi tutti i dispositivi riproducono, mentre l’altro usa un codec più recente che un vecchio telefono o televisore non riesce a decodificare.

## Cosa legge e cosa scrive Universal Video

Universal Video apre file MP4, M4V e MOV e crea file MP4 con video H.264 e audio AAC. Usa questa combinazione perché si riproduce quasi ovunque: su telefoni, computer e televisori, e sulla maggior parte dei siti web e delle app di messaggistica.

Alcuni file non li può aprire:
- **MKV e WebM**, che usano un altro tipo di contenitore.
- **AVI e WMV**, che di solito richiedono anche codec non inclusi nei browser.
- **MP4 frammentato**, una variante prodotta da alcuni registratori dello schermo e da alcune app per telefono.

Se un file non si può aprire, l’app te ne spiega il motivo appena lo aggiungi, invece di bloccarsi a metà lavoro.`,
  },
  {
    id: 'resolution-bitrate-frame-rate',
    title: 'Risoluzione, bitrate e frequenza dei fotogrammi',
    summary: 'I tre numeri che decidono l’aspetto di un video e quanto è grande.',
    group: 'Le basi',
    body: `Tre numeri descrivono quasi tutto quello che ti serve sapere su un video.

## Risoluzione

La risoluzione è la dimensione di ogni fotogramma in pixel, scritta come larghezza per altezza. 1920×1080 viene spesso chiamato Full HD o 1080p, 1280×720 è il 720p e 3840×2160 è il 4K. Più pixel significano più dettaglio, ma anche più dati da salvare per ogni fotogramma.

Il numero con la «p» indica il lato più corto dell’immagine. Un video 1080p girato con il telefono in verticale è largo 1080 pixel e alto 1920.

## Frequenza dei fotogrammi

La frequenza dei fotogrammi indica quante immagini vengono mostrate ogni secondo, in fotogrammi al secondo (fps). Il cinema è tradizionalmente a 24 fps, molti video sono a 25 o 30 fps e i telefoni registrano spesso a 60 fps per movimenti più fluidi. Il doppio della frequenza significa più o meno il doppio delle immagini da salvare.

## Bitrate

Il bitrate è la quantità di dati dedicata a ogni secondo di video, di solito in megabit al secondo (Mbps). È il numero che decide più direttamente la dimensione del file: un minuto a 8 Mbps occupa circa 60 MB, qualunque sia la risoluzione.

A parità di bitrate, un’immagine più grande ha meno bit da spendere per ogni pixel, quindi può apparire peggiore di una più piccola. Per questo ridurre la risoluzione è spesso il modo più efficace per alleggerire un file senza che sembri rovinato.

## Come li usa Universal Video

Scegli tu la risoluzione e una delle tre impostazioni di qualità: **Smaller** (più leggero), **Balanced** (bilanciato) o **Best** (massima qualità). Non ti viene chiesto un bitrate: l’app lo calcola in base alla dimensione del fotogramma e alla frequenza dei fotogrammi, così una clip 4K riceve più spazio di una 720p con la stessa impostazione. La frequenza dei fotogrammi resta quella del video originale.

La dimensione prevista del file finale viene calcolata da queste impostazioni e mostrata sul pulsante di esportazione prima che tu lo prema.`,
  },
  {
    id: 'why-video-files-are-big',
    title: 'Perché i file video sono così pesanti',
    summary: 'Cosa fa la compressione, e perché ridurre un video è sempre un compromesso.',
    group: 'Le basi',
    body: `Un video è fatto di tantissime immagini. Un solo fotogramma 1080p ha poco più di due milioni di pixel, e ognuno ha bisogno di un colore. Senza alcuna compressione, un secondo di video 1080p a 30 fotogrammi al secondo occuperebbe circa 190 MB, e un’ora riempirebbe la maggior parte dei portatili.

## Come la compressione riduce tutto questo

I codec video come H.264 si basano su due idee principali.

- **All’interno di un fotogramma**, dedicano meno dettaglio alle zone in cui è improbabile che l’occhio noti la differenza, come un cielo uniforme o le texture molto fini.
- **Tra un fotogramma e l’altro**, salvano solo ciò che è cambiato. Nella maggior parte dei video, gran parte di ogni immagine è uguale alla precedente, quindi un fotogramma si può spesso descrivere come «quello di prima, con queste parti spostate».

I fotogrammi salvati per intero si chiamano fotogrammi chiave. Quelli intermedi dipendono da loro, ed è per questo che un programma di montaggio deve iniziare a decodificare da un fotogramma chiave anche quando tagli in un punto intermedio.

## Perché ricodificare rende i file più leggeri

Telefoni e videocamere registrano a un bitrate alto per stare al passo in tempo reale e conservare molto dettaglio. Ricodificare con un bitrate più basso, una risoluzione più piccola o entrambe le cose spesso rende un file più leggero di diverse volte, pur continuando a vedersi bene sullo schermo di un telefono o di un portatile.

Resta però sempre un compromesso. Ogni volta che un video viene compresso, una parte del dettaglio si perde per sempre, e comprimerlo di nuovo non la riporta indietro. Conserva l’originale se pensi che in futuro ti possa servire la qualità piena.

## Quando un file diventa più grande

Ricodificare non riduce sempre le dimensioni. Se l’originale era già molto compresso e scegli una risoluzione più alta o l’impostazione **Best**, il nuovo file può risultare più pesante. Universal Video mostra la dimensione prevista prima dell’esportazione, così puoi accorgertene prima di iniziare.`,
  },
  {
    id: 'where-the-work-happens',
    title: 'Dove viene elaborato il tuo video',
    summary: 'Ogni passaggio avviene nel tuo browser, sul tuo dispositivo.',
    group: 'Come funziona',
    body: `Universal Video svolge tutto il suo lavoro nella scheda del browser che stai usando. Il tuo video viene aperto, decodificato, montato e ricodificato sul tuo dispositivo, e il file finito viene salvato direttamente lì.

## Com’è possibile

I browser moderni hanno encoder e decoder video integrati, gli stessi che usano per le videochiamate. Una funzione del browser chiamata WebCodecs permette a una pagina web di usarli direttamente. Universal Video usa questi codec integrati per l’immagine e il suono, e il proprio codice open source per leggere e scrivere il file MP4 che li contiene.

Dato che i codec fanno già parte del tuo browser, non c’è un grosso download prima di iniziare e non devi installare nulla.

## Cosa significa in pratica

- **Nessun caricamento e nessuna coda.** Niente deve viaggiare fino a un server e tornare indietro, quindi il tempo di un’esportazione dipende dal tuo dispositivo.
- **Nessun limite di dimensione imposto da noi.** Il limite è la memoria del tuo dispositivo. L’articolo sui file grandi spiega come funziona.
- **Funziona offline.** Una volta caricata l’app, puoi staccare la connessione a internet e continuare a rifilare, tagliare, unire ed esportare un video. È anche il modo più semplice per verificare che non venga inviato nulla.

## Quali browser funzionano

Universal Video è testato su Chrome ed Edge da computer. Safari 16.4 e versioni successive includono WebCodecs e potrebbero funzionare, ma lì non è stato testato. Firefox al momento non offre l’encoder H.264 di cui l’app ha bisogno, quindi l’app te lo dice appena arrivi, invece che dopo una lunga attesa.

## Buono a sapersi

- I video che aggiungi sono tenuti dalla scheda del browser. Ricaricare o chiudere la scheda chiude il tuo montaggio, quindi esporta prima di farlo.
- Durante un’esportazione, il tempo rimanente si basa sulla velocità reale con cui il tuo dispositivo sta codificando, quindi diventa più preciso man mano che procede.
- Una risoluzione di uscita più piccola si codifica più in fretta, oltre a occupare meno spazio.`,
  },
  {
    id: 'export-settings',
    title: 'Scegliere le impostazioni di esportazione',
    summary: 'Formato dell’inquadratura, risoluzione, qualità, audio, e uno o più file.',
    group: 'Come funziona',
    body: `Le impostazioni del pannello di esportazione valgono per tutto il video. Ecco cosa fa ciascuna.

## Inquadratura

L’inquadratura è la forma con cui viene scritto il video finale. Puoi mantenere le dimensioni con cui è stato girato, scegliere 1920×1080 (orizzontale), 1080×1920 (verticale) o 1080×1080 (quadrato), oppure inserire una dimensione tua.

Se una clip ha una forma diversa dall’inquadratura, viene centrata e il resto viene riempito di nero. Non viene mai tagliato nulla: una clip verticale in un’inquadratura orizzontale mantiene tutta l’immagine e guadagna una fascia nera su ogni lato. L’anteprima mostra esattamente ciò che verrà prodotto.

Entrambi i lati hanno sempre un numero pari di pixel, perché H.264 lavora a blocchi e molti encoder rifiutano le dimensioni dispari.

## Risoluzione

Mantieni la dimensione originale oppure limitala a 4K, 1440p, 1080p, 720p o 480p. Il numero indica il lato più corto, quindi una clip verticale limitata a 1080p esce larga 1080 pixel. Un video già più piccolo del limite mantiene le sue dimensioni invece di essere ingrandito.

## Qualità

- **Smaller** (più leggero) comprime al massimo. Va bene per l’invio e per il web.
- **Balanced** (bilanciato) è l’impostazione predefinita. Nettamente più leggero, e ancora fedele all’originale.
- **Best** (massima qualità) conserva più dettaglio e produce il file più grande dei tre.

## Audio

Mantieni l’audio e scegli il suo bitrate (96, 128, 192 o 256 kbps), oppure disattivalo per creare un video muto, che occupa meno.

## Un video o file separati

Se hai tagliato il video in più parti, puoi esportarlo come un unico video oppure come file separati (**Separate files**). In questo caso ogni parte viene scritta come un MP4 a sé, e tutte arrivano insieme in un unico file zip, numerate in modo da tornare nell’ordine dei tuoi tagli. Su Chrome ed Edge ti viene chiesto prima dove salvare lo zip, e ogni parte ci viene scritta appena è pronta.

I file separati non sono disponibili quando ci sono clip sovrapposte su più tracce, perché due clip che vengono riprodotte nello stesso momento non si possono dividere in un file ciascuna.

## Prima di esportare

La dimensione prevista del file è indicata sul pulsante di esportazione. Se l’esportazione non entra nella memoria del tuo dispositivo, l’app te lo dice prima di iniziare e ti propone un’impostazione che ci starebbe.`,
  },
  {
    id: 'big-files',
    title: 'File grandi e limite di memoria',
    summary: 'Perché conta più la dimensione del risultato che quella dell’originale.',
    group: 'Come funziona',
    body: `Dato che Universal Video lavora nel tuo browser, è limitato dalla quantità di memoria che il browser può usare. Non c’è un limite di caricamento, perché non c’è alcun caricamento, ma un tetto esiste comunque.

## Cosa occupa la memoria

Ogni clip della timeline viene letta per intero in memoria, e anche il video finale viene assemblato lì prima di essere salvato. Quindi un montaggio con cinque clip ha bisogno di spazio per tutte e cinque, più il risultato.

## Conta il risultato

Il tetto è più o meno di un gigabyte di video finito su un computer, e meno su un telefono. Ciò che conta di più è la dimensione del file che stai creando, non quella del file di partenza. Ridurre un video da 2 GB a 300 MB può funzionare benissimo, mentre trasformare un video da 400 MB in uno da 5 GB no.

## Rifiutato prima, non dopo

Quando una scheda del browser esaurisce la memoria, di solito si chiude e basta, senza possibilità di salvare nulla. Per questo l’app controlla prima:

1. Quando aggiungi un video, legge solo la piccola parte del file che lo descrive, così anche un file molto grande viene analizzato quasi all’istante.
2. Prevede la dimensione del risultato in base alle tue impostazioni.
3. Se non ci starebbe, te lo dice prima di iniziare e ti propone un’impostazione più leggera che ci sta.

Durante l’esportazione vedi quanti fotogrammi sono pronti, quanto è grande il file finora rispetto alla previsione e quanto manca.

## Superare il tetto

- Abbassa la risoluzione o scegli un’impostazione di qualità più leggera.
- Esporta a pezzi. Su Chrome ed Edge, i file separati (**Separate files**) vengono scritti uno alla volta in uno zip sul tuo disco, quindi solo un pezzo alla volta deve entrare in memoria e l’insieme può essere lungo quanto vuoi.
- Chiudi le altre schede e i programmi pesanti prima di un’esportazione grande.`,
  },
  {
    id: 'what-leaves-your-device',
    title: 'Cosa esce dal tuo dispositivo',
    summary: 'Il tuo video, mai. Ecco la breve lista di ciò che esce.',
    group: 'Privacy e sicurezza',
    body: `Il tuo video non viene mai caricato. Viene aperto, montato ed esportato dal tuo browser, e nell’app non c’è nessuna opzione che lo invii da qualche parte. Non esiste nemmeno un’alternativa che mandi i file grandi a un server.

## Per cosa l’app usa internet

Alcune piccole cose usano internet, e nessuna contiene il tuo video o informazioni su di esso.

- **Il caricamento dell’app**, e le note sulle novità di ogni aggiornamento.
- **Il video di esempio**, se scegli di provarlo. È un download verso di te, non un caricamento da parte tua.
- **L’accesso con un Universal ID**, solo se lo scegli. Niente in Universal Video richiede un account.
- **Una nota che l’app è stata aperta**, inviata una volta per visita se hai effettuato l’accesso, così l’attività del tuo account è corretta. Non contiene il nome, la durata o la dimensione di alcun video.
- **Un segnale «in uso»**, inviato ogni 45 secondi mentre l’app è aperta e visibile sullo schermo, così l’app può mostrare quante persone la stanno usando. Contiene il nome dell’app, un ID casuale creato su questo dispositivo e il tuo account se hai effettuato l’accesso. Non dice nulla di ciò su cui stai lavorando.

Non ci sono strumenti di analisi di terze parti, pubblicità o script di tracciamento.

## File recenti

Per permetterti di riprendere da dove avevi lasciato, l’app conserva i tuoi video più recenti nello spazio di archiviazione del browser, su questo dispositivo. Ne tiene al massimo quattro, non conserva mai un singolo file più grande di 100 MB e non supera i 250 MB in totale. I video più grandi vengono aperti, ma non ricordati.

Queste copie non lasciano mai il tuo dispositivo. Puoi rimuoverne una qualsiasi con la crocetta accanto nell’elenco, e cancellare i dati del browser per questo sito le elimina tutte.

## Verifica da solo

Carica l’app, spegni il Wi-Fi e monta un video. Rifilare, tagliare, unire ed esportare continuano a funzionare, perché niente di tutto questo avveniva altrove.`,
  },
]

export default articles
