# Homologação de vistorias em campo · 26/11/2026

## Antes da mudança

A sessão de administrador autorizada abriu a vistoria em andamento pela central de [cordialgestao.com](https://cordialgestao.com/). Em uma aba HTTPS do Chrome 158.0.8127.37 no macOS 26.6, a Sala mostrou a orientação sobre permissão, manteve o disparo desabilitado e reportou vídeo de 0 × 0, sem stream vinculado no momento da leitura. Fechar o painel devolveu à Sala com a mesma contagem. A observação não alterou a vistoria. O domínio serviu o arquivo `_app.vistorias._vistoriaId-VuX6LCQO.js`, SHA-256 `11af51613046d0ba3d336e767da1dc12435edc6a62a97455a12a1f9aa846ce4d`. O arquivo continha os caminhos de abertura e disparo da revisão local `b8480970`. O ambiente não expôs o SHA do Git no HTML ou nos cabeçalhos.

| Etapa | Evidência |
| --- | --- |
| Abertura e atualização do contador | Com stream simulado, uma nova renderização do pai fez 2 pedidos de câmera e interrompeu 1 stream. |
| Reprodução | Com `video.play()` rejeitado por `NotSupportedError` e quadro de 0 × 0, a revisão antiga habilitou o disparo. |
| Fechamento | Ao entregar o stream depois da desmontagem, a revisão antiga fez 0 chamadas a `stop()`. |
| Seletor nativo | O código antigo chamava o seletor na rejeição assíncrona e usava `multiple` no mesmo campo de captura. Os anexos mostram o aviso de memória do Android no retorno. Eles não permitem confirmar se o navegador recebeu um arquivo ou se recriou a página. |
| Arquivo e envio | O código antigo tirava um segundo quadro para a prévia de um arquivo acima de 4.000.000 bytes. A associação nativa dependia do cômodo ativo no retorno. A limpeza global do marcador no evento de foco podia anteceder a entrega ou a gravação local. |

## Depois da mudança

A prévia Vite usou as telas do app com locação e transporte sintéticos. Com viewport de 390 × 844, a câmera simulada entregou um vídeo de 1920 × 1440 em reprodução, com `readyState=4`. Foram capturadas cinco fotos na Sala e cinco na Cozinha. Os dois cômodos voltaram com as mesmas contagens e miniaturas após voltar à locação e abrir a vistoria de novo. Um áudio simulado e um texto ficaram vinculados à Cozinha. A revisão mostrou Sala e Cozinha com cinco fotos em cada. Também foram exercitadas a criação avulsa de saída e a volta à central com a busca e o filtro restaurados. Em 390 × 844 e 1280 × 960 foram conferidos hierarquia, navegação, foco visível, nomes dos controles na árvore de acessibilidade e espaço para o rodapé com rolagem.

A câmera produz o JPEG e a miniatura do mesmo quadro. Para 1920 × 1440, a superfície principal em RGBA ocupa cerca de 10,5 MiB e a de 360 × 270 ocupa cerca de 0,37 MiB. Os testes verificam a liberação das superfícies e a recusa da decodificação integral quando uma foto de 48 MP não pode ser reduzida. Esses tamanhos são estimativas das superfícies, sem medição do processo do navegador ou da câmera nativa. A importação, a persistência local e o envio foram exercitados com arquivos sintéticos. A capacidade de decodificar arquivos reais grandes varia com o aparelho e o navegador.

| Estado | Antes em 390 px | Depois |
| --- | --- | --- |
| Central | [Busca abaixo da retomada](antes-central-390.jpg) | [Celular](depois-central-390.jpg) · [Desktop](depois-central-1280.jpg) |
| Nova vistoria | [Imóvel](antes-criacao-390.jpg) | [Imóvel e tipo](depois-criacao-390.jpg) |
| Cômodo vazio | [Sala](antes-comodo-vazio-390.jpg) | [Sala](depois-comodo-vazio-390.jpg) |
| Fotos e áudio | | [Cômodo](depois-comodo-fotos-audio-1280.jpg) · [Controles de áudio](depois-comodo-audio-controles-1280.jpg) |
| Câmera | | [Vídeo simulado](depois-camera-pronta-390.jpg) · [Permissão negada simulada](depois-camera-permissao-390.jpg) |

## Banco e suítes

O esquema atual possui chave de mídia por vistoria, vínculo composto de vistoria, cômodo e item, controle de acesso e snapshot ordenado para emissão. A mudança não exige migração. A suíte Vistoria usa PGlite local com as migrações do cenário e testa a associação das fotos e descrições ao snapshot do termo com perfil de secretária. A suíte Aluguéis usa seu cenário local de workflow para conferir entrada, retomada, emissão e liberação da saída. As suítes de interface usam DOM simulado. Esses testes usam dados fictícios e não acessam o banco hospedado.

Comandos de homologação

- `bun run test:vistoria`
- `bun run test:vistoria-ui`
- `bun run test:rentals`
- `bun run test:rentals-ui`
- `bun run typecheck`
- `bun run build`
- `bunx vite --config tests/vistoria/vite.config.ts` e `/tests/vistoria/preview.html?state=rental&camera=simulada`. Para permissão negada, use `camera=negada`. Para o cadastro avulso, use `state=new`.

## Roteiro pendente em aparelhos físicos

1. No [Gestão](https://cordialgestao.com/), abra em aba normal uma locação de homologação como secretária. Anote o modelo, sistema, versão do Chrome ou Safari e revisão servida. No Android, comece com a permissão de câmera já concedida ao domínio.
2. Abra Aluguéis → locação → Vistoria de entrada. Abra a Sala, espere a imagem ao vivo, tire uma foto e confira a miniatura. Volte ao cômodo e repita na Cozinha. Faça pelo menos dez fotos entre os dois cômodos. Conte as fotos antes e depois da sincronização, reabra a locação e abra uma foto de cada cômodo.
3. Teste no Android e no iPhone o seletor nativo, a galeria com múltiplos arquivos, cancelar, plano de fundo, recarga durante seleção e retorno ao mesmo cômodo. Em aparelho de teste, repita com foto grande, pouco espaço e rede interrompida. Registre etapa, tempo, dimensões, tamanho, classe de erro e se houve recarga. Em caso de interrupção antes da gravação, confira o aviso no cômodo original e refaça a foto faltante.
4. Ainda com a sessão de homologação, salve uma descrição e um áudio, ouça o áudio e aprove os relatos. Emita o termo, abra o PDF e confira ordem, fotos e descrições da Sala e da Cozinha. Confirme o bloqueio da saída antes do termo de entrada e a liberação depois. Repita a criação avulsa, as marcas Cordial e Morar e um perfil de acesso restrito.
5. Guarde como evidência somente arquivos sintéticos. Em resultados de campo, registre medidas e classes de erro sem fotos de clientes, áudio, endereços ou URLs assinadas.

A validação em Android e iPhone físicos e a emissão autenticada em locação de homologação permanecem pendentes. A reprodução no domínio usou a sessão de administrador autorizada.
