# Fotos dos imóveis: envio automático, sem "Tentar novamente"

## O que eu verifiquei agora (dados reais)

- Há **38 fotos com erro de envio** para os sites. Em **33 delas** a mensagem do próprio site é: *"A imagem deve conter no máximo 1 MB!"*. Nossas fotos com marca-d'água estão saindo com **1,2 MB a 2,7 MB** (medi uma delas: 1.350.603 bytes). Ou seja: o site recusa e ninguém reenvia — o erro é definitivo hoje.
- Outras **5 falhas** são instabilidade de rede momentânea (erro 523 / Cloudflare). Também ficam paradas para sempre, porque não existe nova tentativa automática.
- A fila de marca-d'água está limpa agora (0 fotos travadas), mas **quando uma foto precisa do processador do servidor ela morre em definitivo** (o ambiente publicado não roda esse processador) e só volta com clique em "Tentar novamente".
- **782 publicações estão marcadas como desatualizadas** sem nada reenfileirando o envio.
- Testei o redimensionador do próprio armazenamento: a mesma foto de 1,35 MB voltou com **196 KB** (1600 px, qualidade 70). Dá para gerar a cópia de envio no servidor, automaticamente, sem depender do navegador.

## O que será construído

### 1. A foto nunca mais sai acima do limite do site
Antes de enviar, o sistema gera a cópia de envio já reduzida, em degraus (1600 px → 1400 → 1200 → 1024, qualidade decrescente), e confere o tamanho final: só sai se estiver abaixo de 1 MB. Se a transformação falhar, cai no arquivo atual; se nem o menor degrau couber, o erro é classificado e não fica repetindo à toa.

### 2. Reenvio automático das fotos que falharam
Cada foto passa a guardar quantas tentativas já teve e a hora da próxima. Uma rotina roda **a cada 5 minutos** e reenvia sozinha as fotos vencidas (espera crescente: 1, 5, 15 e 60 minutos, até 6 tentativas). Falha permanente não entra no ciclo. Quando todas as fotos entram, a publicação volta a "publicado" sozinha.

### 3. Fim do "Tentar novamente" na marca-d'água
- Falha do processador do servidor deixa de ser definitiva: vira "aguardando ajuste".
- O sistema refaz a marca **automaticamente** quando qualquer pessoa autorizada estiver com o sistema aberto, em segundo plano, sem botão e sem aviso incômodo — usando o mesmo caminho já validado.
- Uma varredura leve, limitada por ciclo, cura o acervo antigo sem alguém precisar abrir imóvel por imóvel.
- O botão "Tentar novamente" sai da tela; fica apenas o indicativo "ajustando fotos automaticamente".
- O envio do imóvel deixa de ficar preso: foto parada há mais de 15 minutos não segura mais a publicação dos dados — ela entra depois, sozinha.

### 4. Fila parada volta a andar
A mesma rotina reenfileira, em lotes, as publicações desatualizadas ou incompletas que estão sem trabalho ativo — as 782 pendentes drenam sozinhas, das mais antigas para as mais novas.

## Detalhes técnicos

- Novo `src/lib/imoveis/delivery.server.ts`: `fetchDeliveryBytes(path, budget)` usando o endpoint `render/image` do Storage com degraus e verificação de bytes; testes unitários da escolha de degrau.
- `src/lib/imobibrasil/sync.server.ts` (`syncImages`): usa a cópia reduzida, classifica erro (`imagem_grande`, `rede`, `provedor`), grava tentativa/próximo horário, e aplica janela de 15 min para fotos em processamento.
- Migration em `property_image_provider_publications`: `attempts`, `next_retry_at`, `error_class` + índice de varredura.
- Novo `runImageDeliverySweep` em `src/lib/imobibrasil/reconcile.server.ts` (ou módulo próprio) + rota `src/routes/api/public/hooks/property-image-retry.ts` protegida por segredo, com cron a cada 5 minutos; enfileira `property_sync_jobs` com `on conflict do nothing` e limite por ciclo.
- `src/lib/imoveis/image-pipeline.server.ts`: erro de WebAssembly vira `aguardando_navegador` não terminal.
- `src/hooks/usePropertyMedia.ts` + novo `useWatermarkAutoHeal`: auto-cura silenciosa com trava de concorrência; remoção do botão em `PropertyPhotosStep.tsx` / painel de fotos.

## Validação que vou trazer

- Testes unitários + verificação de tipos.
- Execução real do varredor, com contagem de fotos em erro **antes e depois**.
- Conferência direta na API dos sites de 1 ou 2 imóveis afetados (fotos presentes, publicação "publicado").
- Confirmação de que nenhuma etapa exige clique manual.
