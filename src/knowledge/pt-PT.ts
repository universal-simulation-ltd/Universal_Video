import type { Article } from './types'

const articles: Article[] = [
  {
    id: 'containers-and-codecs',
    title: 'Contentores e codecs',
    summary: 'Porque é que «MP4» é o nome da caixa e não do que está lá dentro.',
    group: 'O essencial',
    body: `Um ficheiro de vídeo são, na verdade, duas coisas que trabalham em conjunto: um contentor e um ou mais codecs.

## O contentor

O contentor é a caixa. Guarda a faixa de imagem, a faixa de som e a informação que as mantém sincronizadas, como a duração de cada fotograma e o sítio onde cada um fica no ficheiro. MP4, MOV e MKV são contentores. A extensão de um ficheiro, como .mp4 ou .mov, normalmente indica o contentor e mais nada.

## O codec

Um codec é o método usado para comprimir a imagem ou o som para ocuparem menos espaço, e para os descomprimir de novo na reprodução. H.264 (também chamado AVC) e H.265 (também chamado HEVC) são codecs de vídeo comuns. AAC e Opus são codecs de áudio comuns.

É por isso que dois ficheiros que terminam ambos em .mp4 se podem comportar de forma diferente. Um pode conter vídeo H.264, que quase todos os dispositivos reproduzem, enquanto outro usa um codec mais recente que um telemóvel ou televisor antigo não consegue descodificar.

## O que o Universal Video lê e escreve

O Universal Video abre ficheiros MP4, M4V e MOV e cria MP4 com vídeo H.264 e som AAC. Usa esta combinação porque é reproduzida em quase todo o lado: em telemóveis, computadores e televisores, e na maioria dos sites e aplicações de mensagens.

Há ficheiros que não consegue abrir:
- **MKV e WebM**, que usam outro tipo de contentor.
- **AVI e WMV**, que normalmente também precisam de codecs que os browsers não incluem.
- **MP4 fragmentado**, uma variante criada por alguns gravadores de ecrã e aplicações de telemóvel.

Se um ficheiro não puder ser aberto, a aplicação explica o motivo assim que o adicionar, em vez de falhar a meio.`,
  },
  {
    id: 'resolution-bitrate-frame-rate',
    title: 'Resolução, taxa de bits e fotogramas por segundo',
    summary: 'Os três números que definem o aspeto de um vídeo e o tamanho que ocupa.',
    group: 'O essencial',
    body: `Três números descrevem quase tudo o que precisa de saber sobre um vídeo.

## Resolução

A resolução é o tamanho de cada fotograma em píxeis, escrito como largura por altura. 1920×1080 é muitas vezes chamado Full HD ou 1080p, 1280×720 é 720p e 3840×2160 é 4K. Mais píxeis significam mais detalhe, mas também mais dados a guardar em cada fotograma.

O número com o «p» indica o lado mais curto da imagem. Um vídeo 1080p filmado com o telemóvel na vertical tem 1080 píxeis de largura e 1920 de altura.

## Fotogramas por segundo

A frequência de fotogramas indica quantas imagens são mostradas por segundo, em fotogramas por segundo (fps). O cinema usa tradicionalmente 24 fps, muitos vídeos usam 25 ou 30 fps e os telemóveis gravam muitas vezes a 60 fps para um movimento mais fluido. O dobro dos fotogramas por segundo significa, aproximadamente, o dobro das imagens a guardar.

## Taxa de bits

A taxa de bits é a quantidade de dados gasta em cada segundo de vídeo, normalmente em megabits por segundo (Mbps). É o número que define mais diretamente o tamanho do ficheiro: um minuto a 8 Mbps ocupa cerca de 60 MB, seja qual for a resolução.

Com a mesma taxa de bits, uma imagem maior tem menos bits para cada píxel e, por isso, pode parecer pior do que uma mais pequena. É por isso que baixar a resolução é muitas vezes a forma mais eficaz de reduzir um ficheiro sem que fique com mau aspeto.

## Como o Universal Video os usa

Escolhe a resolução e uma de três definições de qualidade: **Smaller** (mais pequeno), **Balanced** (equilibrado) ou **Best** (melhor). Não lhe é pedida nenhuma taxa de bits. A aplicação calcula-a a partir do tamanho do fotograma e dos fotogramas por segundo, de modo que um clipe 4K recebe mais orçamento do que um de 720p com a mesma definição. Os fotogramas por segundo acompanham o vídeo original.

O tamanho previsto do ficheiro final é calculado a partir destas definições e aparece no botão de exportar antes de o premir.`,
  },
  {
    id: 'why-video-files-are-big',
    title: 'Porque é que os ficheiros de vídeo são tão grandes',
    summary: 'O que faz a compressão e porque é que reduzir um vídeo é sempre uma cedência.',
    group: 'O essencial',
    body: `Um vídeo é um grande número de imagens. Um único fotograma 1080p tem pouco mais de dois milhões de píxeis, e cada um precisa de uma cor. Sem qualquer compressão, um segundo de vídeo 1080p a 30 fotogramas por segundo ocuparia cerca de 190 MB, e uma hora encheria a maioria dos portáteis.

## Como a compressão reduz isto

Os codecs de vídeo como o H.264 assentam em duas ideias principais.

- **Dentro de um fotograma**, gastam menos detalhe onde é pouco provável que o olho note a diferença, como em zonas lisas de céu ou em texturas finas.
- **Entre fotogramas**, guardam apenas o que mudou. Na maioria dos vídeos, grande parte de cada imagem é igual à anterior, por isso um fotograma pode muitas vezes ser descrito como «o anterior, com estas partes deslocadas».

Os fotogramas guardados por inteiro chamam-se fotogramas-chave. Os intermédios dependem deles, e é por isso que um programa de edição tem de começar a descodificar a partir de um fotograma-chave mesmo quando corta num ponto intermédio.

## Porque é que recodificar torna os ficheiros mais pequenos

Os telemóveis e as câmaras gravam com uma taxa de bits elevada para acompanharem tudo em tempo real e guardarem muito detalhe. Recodificar com uma taxa de bits mais baixa, uma resolução mais pequena ou ambas pode muitas vezes tornar um ficheiro várias vezes mais pequeno, continuando a ter bom aspeto no ecrã de um telemóvel ou portátil.

Ainda assim, é sempre uma cedência. Sempre que um vídeo é comprimido, parte do detalhe perde-se para sempre, e comprimir outra vez não o recupera. Guarde o original se puder vir a precisar da qualidade máxima.

## Quando um ficheiro fica maior

Recodificar nem sempre reduz o tamanho. Se o original já estava muito comprimido e escolher uma resolução maior ou a definição **Best**, o novo ficheiro pode ficar maior. O Universal Video mostra o tamanho previsto antes de exportar, para que o possa ver antes de avançar.`,
  },
  {
    id: 'where-the-work-happens',
    title: 'Onde o seu vídeo é processado',
    summary: 'Todos os passos acontecem no seu browser, no seu dispositivo.',
    group: 'Como funciona',
    body: `O Universal Video faz todo o trabalho dentro do separador do browser que está a usar. O seu vídeo é aberto, descodificado, editado e recodificado no seu próprio dispositivo, e o ficheiro final é guardado diretamente nele.

## Como é que isto é possível

Os browsers modernos têm codificadores e descodificadores de vídeo incorporados, os mesmos que usam nas videochamadas. Uma funcionalidade do browser chamada WebCodecs permite que uma página web os use diretamente. O Universal Video usa estes codecs incorporados para a imagem e o som, e o seu próprio código aberto para ler e escrever o ficheiro MP4 que os envolve.

Como os codecs já fazem parte do seu browser, não há nenhuma transferência grande antes de começar, e não é preciso instalar nada.

## O que isto significa na prática

- **Sem envio e sem fila de espera.** Nada tem de ir a um servidor e voltar, por isso o tempo de uma exportação depende do seu próprio dispositivo.
- **Sem limite de tamanho imposto por nós.** O limite é a memória do seu dispositivo. O artigo sobre ficheiros grandes explica como funciona.
- **Funciona sem ligação.** Depois de a aplicação carregar, pode desligar a internet e continuar a aparar, cortar, juntar e exportar um vídeo. É também a forma mais simples de confirmar que nada é enviado.

## Que browsers funcionam

O Universal Video é testado no Chrome e no Edge em computador. O Safari 16.4 ou posterior inclui WebCodecs e poderá funcionar, mas não foi testado. O Firefox não oferece atualmente o codificador H.264 de que a aplicação precisa, por isso a aplicação avisa-o logo à chegada, em vez de depois de uma longa espera.

## Convém saber

- Os vídeos que adiciona ficam guardados no separador do browser. Recarregar ou fechar o separador termina a sua edição, por isso exporte antes de o fazer.
- Durante uma exportação, o tempo restante baseia-se na velocidade real a que o seu dispositivo está a codificar, por isso torna-se mais preciso à medida que avança.
- Uma resolução de saída mais pequena é mais rápida de codificar, além de ocupar menos espaço.`,
  },
  {
    id: 'export-settings',
    title: 'Escolher as definições de exportação',
    summary: 'Formato do enquadramento, resolução, qualidade, som, e um ou vários ficheiros.',
    group: 'Como funciona',
    body: `As definições do painel de exportação aplicam-se ao vídeo inteiro. Eis o que cada uma faz.

## Enquadramento

O enquadramento é o formato em que o vídeo final é escrito. Pode manter o tamanho original, escolher 1920×1080 (horizontal), 1080×1920 (vertical) ou 1080×1080 (quadrado), ou escrever um tamanho seu.

Se um clipe tiver um formato diferente do enquadramento, é centrado e o resto é preenchido a preto. Nada é cortado: um clipe vertical num enquadramento horizontal mantém a imagem toda e ganha uma barra preta de cada lado. A pré-visualização mostra exatamente o que vai sair.

Os dois lados têm sempre um número par de píxeis, porque o H.264 trabalha por blocos e muitos codificadores recusam tamanhos ímpares.

## Resolução

Mantenha o tamanho original ou limite-o a 4K, 1440p, 1080p, 720p ou 480p. O número indica o lado mais curto, por isso um clipe vertical limitado a 1080p sai com 1080 píxeis de largura. Um vídeo que já seja mais pequeno do que o limite mantém o seu tamanho em vez de ser ampliado.

## Qualidade

- **Smaller** (mais pequeno) comprime ao máximo. Adequado para enviar e para a web.
- **Balanced** (equilibrado) é a predefinição. Bastante mais pequeno e ainda fiel ao original.
- **Best** (melhor) mantém o máximo de detalhe e cria o ficheiro maior dos três.

## Som

Mantenha o som e escolha a respetiva taxa de bits (96, 128, 192 ou 256 kbps), ou desligue-o para criar um vídeo sem som, que fica mais pequeno.

## Um vídeo ou ficheiros separados

Se cortou o vídeo em partes, pode exportá-lo como um único vídeo ou como ficheiros separados (**Separate files**). Nesse caso, cada parte é escrita como um MP4 próprio e todas chegam juntas num único ficheiro zip, numeradas para ficarem pela ordem dos seus cortes. No Chrome e no Edge, é-lhe perguntado primeiro onde guardar o zip, e cada parte é escrita nele assim que fica pronta.

Os ficheiros separados não estão disponíveis quando há clipes sobrepostos em mais de uma faixa, porque dois clipes a tocar ao mesmo tempo não podem ser divididos por um ficheiro cada.

## Antes de exportar

O tamanho previsto do ficheiro aparece no botão de exportar. Se a exportação não couber na memória do seu dispositivo, a aplicação avisa-o antes de começar e sugere uma definição que caberia.`,
  },
  {
    id: 'big-files',
    title: 'Ficheiros grandes e o limite de memória',
    summary: 'Porque é que o tamanho do resultado conta mais do que o do original.',
    group: 'Como funciona',
    body: `Como o Universal Video funciona dentro do seu browser, está limitado pela memória que o browser pode usar. Não há limite de envio, porque não há envio, mas continua a haver um teto.

## O que ocupa a memória

Cada clipe da linha de tempo é lido por inteiro para a memória, e o vídeo final também é montado nela antes de ser guardado. Uma edição com cinco clipes precisa, por isso, de espaço para os cinco e ainda para o resultado.

## O que conta é o resultado

O teto ronda aproximadamente um gigabyte de vídeo final num computador, e menos num telemóvel. O que mais conta é o tamanho do ficheiro que está a criar, não o do ficheiro de partida. Reduzir um vídeo de 2 GB para 300 MB pode funcionar perfeitamente, enquanto transformar um vídeo de 400 MB num de 5 GB não funciona.

## Recusado antes, não depois

Quando um separador do browser fica sem memória, normalmente fecha-se sem dar hipótese de guardar nada. Por isso, a aplicação verifica primeiro:

1. Quando adiciona um vídeo, lê apenas a pequena parte do ficheiro que o descreve, pelo que até um ficheiro muito grande é analisado quase de imediato.
2. Prevê o tamanho do resultado a partir das suas definições.
3. Se não couber, avisa-o antes de começar e propõe uma definição mais pequena que caiba.

Durante a exportação, vê quantos fotogramas estão feitos, o tamanho atual do ficheiro em comparação com a previsão e quanto tempo falta.

## Ultrapassar o teto

- Baixe a resolução ou escolha uma definição de qualidade mais pequena.
- Exporte por partes. No Chrome e no Edge, os ficheiros separados (**Separate files**) são escritos um a um num zip no seu disco, por isso só uma parte tem de caber na memória e o conjunto pode ser tão longo quanto quiser.
- Feche outros separadores e programas pesados antes de uma exportação grande.`,
  },
  {
    id: 'what-leaves-your-device',
    title: 'O que sai do seu dispositivo',
    summary: 'O seu vídeo, nunca. Eis a pequena lista do que sai.',
    group: 'Privacidade e segurança',
    body: `O seu vídeo nunca é enviado. É aberto, editado e exportado pelo seu próprio browser, e nenhuma opção da aplicação o envia para lado nenhum. Também não existe nenhuma alternativa que envie ficheiros grandes para um servidor.

## Para que é que a aplicação usa a internet

Algumas coisas pequenas usam a internet, e nenhuma inclui o seu vídeo ou qualquer informação sobre ele.

- **Carregar a aplicação**, e as notas sobre o que mudou em cada atualização.
- **O vídeo de exemplo**, se o quiser experimentar. É uma transferência para si, não um envio seu.
- **Iniciar sessão com um Universal ID**, apenas se quiser. Nada no Universal Video exige uma conta.
- **Uma nota de que a aplicação foi aberta**, enviada uma vez por visita se tiver sessão iniciada, para que a atividade da sua conta esteja correta. Não inclui o nome, a duração nem o tamanho de nenhum vídeo.
- **Um sinal de «em utilização»**, enviado a cada 45 segundos enquanto a aplicação está aberta e visível no ecrã, para poder mostrar quantas pessoas a estão a usar. Contém o nome da aplicação, um ID aleatório criado neste dispositivo e a sua conta, se tiver sessão iniciada. Não diz nada sobre aquilo em que está a trabalhar.

Não há ferramentas de análise de terceiros, publicidade nem scripts de rastreio.

## Ficheiros recentes

Para poder continuar onde parou, a aplicação guarda os seus vídeos mais recentes no armazenamento do próprio browser, neste dispositivo. Guarda no máximo quatro, nunca guarda um ficheiro com mais de 100 MB e não ultrapassa os 250 MB no total. Os vídeos maiores são abertos, mas não ficam memorizados.

Estas cópias nunca saem do seu dispositivo. Pode remover qualquer uma com a cruz ao lado na lista, e apagar os dados do browser para este site remove-as todas.

## Confirme por si

Carregue a aplicação, desligue o Wi-Fi e edite um vídeo. Aparar, cortar, juntar e exportar continuam a funcionar, porque nada disso acontecia noutro lado.`,
  },
]

export default articles
