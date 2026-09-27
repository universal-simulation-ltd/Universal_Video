import type { Article } from './types'

const articles: Article[] = [
  {
    id: 'containers-and-codecs',
    title: 'Kapsayıcılar ve codec’ler',
    summary: '“MP4” neden içindekini değil, kutuyu anlatır.',
    group: 'Temel bilgiler',
    body: `Bir video dosyası aslında birlikte çalışan iki şeyden oluşur: bir kapsayıcı ve bir ya da daha fazla codec.

## Kapsayıcı

Kapsayıcı, kutunun kendisidir. Görüntü parçasını, ses parçasını ve bunları uyumlu tutan bilgileri, örneğin her karenin ne kadar sürdüğünü ve dosyada nerede durduğunu barındırır. MP4, MOV ve MKV birer kapsayıcıdır. Bir dosyanın uzantısı, örneğin .mp4 ya da .mov, genellikle size yalnızca kapsayıcıyı söyler.

## Codec

Codec, görüntüyü ya da sesi daha az yer kaplayacak şekilde sıkıştırmak ve oynatırken yeniden açmak için kullanılan yöntemdir. H.264 (AVC olarak da bilinir) ve H.265 (HEVC olarak da bilinir) yaygın video codec’leridir. AAC ve Opus yaygın ses codec’leridir.

Bu nedenle ikisi de .mp4 ile biten iki dosya farklı davranabilir. Biri neredeyse her cihazın oynatabildiği H.264 video içerirken, diğeri eski bir telefonun ya da televizyonun çözemediği daha yeni bir codec kullanıyor olabilir.

## Universal Video neyi okur, neyi yazar

Universal Video MP4, M4V ve MOV dosyalarını açar; H.264 video ve AAC sesli MP4 dosyaları üretir. Bu birleşim, neredeyse her yerde oynatılabildiği için tercih edilir: telefonlarda, bilgisayarlarda ve televizyonlarda, ayrıca çoğu web sitesinde ve mesajlaşma uygulamasında.

Açamadığı bazı dosyalar vardır:
- **MKV ve WebM**, farklı türde bir kapsayıcı kullanır.
- **AVI ve WMV**, genellikle tarayıcılarda bulunmayan codec’lere de ihtiyaç duyar.
- **Parçalı MP4**, bazı ekran kaydedicilerin ve telefon uygulamalarının ürettiği bir türdür.

Bir dosya açılamıyorsa uygulama, işin ortasında başarısız olmak yerine, dosyayı eklediğiniz anda nedenini size söyler.`,
  },
  {
    id: 'resolution-bitrate-frame-rate',
    title: 'Çözünürlük, bit hızı ve kare hızı',
    summary: 'Bir videonun nasıl göründüğünü ve ne kadar büyük olduğunu belirleyen üç sayı.',
    group: 'Temel bilgiler',
    body: `Bir video hakkında bilmeniz gerekenlerin çoğunu üç sayı anlatır.

## Çözünürlük

Çözünürlük, her karenin piksel cinsinden boyutudur ve genişlik × yükseklik olarak yazılır. 1920×1080 genellikle Full HD ya da 1080p, 1280×720 ise 720p olarak adlandırılır; 3840×2160 ise 4K’dır. Daha fazla piksel daha fazla ayrıntı demektir, ama her kare için saklanacak veri de artar.

“p” ile yazılan sayı, görüntünün kısa kenarını belirtir. Dik tutulan bir telefonla çekilmiş 1080p video, 1080 piksel genişliğinde ve 1920 piksel yüksekliğindedir.

## Kare hızı

Kare hızı, her saniyede kaç görüntü gösterildiğidir ve saniyedeki kare sayısı (fps) ile ölçülür. Sinema filmleri geleneksel olarak 24 fps’dir, pek çok video 25 ya da 30 fps’dir, telefonlar ise daha akıcı hareket için sıklıkla 60 fps kaydeder. İki kat kare hızı, saklanacak yaklaşık iki kat görüntü demektir.

## Bit hızı

Bit hızı, videonun her saniyesine ayrılan veri miktarıdır ve genellikle saniyede megabit (Mbps) olarak verilir. Dosya boyutunu en doğrudan belirleyen sayıdır: 8 Mbps’de bir dakika, çözünürlük ne olursa olsun yaklaşık 60 MB eder.

Aynı bit hızında daha büyük bir görüntü, piksel başına daha az bit harcayabilir; bu yüzden daha küçük bir görüntüden daha kötü görünebilir. Bu nedenle çözünürlüğü düşürmek, bir dosyayı kaba görünmesine yol açmadan küçültmenin çoğu zaman en etkili yoludur.

## Universal Video bunları nasıl kullanır

Çözünürlüğü ve üç kalite ayarından birini siz seçersiniz: **Smaller** (en küçük), **Balanced** (dengeli) ya da **Best** (en iyi). Sizden bit hızı istenmez. Uygulama bunu kare boyutundan ve kare hızından hesaplar; böylece aynı ayarda bir 4K klibe 720p bir klipten daha büyük bir pay ayrılır. Kare hızı, özgün videonuzunkini izler.

Bitmiş dosyanın beklenen boyutu bu ayarlardan hesaplanır ve siz basmadan önce dışa aktarma düğmesinin üzerinde gösterilir.`,
  },
  {
    id: 'why-video-files-are-big',
    title: 'Video dosyaları neden bu kadar büyük',
    summary: 'Sıkıştırma ne yapar ve bir videoyu küçültmek neden her zaman bir ödünleşimdir.',
    group: 'Temel bilgiler',
    body: `Video, çok sayıda görüntüden oluşur. Tek bir 1080p karede iki milyondan biraz fazla piksel vardır ve her biri bir renge ihtiyaç duyar. Hiç sıkıştırılmadan saklandığında, saniyede 30 karelik 1080p videonun bir saniyesi yaklaşık 190 MB tutar; bir saat ise çoğu dizüstü bilgisayarı doldurur.

## Sıkıştırma bunu nasıl azaltır

H.264 gibi video codec’leri iki temel fikre dayanır.

- **Bir karenin içinde**, gözün farkı fark etmesinin pek olası olmadığı yerlerde, örneğin düz gökyüzü alanlarında ya da ince dokularda, daha az ayrıntı harcarlar.
- **Kareler arasında**, yalnızca değişeni saklarlar. Çoğu videoda her görüntünün büyük bölümü bir öncekiyle aynıdır; bu yüzden bir kare çoğu zaman “bir önceki, şu parçaları kaymış hâliyle” diye tarif edilebilir.

Tümüyle saklanan karelere anahtar kare denir. Aradaki kareler onlara bağlıdır; bu nedenle bir düzenleme yazılımı, siz ara bir noktadan kırpsanız bile çözmeye bir anahtar kareden başlamak zorundadır.

## Yeniden kodlama dosyaları neden küçültür

Telefonlar ve kameralar, gerçek zamanlı olarak yetişebilmek ve bol ayrıntı saklayabilmek için yüksek bit hızında kayıt yapar. Daha düşük bir bit hızıyla, daha küçük bir çözünürlükle ya da ikisiyle birden yeniden kodlamak, bir dosyayı çoğu zaman birkaç kat küçültür ve dosya telefon ya da dizüstü bilgisayar ekranında yine iyi görünür.

Yine de bu her zaman bir ödünleşimdir. Bir video her sıkıştırıldığında ayrıntının bir kısmı kalıcı olarak kaybolur ve yeniden sıkıştırmak bu ayrıntıyı geri getirmez. İleride tam kaliteye ihtiyaç duyabilirseniz özgün dosyayı saklayın.

## Bir dosya büyüdüğünde

Yeniden kodlama bir dosyayı her zaman küçültmez. Özgün dosya zaten yoğun biçimde sıkıştırılmışsa ve siz daha büyük bir çözünürlük ya da **Best** ayarını seçerseniz, yeni dosya daha büyük çıkabilir. Universal Video dışa aktarmadan önce beklenen boyutu gösterir; böylece karar vermeden önce bunu görebilirsiniz.`,
  },
  {
    id: 'where-the-work-happens',
    title: 'Videonuz nerede işlenir',
    summary: 'Her adım tarayıcınızda, kendi cihazınızda gerçekleşir.',
    group: 'Nasıl çalışır',
    body: `Universal Video tüm işini kullandığınız tarayıcı sekmesinin içinde yapar. Videonuz kendi cihazınızda açılır, çözülür, düzenlenir ve yeniden kodlanır; bitmiş dosya da doğrudan cihazınıza kaydedilir.

## Bu nasıl mümkün oluyor

Modern tarayıcılarda, görüntülü görüşmelerde kullandıkları video kodlayıcı ve çözücüler yerleşik olarak bulunur. WebCodecs adlı bir tarayıcı özelliği, bir web sayfasının bunları doğrudan kullanmasını sağlar. Universal Video görüntü ve ses için bu yerleşik codec’leri, bunları çevreleyen MP4 dosyasını okumak ve yazmak için ise kendi açık kaynak kodunu kullanır.

Codec’ler zaten tarayıcınızın parçası olduğundan başlamadan önce büyük bir indirme yapılmaz ve hiçbir şey kurmanız gerekmez.

## Bunun pratikteki anlamı

- **Yükleme yok, sıra yok.** Hiçbir şeyin bir sunucuya gidip gelmesi gerekmez; bu yüzden bir dışa aktarmanın süresi kendi cihazınıza bağlıdır.
- **Bizim koyduğumuz bir dosya boyutu sınırı yok.** Sınır, cihazınızın belleğidir. Büyük dosyalarla ilgili makale bunun nasıl işlediğini açıklar.
- **Çevrimdışı çalışır.** Uygulama yüklendikten sonra internet bağlantınızı kapatıp yine de bir videoyu kırpabilir, kesebilir, birleştirebilir ve dışa aktarabilirsiniz. Hiçbir şeyin bir yere gönderilmediğini doğrulamanın en basit yolu da budur.

## Hangi tarayıcılar çalışır

Universal Video, bilgisayarda Chrome ve Edge üzerinde test edilmiştir. Safari 16.4 ve sonrası WebCodecs içerir ve çalışabilir, ancak orada test edilmemiştir. Firefox şu anda uygulamanın ihtiyaç duyduğu H.264 kodlayıcıyı sunmuyor; bu yüzden uygulama bunu uzun bir beklemeden sonra değil, siz açar açmaz söyler.

## Bilmekte yarar var

- Eklediğiniz videolar tarayıcı sekmesinde tutulur. Sekmeyi yenilemek ya da kapatmak düzenlemenizi sona erdirir; bu nedenle bunlardan önce dışa aktarın.
- Dışa aktarma sırasında kalan süre, cihazınızın gerçekte ne hızda kodladığına göre hesaplanır; bu yüzden ilerledikçe daha doğru hâle gelir.
- Daha küçük bir çıkış çözünürlüğü hem daha az yer kaplar hem de daha hızlı kodlanır.`,
  },
  {
    id: 'export-settings',
    title: 'Dışa aktarma ayarlarını seçmek',
    summary: 'Kare biçimi, çözünürlük, kalite, ses ve tek ya da birden çok dosya.',
    group: 'Nasıl çalışır',
    body: `Dışa aktarma panelindeki ayarlar videonun tamamına uygulanır. Her birinin ne işe yaradığı aşağıda.

## Kare

Kare, bitmiş videonun yazılacağı biçimdir. Çekildiği boyutu koruyabilir; 1920×1080 (yatay), 1080×1920 (dikey) ya da 1080×1080 (kare) seçebilir veya kendi boyutunuzu yazabilirsiniz.

Bir klip kareden farklı biçimdeyse ortalanır ve geri kalan kısım siyahla doldurulur. Hiçbir şey kırpılmaz: yatay bir kare içindeki dikey bir telefon klibi görüntüsünün tamamını korur ve iki yanına birer siyah şerit eklenir. Önizleme, tam olarak ne çıkacağını gösterir.

H.264 bloklar hâlinde çalıştığı ve pek çok kodlayıcı tek sayılı boyutları kabul etmediği için her iki kenar da her zaman çift sayıda pikseldir.

## Çözünürlük

Özgün boyutu koruyun ya da 4K, 1440p, 1080p, 720p veya 480p ile sınırlayın. Sayı kısa kenarı belirtir; yani 1080p ile sınırlanan dikey bir klip 1080 piksel genişliğinde çıkar. Sınırdan zaten küçük olan bir video büyütülmez, kendi boyutunu korur.

## Kalite

- **Smaller** (en küçük) en çok sıkıştırmayı yapar. Göndermek ve web için uygundur.
- **Balanced** (dengeli) varsayılandır. Belirgin biçimde küçüktür ve hâlâ özgün dosyaya benzer.
- **Best** (en iyi) en fazla ayrıntıyı korur ve üçü arasında en büyük dosyayı üretir.

## Ses

Sesi koruyup bit hızını seçin (96, 128, 192 veya 256 kbps) ya da sesi kapatarak daha küçük, sessiz bir video oluşturun.

## Tek video mu, ayrı dosyalar mı

Videonuzu parçalara böldüyseniz tek bir video olarak ya da ayrı dosyalar (**Separate files**) olarak dışa aktarabilirsiniz. Bu durumda her parça kendi MP4 dosyası olarak yazılır ve hepsi, kesim sıranıza göre sıralanacak şekilde numaralandırılmış olarak tek bir zip dosyasında gelir. Chrome ve Edge’de önce zip dosyasını nereye kaydedeceğiniz sorulur ve her parça hazır olur olmaz içine yazılır.

Klipler birden fazla izde üst üste dizildiğinde ayrı dosyalar seçeneği kullanılamaz; çünkü aynı anda oynayan iki klip, her biri ayrı bir dosyada olacak şekilde bölünemez.

## Dışa aktarmadan önce

Beklenen dosya boyutu dışa aktarma düğmesinde gösterilir. Dışa aktarma cihazınızın belleğine sığmayacaksa uygulama bunu başlamadan önce söyler ve sığacak bir ayar önerir.`,
  },
  {
    id: 'big-files',
    title: 'Büyük dosyalar ve bellek sınırı',
    summary: 'Sonucun boyutu neden özgün dosyanın boyutundan daha önemlidir.',
    group: 'Nasıl çalışır',
    body: `Universal Video tarayıcınızın içinde çalıştığı için tarayıcının kullanabildiği bellek miktarıyla sınırlıdır. Yükleme olmadığı için yükleme sınırı da yoktur, ama yine de bir tavan vardır.

## Belleği ne kullanır

Zaman çizelgesindeki her klip belleğe tamamen okunur ve bitmiş video da kaydedilmeden önce bellekte birleştirilir. Yani beş klipli bir düzenleme, beşinin hepsine ve ayrıca sonuca yer ister.

## Önemli olan sonuç

Tavan, bilgisayarda kabaca bir gigabayt civarında bitmiş videodur; telefonda daha azdır. En çok önemli olan, başladığınız dosyanın değil, oluşturduğunuz dosyanın boyutudur. 2 GB’lık bir videoyu 300 MB’a küçültmek sorunsuz olabilirken, 400 MB’lık bir videoyu 5 GB’lık bir dosyaya dönüştürmek olmaz.

## Sonra değil, önceden reddedilir

Bir tarayıcı sekmesinin belleği tükendiğinde, genellikle hiçbir şeyi kaydetme fırsatı vermeden kapanır. Bu yüzden uygulama önce kontrol eder:

1. Bir video eklediğinizde, dosyanın yalnızca onu tanımlayan küçük bölümünü okur; böylece çok büyük bir dosya bile neredeyse anında anlaşılır.
2. Ayarlarınıza göre sonucun boyutunu tahmin eder.
3. Sığmayacaksa bunu başlamadan önce söyler ve sığacak daha küçük bir ayar sunar.

Dışa aktarma sırasında kaç karenin tamamlandığını, dosyanın şu ana kadarki boyutunu tahminle karşılaştırmalı olarak ve kalan süreyi görürsünüz.

## Tavanı aşmak

- Çözünürlüğü düşürün ya da daha küçük bir kalite ayarı seçin.
- Parça parça dışa aktarın. Chrome ve Edge’de ayrı dosyalar (**Separate files**) diskinizdeki bir zip dosyasına tek tek yazılır; böylece bellekte yalnızca bir parçanın yer alması yeterlidir ve bütünün uzunluğu dilediğiniz kadar olabilir.
- Büyük bir dışa aktarmadan önce belleği yoğun kullanan diğer sekmeleri ve programları kapatın.`,
  },
  {
    id: 'what-leaves-your-device',
    title: 'Cihazınızdan neler çıkar',
    summary: 'Videonuz asla. Çıkan şeylerin kısa listesi burada.',
    group: 'Gizlilik ve güvenlik',
    body: `Videonuz hiçbir zaman yüklenmez. Kendi tarayıcınız tarafından açılır, düzenlenir ve dışa aktarılır; uygulamada onu herhangi bir yere gönderen bir seçenek yoktur. Büyük dosyaları bir sunucuya gönderen bir yedek yol da yoktur.

## Uygulama interneti ne için kullanır

Birkaç küçük şey interneti kullanır ve bunların hiçbiri videonuzu ya da onunla ilgili bir bilgiyi içermez.

- **Uygulamanın yüklenmesi** ve her güncellemede nelerin değiştiğine dair notlar.
- **Örnek video**, denemeyi seçerseniz. Bu, sizden yapılan bir yükleme değil, size doğru bir indirmedir.
- **Universal ID ile oturum açma**, yalnızca siz isterseniz. Universal Video’daki hiçbir şey hesap gerektirmez.
- **Uygulamanın açıldığına dair bir not**, oturum açtıysanız ziyaret başına bir kez gönderilir; böylece hesabınızın etkinliği doğru olur. Hiçbir videonun adını, süresini ya da boyutunu içermez.
- **Bir “kullanımda” sinyali**, uygulama açık ve ekranda olduğu sürece her 45 saniyede bir gönderilir; böylece uygulama kaç kişinin kullandığını gösterebilir. Uygulamanın adını, bu cihazda oluşturulan rastgele bir kimliği ve oturum açtıysanız hesabınızı içerir. Üzerinde çalıştığınız şey hakkında hiçbir şey söylemez.

Üçüncü taraf analiz, reklam ya da izleme betiği yoktur.

## Son dosyalar

Kaldığınız yerden devam edebilmeniz için uygulama, en son videolarınızı bu cihazdaki tarayıcınızın kendi depolama alanında tutar. En fazla dört tanesini saklar, 100 MB’tan büyük tek bir dosyayı asla saklamaz ve toplamda 250 MB’ı aşmaz. Daha büyük videolar açılır ama hatırlanmaz.

Bu kopyalar cihazınızdan asla çıkmaz. Listedeki herhangi birini yanındaki çarpı işaretiyle kaldırabilirsiniz; bu site için tarayıcı verilerinizi temizlemek ise hepsini siler.

## Kendiniz doğrulayın

Uygulamayı yükleyin, Wi-Fi bağlantınızı kapatın ve bir video düzenleyin. Kırpma, kesme, birleştirme ve dışa aktarma çalışmaya devam eder; çünkü bunların hiçbiri başka bir yerde gerçekleşmiyordu.`,
  },
]

export default articles
