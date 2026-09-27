import type { Article } from './types'

const articles: Article[] = [
  {
    id: 'containers-and-codecs',
    title: 'Container und Codecs',
    summary: 'Warum „MP4“ die Verpackung bezeichnet und nicht den Inhalt.',
    group: 'Grundlagen',
    body: `Eine Videodatei besteht eigentlich aus zwei Dingen, die zusammenarbeiten: einem Container und einem oder mehreren Codecs.

## Der Container

Der Container ist die Verpackung. Er enthält die Bildspur, die Tonspur und die Angaben, die beide im Takt halten, etwa wie lange jedes Einzelbild dauert und wo es in der Datei liegt. MP4, MOV und MKV sind Container. Die Dateiendung, zum Beispiel .mp4 oder .mov, verrät Ihnen in der Regel nur den Container und sonst nichts.

## Der Codec

Ein Codec ist das Verfahren, mit dem Bild oder Ton so verdichtet werden, dass sie weniger Platz brauchen, und mit dem sie bei der Wiedergabe wieder entpackt werden. H.264 (auch AVC genannt) und H.265 (auch HEVC genannt) sind verbreitete Video-Codecs. AAC und Opus sind verbreitete Audio-Codecs.

Deshalb können sich zwei Dateien, die beide auf .mp4 enden, ganz unterschiedlich verhalten. Die eine enthält vielleicht H.264-Video, das fast jedes Gerät abspielt, während die andere einen neueren Codec nutzt, den ein älteres Telefon oder Fernsehgerät nicht dekodieren kann.

## Was Universal Video liest und schreibt

Universal Video öffnet MP4-, M4V- und MOV-Dateien und schreibt MP4 mit H.264-Video und AAC-Ton. Diese Kombination wird verwendet, weil sie fast überall abspielbar ist: auf Telefonen, Computern und Fernsehgeräten sowie auf den meisten Websites und in den meisten Messengern.

Einige Dateien kann die App nicht öffnen:
- **MKV und WebM**, die eine andere Art von Container verwenden.
- **AVI und WMV**, die meist zusätzlich Codecs benötigen, die Browser nicht mitbringen.
- **Fragmentiertes MP4**, eine Variante, die manche Bildschirmrekorder und Handy-Apps erzeugen.

Lässt sich eine Datei nicht öffnen, nennt Ihnen die App den Grund, sobald Sie sie hinzufügen, statt mitten in der Arbeit abzubrechen.`,
  },
  {
    id: 'resolution-bitrate-frame-rate',
    title: 'Auflösung, Bitrate und Bildrate',
    summary: 'Die drei Zahlen, die bestimmen, wie ein Video aussieht und wie groß es ist.',
    group: 'Grundlagen',
    body: `Drei Zahlen beschreiben das meiste, was Sie über ein Video wissen müssen.

## Auflösung

Die Auflösung ist die Größe jedes Einzelbilds in Pixeln, angegeben als Breite mal Höhe. 1920×1080 wird oft Full HD oder 1080p genannt, 1280×720 ist 720p und 3840×2160 ist 4K. Mehr Pixel bedeuten mehr Details, aber auch mehr Daten pro Bild.

Die Zahl mit dem „p“ bezeichnet die kürzere Seite des Bildes. Ein 1080p-Video, das mit einem hochkant gehaltenen Telefon aufgenommen wurde, ist 1080 Pixel breit und 1920 Pixel hoch.

## Bildrate

Die Bildrate gibt an, wie viele Bilder pro Sekunde gezeigt werden, gemessen in Bildern pro Sekunde (fps). Kinofilme laufen traditionell mit 24 fps, viele Videos mit 25 oder 30 fps, und Telefone nehmen oft mit 60 fps auf, damit Bewegungen flüssiger wirken. Die doppelte Bildrate bedeutet ungefähr doppelt so viele Bilder, die gespeichert werden müssen.

## Bitrate

Die Bitrate ist die Datenmenge, die für jede Sekunde Video aufgewendet wird, meist in Megabit pro Sekunde (Mbit/s). Sie bestimmt die Dateigröße am direktesten: Eine Minute bei 8 Mbit/s ergibt etwa 60 MB, unabhängig von der Auflösung.

Bei gleicher Bitrate stehen einem größeren Bild weniger Bits pro Pixel zur Verfügung, sodass es schlechter aussehen kann als ein kleineres. Deshalb ist eine niedrigere Auflösung oft der wirksamste Weg, eine Datei zu verkleinern, ohne dass sie grob wirkt.

## Wie Universal Video sie nutzt

Sie wählen die Auflösung und eine von drei Qualitätsstufen: **Smaller** (am kleinsten), **Balanced** (ausgewogen) oder **Best** (beste Qualität). Nach einer Bitrate werden Sie nicht gefragt. Die App errechnet sie aus der Bildgröße und der Bildrate, sodass ein 4K-Clip bei gleicher Einstellung mehr Budget erhält als ein 720p-Clip. Die Bildrate richtet sich nach Ihrem Originalvideo.

Die voraussichtliche Größe der fertigen Datei wird aus diesen Einstellungen berechnet und auf der Export-Schaltfläche angezeigt, bevor Sie sie drücken.`,
  },
  {
    id: 'why-video-files-are-big',
    title: 'Warum Videodateien so groß sind',
    summary: 'Was Kompression bewirkt und warum Verkleinern immer ein Kompromiss ist.',
    group: 'Grundlagen',
    body: `Ein Video besteht aus sehr vielen Bildern. Ein einziges 1080p-Bild hat gut zwei Millionen Pixel, und jedes davon braucht eine Farbe. Ganz ohne Kompression würde eine Sekunde 1080p-Video mit 30 Bildern pro Sekunde rund 190 MB belegen, und eine Stunde würde die meisten Laptops füllen.

## Wie Kompression das verringert

Video-Codecs wie H.264 beruhen auf zwei Grundideen.

- **Innerhalb eines Bildes** verwenden sie weniger Details dort, wo das Auge den Unterschied kaum bemerkt, etwa bei gleichmäßigem Himmel oder feinen Texturen.
- **Zwischen den Bildern** speichern sie nur, was sich verändert hat. In den meisten Videos gleicht ein großer Teil jedes Bildes dem vorherigen, sodass sich ein Bild oft beschreiben lässt als „das vorige, mit diesen verschobenen Teilen“.

Bilder, die vollständig gespeichert werden, heißen Schlüsselbilder. Die Bilder dazwischen hängen von ihnen ab. Deshalb muss ein Schnittprogramm ab einem Schlüsselbild dekodieren, selbst wenn Sie an einer Stelle dazwischen kürzen.

## Warum Neukodieren Dateien verkleinert

Telefone und Kameras nehmen mit hoher Bitrate auf, um in Echtzeit mitzuhalten und viele Details zu bewahren. Eine Neukodierung mit niedrigerer Bitrate, kleinerer Auflösung oder beidem kann eine Datei oft um ein Mehrfaches verkleinern, und sie sieht auf dem Bildschirm eines Telefons oder Laptops trotzdem gut aus.

Es bleibt aber immer ein Kompromiss. Bei jeder Kompression gehen Details endgültig verloren, und erneutes Komprimieren holt sie nicht zurück. Bewahren Sie das Original auf, wenn Sie später vielleicht die volle Qualität brauchen.

## Wenn eine Datei größer wird

Neukodieren verkleinert eine Datei nicht immer. War das Original bereits stark komprimiert und wählen Sie eine höhere Auflösung oder die Stufe **Best**, kann die neue Datei größer ausfallen. Universal Video zeigt die voraussichtliche Größe vor dem Export an, sodass Sie das sehen, bevor Sie sich festlegen.`,
  },
  {
    id: 'where-the-work-happens',
    title: 'Wo Ihr Video verarbeitet wird',
    summary: 'Jeder Schritt geschieht in Ihrem Browser, auf Ihrem Gerät.',
    group: 'So funktioniert es',
    body: `Universal Video erledigt seine gesamte Arbeit in dem Browser-Tab, den Sie gerade verwenden. Ihr Video wird auf Ihrem eigenen Gerät geöffnet, dekodiert, geschnitten und neu kodiert, und die fertige Datei wird direkt dort gespeichert.

## Wie das möglich ist

Moderne Browser haben Video-Encoder und -Decoder eingebaut, dieselben, die sie auch für Videoanrufe nutzen. Eine Browserfunktion namens WebCodecs erlaubt einer Webseite, sie direkt zu verwenden. Universal Video nutzt diese eingebauten Codecs für Bild und Ton und eigenen Open-Source-Code, um die MP4-Datei drumherum zu lesen und zu schreiben.

Da die Codecs bereits Teil Ihres Browsers sind, gibt es vor dem Start keinen großen Download, und Sie müssen nichts installieren.

## Was das praktisch bedeutet

- **Kein Hochladen, keine Warteschlange.** Nichts muss zu einem Server und zurück, daher hängt die Dauer eines Exports von Ihrem eigenen Gerät ab.
- **Keine Größenbeschränkung von unserer Seite.** Die Grenze ist der Arbeitsspeicher Ihres Geräts. Der Artikel über große Dateien erklärt, wie das funktioniert.
- **Es funktioniert offline.** Sobald die App geladen ist, können Sie die Internetverbindung trennen und trotzdem ein Video kürzen, schneiden, zusammenfügen und exportieren. Das ist auch der einfachste Weg, sich zu vergewissern, dass nichts irgendwohin gesendet wird.

## Welche Browser funktionieren

Universal Video ist in Chrome und Edge auf dem Computer getestet. Safari ab Version 16.4 enthält WebCodecs und könnte funktionieren, wurde dort aber nicht getestet. Firefox bietet derzeit nicht den H.264-Encoder, den die App braucht. Die App weist Sie deshalb gleich beim Öffnen darauf hin und nicht erst nach langem Warten.

## Gut zu wissen

- Die Videos, die Sie hinzufügen, werden vom Browser-Tab gehalten. Wenn Sie den Tab neu laden oder schließen, ist Ihr Schnitt verloren. Exportieren Sie also vorher.
- Während eines Exports beruht die Restzeit auf der tatsächlichen Kodiergeschwindigkeit Ihres Geräts und wird daher im Verlauf immer genauer.
- Eine kleinere Ausgabeauflösung lässt sich schneller kodieren und braucht weniger Speicherplatz.`,
  },
  {
    id: 'export-settings',
    title: 'Die Export-Einstellungen wählen',
    summary: 'Bildformat, Auflösung, Qualität, Ton sowie eine oder mehrere Dateien.',
    group: 'So funktioniert es',
    body: `Die Einstellungen im Export-Bereich gelten für das gesamte Video. Das bewirken sie im Einzelnen.

## Bildrahmen

Der Bildrahmen ist das Format, in dem das fertige Video geschrieben wird. Sie können die Originalgröße beibehalten, 1920×1080 (Querformat), 1080×1920 (Hochformat) oder 1080×1080 (quadratisch) wählen oder eine eigene Größe eingeben.

Hat ein Clip ein anderes Format als der Rahmen, wird er zentriert und der Rest schwarz aufgefüllt. Es wird nie etwas abgeschnitten: Ein hochkant aufgenommener Clip in einem Querformat-Rahmen behält sein ganzes Bild und bekommt links und rechts einen schwarzen Balken. Die Vorschau zeigt genau, was herauskommt.

Beide Seiten haben immer eine gerade Pixelzahl, weil H.264 in Blöcken arbeitet und viele Encoder ungerade Größen ablehnen.

## Auflösung

Behalten Sie die Originalgröße bei oder begrenzen Sie sie auf 4K, 1440p, 1080p, 720p oder 480p. Die Zahl bezeichnet die kürzere Seite, ein auf 1080p begrenzter Hochformat-Clip ist also 1080 Pixel breit. Ein Video, das bereits kleiner als die Grenze ist, behält seine Größe und wird nicht vergrößert.

## Qualität

- **Smaller** (am kleinsten) komprimiert am stärksten. Gut zum Versenden und fürs Web.
- **Balanced** (ausgewogen) ist die Standardeinstellung. Deutlich kleiner und immer noch nah am Original.
- **Best** (beste Qualität) bewahrt die meisten Details und ergibt die größte Datei der drei.

## Ton

Behalten Sie den Ton und wählen Sie seine Bitrate (96, 128, 192 oder 256 kbit/s), oder schalten Sie ihn ab, um ein stummes und damit kleineres Video zu erzeugen.

## Ein Video oder einzelne Dateien

Wenn Sie Ihr Video in Stücke geschnitten haben, können Sie es als ein Video oder als einzelne Dateien (**Separate files**) exportieren. Dann wird jedes Stück als eigene MP4-Datei geschrieben, und alle kommen zusammen in einer einzigen ZIP-Datei an, so nummeriert, dass sie sich in der Reihenfolge Ihrer Schnitte sortieren. In Chrome und Edge werden Sie zuerst gefragt, wo die ZIP-Datei gespeichert werden soll, und jedes Stück wird hineingeschrieben, sobald es fertig ist.

Einzelne Dateien sind nicht verfügbar, wenn Clips auf mehreren Spuren übereinanderliegen, denn zwei gleichzeitig laufende Clips lassen sich nicht auf je eine Datei aufteilen.

## Vor dem Export

Die voraussichtliche Dateigröße steht auf der Export-Schaltfläche. Passt der Export nicht in den Arbeitsspeicher Ihres Geräts, sagt Ihnen die App das vor dem Start und schlägt eine Einstellung vor, die passen würde.`,
  },
  {
    id: 'big-files',
    title: 'Große Dateien und die Speichergrenze',
    summary: 'Warum die Größe des Ergebnisses mehr zählt als die des Originals.',
    group: 'So funktioniert es',
    body: `Da Universal Video in Ihrem Browser arbeitet, ist es durch den Arbeitsspeicher begrenzt, den der Browser nutzen darf. Ein Upload-Limit gibt es nicht, weil es keinen Upload gibt, eine Obergrenze aber trotzdem.

## Was den Speicher belegt

Jeder Clip auf der Zeitleiste wird vollständig in den Arbeitsspeicher gelesen, und auch das fertige Video wird dort zusammengesetzt, bevor es gespeichert wird. Ein Schnitt mit fünf Clips braucht also Platz für alle fünf und zusätzlich für das Ergebnis.

## Das Ergebnis zählt

Die Obergrenze liegt auf einem Computer bei ungefähr einem Gigabyte fertigem Video, auf einem Telefon darunter. Am wichtigsten ist die Größe der Datei, die Sie erzeugen, nicht die der Ausgangsdatei. Ein 2-GB-Video auf 300 MB zu verkleinern kann problemlos klappen, ein 400-MB-Video in eine 5-GB-Datei zu verwandeln dagegen nicht.

## Vorher abgelehnt, nicht hinterher

Geht einem Browser-Tab der Speicher aus, schließt er sich meist einfach, ohne dass noch etwas gespeichert werden kann. Deshalb prüft die App vorher:

1. Wenn Sie ein Video hinzufügen, liest sie nur den kleinen Teil der Datei, der es beschreibt. So ist selbst eine sehr große Datei fast sofort erfasst.
2. Sie berechnet die voraussichtliche Größe des Ergebnisses aus Ihren Einstellungen.
3. Würde das nicht passen, sagt sie es Ihnen vor dem Start und bietet eine kleinere Einstellung an, die passt.

Während des Exports sehen Sie, wie viele Bilder fertig sind, wie groß die Datei bisher im Vergleich zur Vorhersage ist und wie lange es noch dauert.

## Die Grenze umgehen

- Senken Sie die Auflösung oder wählen Sie eine kleinere Qualitätsstufe.
- Exportieren Sie in Stücken. In Chrome und Edge werden einzelne Dateien (**Separate files**) nacheinander in eine ZIP-Datei auf Ihrem Datenträger geschrieben. So muss immer nur ein Stück in den Speicher passen, und die Gesamtlänge ist unbegrenzt.
- Schließen Sie vor einem großen Export andere speicherhungrige Tabs und Programme.`,
  },
  {
    id: 'what-leaves-your-device',
    title: 'Was Ihr Gerät verlässt',
    summary: 'Ihr Video niemals. Hier ist die kurze Liste dessen, was es tut.',
    group: 'Datenschutz und Sicherheit',
    body: `Ihr Video wird nie hochgeladen. Es wird von Ihrem eigenen Browser geöffnet, geschnitten und exportiert, und die App hat keine Funktion, die es irgendwohin sendet. Es gibt auch keine Ausweichlösung, die große Dateien an einen Server schickt.

## Wofür die App das Internet nutzt

Einige kleine Dinge laufen über das Internet, und keines davon enthält Ihr Video oder Angaben darüber.

- **Das Laden der App** sowie die Hinweise, was sich mit jedem Update geändert hat.
- **Das Beispielvideo**, wenn Sie es ausprobieren möchten. Das ist ein Download zu Ihnen, kein Upload von Ihnen.
- **Die Anmeldung mit einer Universal ID**, nur wenn Sie es wünschen. Nichts in Universal Video setzt ein Konto voraus.
- **Ein Hinweis, dass die App geöffnet wurde**, einmal pro Besuch, wenn Sie angemeldet sind, damit die Aktivität Ihres Kontos stimmt. Er enthält weder Namen noch Länge noch Größe eines Videos.
- **Ein „In Benutzung“-Signal**, das alle 45 Sekunden gesendet wird, solange die App geöffnet und auf dem Bildschirm zu sehen ist, damit sie anzeigen kann, wie viele Menschen sie nutzen. Es enthält den Namen der App, eine zufällige, auf diesem Gerät erzeugte ID und Ihr Konto, wenn Sie angemeldet sind. Über Ihre Arbeit sagt es nichts.

Es gibt keine Analysewerkzeuge von Drittanbietern, keine Werbung und keine Tracking-Skripte.

## Zuletzt verwendete Dateien

Damit Sie dort weitermachen können, wo Sie aufgehört haben, speichert die App Ihre zuletzt geöffneten Videos im Speicher Ihres Browsers auf diesem Gerät. Sie behält höchstens vier, nie eine einzelne Datei über 100 MB und insgesamt nicht mehr als 250 MB. Größere Videos werden geöffnet, aber nicht gemerkt.

Diese Kopien verlassen Ihr Gerät nie. Sie können jede davon mit dem Kreuz daneben aus der Liste entfernen, und wenn Sie die Browserdaten für diese Website löschen, verschwinden alle.

## Selbst überprüfen

Laden Sie die App, schalten Sie das WLAN aus und bearbeiten Sie ein Video. Kürzen, Schneiden, Zusammenfügen und Exportieren funktionieren weiterhin, denn nichts davon geschah anderswo.`,
  },
]

export default articles
