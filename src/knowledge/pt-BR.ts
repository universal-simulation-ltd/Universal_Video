import type { Article } from './types'

const articles: Article[] = [
  {
    id: 'containers-and-codecs',
    title: 'Contêineres e codecs',
    summary: 'Por que “MP4” é o nome da caixa, não do que está dentro dela.',
    group: 'O básico',
    body: `Um arquivo de vídeo são, na verdade, duas coisas trabalhando juntas: um contêiner e um ou mais codecs.

## O contêiner

O contêiner é a caixa. Ele guarda a faixa de imagem, a faixa de som e as informações que mantêm as duas sincronizadas, como quanto tempo dura cada quadro e onde cada um fica dentro do arquivo. MP4, MOV e MKV são contêineres. A extensão de um arquivo, como .mp4 ou .mov, normalmente indica o contêiner e nada mais.

## O codec

Um codec é o método usado para comprimir a imagem ou o som para que ocupem menos espaço, e para descomprimi-los na reprodução. H.264 (também chamado de AVC) e H.265 (também chamado de HEVC) são codecs de vídeo comuns. AAC e Opus são codecs de áudio comuns.

É por isso que dois arquivos terminados em .mp4 podem se comportar de forma diferente. Um pode conter vídeo H.264, que quase todo aparelho reproduz, enquanto o outro usa um codec mais novo que um celular ou uma TV antiga não consegue decodificar.

## O que o Universal Video lê e grava

O Universal Video abre arquivos MP4, M4V e MOV e gera MP4 com vídeo H.264 e som AAC. Essa combinação é usada porque toca em quase todo lugar: em celulares, computadores e TVs, e na maioria dos sites e aplicativos de mensagens.

Alguns arquivos ele não consegue abrir:
- **MKV e WebM**, que usam outro tipo de contêiner.
- **AVI e WMV**, que em geral também precisam de codecs que os navegadores não incluem.
- **MP4 fragmentado**, uma variante gerada por alguns gravadores de tela e aplicativos de celular.

Se um arquivo não puder ser aberto, o aplicativo explica o motivo assim que você o adiciona, em vez de falhar no meio do caminho.`,
  },
  {
    id: 'resolution-bitrate-frame-rate',
    title: 'Resolução, taxa de bits e taxa de quadros',
    summary: 'Os três números que definem a aparência de um vídeo e o tamanho dele.',
    group: 'O básico',
    body: `Três números descrevem quase tudo o que você precisa saber sobre um vídeo.

## Resolução

A resolução é o tamanho de cada quadro em pixels, escrito como largura por altura. 1920×1080 costuma ser chamado de Full HD ou 1080p, 1280×720 é 720p e 3840×2160 é 4K. Mais pixels significam mais detalhes, mas também mais dados para guardar em cada quadro.

O número com o “p” indica o lado menor da imagem. Um vídeo 1080p gravado com o celular na vertical tem 1080 pixels de largura e 1920 de altura.

## Taxa de quadros

A taxa de quadros é quantas imagens aparecem a cada segundo, medida em quadros por segundo (fps). O cinema tradicionalmente usa 24 fps, muitos vídeos usam 25 ou 30 fps, e os celulares costumam gravar a 60 fps para um movimento mais suave. O dobro da taxa de quadros significa mais ou menos o dobro de imagens para guardar.

## Taxa de bits

A taxa de bits é a quantidade de dados usada em cada segundo de vídeo, normalmente em megabits por segundo (Mbps). É o número que mais diretamente define o tamanho do arquivo: um minuto a 8 Mbps dá cerca de 60 MB, qualquer que seja a resolução.

Com a mesma taxa de bits, uma imagem maior tem menos bits para cada pixel, então pode ficar pior do que uma menor. Por isso reduzir a resolução costuma ser o jeito mais eficaz de diminuir um arquivo sem que ele fique com aparência ruim.

## Como o Universal Video usa esses números

Você escolhe a resolução e uma das três opções de qualidade: **Smaller** (menor), **Balanced** (equilibrada) ou **Best** (melhor). Ninguém pede uma taxa de bits a você. O aplicativo calcula uma a partir do tamanho do quadro e da taxa de quadros, então um clipe 4K recebe um orçamento maior que um de 720p com a mesma opção. A taxa de quadros segue a do seu vídeo original.

O tamanho previsto do arquivo final é calculado a partir dessas opções e aparece no botão de exportar antes de você clicar nele.`,
  },
  {
    id: 'why-video-files-are-big',
    title: 'Por que arquivos de vídeo são tão grandes',
    summary: 'O que a compressão faz, e por que reduzir um vídeo é sempre uma troca.',
    group: 'O básico',
    body: `Vídeo é um monte de imagens. Um único quadro 1080p tem pouco mais de dois milhões de pixels, e cada um precisa de uma cor. Sem nenhuma compressão, um segundo de vídeo 1080p a 30 quadros por segundo ocuparia cerca de 190 MB, e uma hora encheria a maioria dos notebooks.

## Como a compressão reduz isso

Codecs de vídeo como o H.264 se baseiam em duas ideias principais.

- **Dentro de um quadro**, eles gastam menos detalhes onde é pouco provável que o olho perceba, como em áreas lisas de céu ou em texturas finas.
- **Entre quadros**, eles guardam só o que mudou. Na maioria dos vídeos, boa parte de cada imagem é igual à anterior, então um quadro muitas vezes pode ser descrito como “o anterior, com estas partes deslocadas”.

Os quadros guardados por inteiro se chamam quadros-chave. Os intermediários dependem deles, e é por isso que um programa de edição precisa começar a decodificar a partir de um quadro-chave mesmo quando você corta num ponto intermediário.

## Por que recodificar deixa os arquivos menores

Celulares e câmeras gravam com uma taxa de bits alta para acompanhar tudo em tempo real e guardar bastante detalhe. Recodificar com uma taxa de bits menor, uma resolução menor ou as duas coisas muitas vezes deixa um arquivo várias vezes menor, e ele continua com boa aparência na tela de um celular ou notebook.

Mas é sempre uma troca. Cada vez que um vídeo é comprimido, parte do detalhe se perde para sempre, e comprimir de novo não traz esse detalhe de volta. Guarde o original se você puder precisar da qualidade total depois.

## Quando um arquivo fica maior

Recodificar nem sempre diminui o arquivo. Se o original já estava muito comprimido e você escolher uma resolução maior ou a opção **Best**, o novo arquivo pode ficar maior. O Universal Video mostra o tamanho previsto antes de exportar, para você ver isso antes de decidir.`,
  },
  {
    id: 'where-the-work-happens',
    title: 'Onde o seu vídeo é processado',
    summary: 'Cada etapa acontece no seu navegador, no seu aparelho.',
    group: 'Como funciona',
    body: `O Universal Video faz todo o trabalho dentro da aba do navegador que você está usando. O seu vídeo é aberto, decodificado, editado e recodificado no seu próprio aparelho, e o arquivo final é salvo direto nele.

## Como isso é possível

Os navegadores modernos têm codificadores e decodificadores de vídeo embutidos, os mesmos que usam em chamadas de vídeo. Um recurso do navegador chamado WebCodecs permite que uma página da web use esses componentes diretamente. O Universal Video usa esses codecs embutidos para a imagem e o som, e o próprio código aberto para ler e gravar o arquivo MP4 em volta deles.

Como os codecs já fazem parte do seu navegador, não há um download grande antes de começar, e não é preciso instalar nada.

## O que isso significa na prática

- **Sem envio e sem fila.** Nada precisa ir até um servidor e voltar, então o tempo de uma exportação depende do seu próprio aparelho.
- **Sem limite de tamanho imposto por nós.** O limite é a memória do seu aparelho. O artigo sobre arquivos grandes explica como isso funciona.
- **Funciona off-line.** Depois que o aplicativo carregar, você pode desligar a internet e continuar aparando, cortando, juntando e exportando um vídeo. Essa também é a forma mais simples de conferir que nada está sendo enviado.

## Quais navegadores funcionam

O Universal Video é testado no Chrome e no Edge em computador. O Safari 16.4 ou mais recente inclui WebCodecs e pode funcionar, mas não foi testado nele. O Firefox não oferece hoje o codificador H.264 de que o aplicativo precisa, então o aplicativo avisa logo que você chega, em vez de depois de uma longa espera.

## Bom saber

- Os vídeos que você adiciona ficam guardados na aba do navegador. Recarregar ou fechar a aba encerra a sua edição, então exporte antes de fazer isso.
- Durante uma exportação, o tempo restante é calculado pela velocidade real com que o seu aparelho está codificando, então ele fica mais preciso conforme avança.
- Uma resolução de saída menor é mais rápida de codificar, além de ocupar menos espaço.`,
  },
  {
    id: 'export-settings',
    title: 'Como escolher as opções de exportação',
    summary: 'Formato do quadro, resolução, qualidade, som, e um arquivo ou vários.',
    group: 'Como funciona',
    body: `As opções do painel de exportação valem para o vídeo inteiro. Veja o que cada uma faz.

## Quadro

O quadro é o formato em que o vídeo final é gravado. Você pode manter o tamanho original, escolher 1920×1080 (horizontal), 1080×1920 (vertical) ou 1080×1080 (quadrado), ou digitar um tamanho próprio.

Se um clipe tiver um formato diferente do quadro, ele é centralizado e o resto é preenchido de preto. Nada é cortado: um clipe vertical num quadro horizontal mantém a imagem inteira e ganha uma faixa preta de cada lado. A prévia mostra exatamente o que vai sair.

Os dois lados sempre têm um número par de pixels, porque o H.264 trabalha em blocos e muitos codificadores recusam tamanhos ímpares.

## Resolução

Mantenha o tamanho original ou limite a 4K, 1440p, 1080p, 720p ou 480p. O número indica o lado menor, então um clipe vertical limitado a 1080p sai com 1080 pixels de largura. Um vídeo que já é menor que o limite mantém o próprio tamanho em vez de ser ampliado.

## Qualidade

- **Smaller** (menor) comprime ao máximo. Bom para enviar e para a web.
- **Balanced** (equilibrada) é o padrão. Bem menor, e ainda parecido com o original.
- **Best** (melhor) mantém o máximo de detalhes e gera o maior arquivo dos três.

## Som

Mantenha o som e escolha a taxa de bits dele (96, 128, 192 ou 256 kbps), ou desligue-o para gravar um vídeo mudo, que fica menor.

## Um vídeo ou arquivos separados

Se você cortou o vídeo em partes, pode exportá-lo como um só vídeo ou como arquivos separados (**Separate files**). Nesse caso, cada parte é gravada como um MP4 próprio e todas chegam juntas num único arquivo zip, numeradas para ficarem na ordem dos seus cortes. No Chrome e no Edge, você escolhe primeiro onde salvar o zip, e cada parte é gravada nele assim que fica pronta.

Arquivos separados não estão disponíveis quando há clipes empilhados em mais de uma faixa, porque dois clipes tocando ao mesmo tempo não podem ser divididos em um arquivo cada.

## Antes de exportar

O tamanho previsto do arquivo aparece no botão de exportar. Se a exportação não couber na memória do seu aparelho, o aplicativo avisa antes de começar e sugere uma opção que caberia.`,
  },
  {
    id: 'big-files',
    title: 'Arquivos grandes e o limite de memória',
    summary: 'Por que o tamanho do resultado importa mais que o do original.',
    group: 'Como funciona',
    body: `Como o Universal Video funciona dentro do seu navegador, ele depende da quantidade de memória que o navegador pode usar. Não existe limite de envio, porque não há envio, mas ainda existe um teto.

## O que ocupa a memória

Cada clipe da linha do tempo é carregado inteiro na memória, e o vídeo final também é montado nela antes de ser salvo. Então uma edição com cinco clipes precisa de espaço para os cinco, mais o resultado.

## O que conta é o resultado

O teto fica por volta de um gigabyte de vídeo final num computador, e menos num celular. O que mais importa é o tamanho do arquivo que você está gerando, não o do arquivo de origem. Reduzir um vídeo de 2 GB para 300 MB pode funcionar muito bem, enquanto transformar um vídeo de 400 MB num de 5 GB não vai funcionar.

## Recusado antes, não depois

Quando uma aba do navegador fica sem memória, ela normalmente simplesmente fecha, sem chance de salvar nada. Por isso o aplicativo confere antes:

1. Quando você adiciona um vídeo, ele lê só a pequena parte do arquivo que o descreve, então até um arquivo muito grande é analisado quase na hora.
2. Ele prevê o tamanho do resultado a partir das suas opções.
3. Se não couber, ele avisa antes de começar e oferece uma opção menor que caberia.

Durante a exportação, você vê quantos quadros já foram feitos, o tamanho do arquivo até agora em comparação com a previsão e quanto tempo falta.

## Como passar do teto

- Diminua a resolução ou escolha uma opção de qualidade menor.
- Exporte em partes. No Chrome e no Edge, os arquivos separados (**Separate files**) são gravados um de cada vez num zip no seu disco, então só uma parte precisa caber na memória e o conjunto pode ser tão longo quanto você quiser.
- Feche outras abas e programas pesados antes de uma exportação grande.`,
  },
  {
    id: 'what-leaves-your-device',
    title: 'O que sai do seu aparelho',
    summary: 'O seu vídeo, nunca. Esta é a pequena lista do que sai.',
    group: 'Privacidade e segurança',
    body: `O seu vídeo nunca é enviado. Ele é aberto, editado e exportado pelo seu próprio navegador, e nenhuma opção do aplicativo o manda para lugar algum. Também não existe uma alternativa que envie arquivos grandes para um servidor.

## Para que o aplicativo usa a internet

Algumas coisas pequenas usam a internet, e nenhuma delas inclui o seu vídeo ou qualquer informação sobre ele.

- **Carregar o aplicativo**, e as notas sobre o que mudou em cada atualização.
- **O vídeo de exemplo**, se você quiser experimentar. Isso é um download para você, não um envio seu.
- **Entrar com um Universal ID**, só se você quiser. Nada no Universal Video exige uma conta.
- **Um aviso de que o aplicativo foi aberto**, enviado uma vez por visita se você estiver conectado, para que a atividade da sua conta fique correta. Ele não inclui o nome, a duração nem o tamanho de nenhum vídeo.
- **Um sinal de “em uso”**, enviado a cada 45 segundos enquanto o aplicativo está aberto e na tela, para mostrar quantas pessoas o estão usando. Ele contém o nome do aplicativo, um ID aleatório criado neste aparelho e a sua conta, se você estiver conectado. Não diz nada sobre o que você está fazendo.

Não há análise de terceiros, publicidade nem scripts de rastreamento.

## Arquivos recentes

Para você poder continuar de onde parou, o aplicativo guarda os seus vídeos mais recentes no armazenamento do próprio navegador, neste aparelho. Ele guarda no máximo quatro, nunca guarda um arquivo com mais de 100 MB e não passa de 250 MB no total. Vídeos maiores são abertos, mas não ficam guardados.

Essas cópias nunca saem do seu aparelho. Você pode remover qualquer uma delas com o X ao lado na lista, e limpar os dados do navegador para este site apaga todas.

## Confira você mesmo

Carregue o aplicativo, desligue o Wi-Fi e edite um vídeo. Aparar, cortar, juntar e exportar continuam funcionando, porque nada disso estava acontecendo em outro lugar.`,
  },
]

export default articles
