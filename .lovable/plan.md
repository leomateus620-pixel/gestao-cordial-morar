# Publicação automática por destino, fotos rápidas e recuperação do acervo

## O que o usuário vai ganhar
- No cadastro, um único seletor de destino: **Cordial**, **Morar** ou **Ambos**. Ao concluir, a publicação começa sozinha nos sites escolhidos, sem clicar em Publicar na ficha.
- Progresso real na tela: salvando, enviando originais, processando X/Y fotos, aguardando correção, Cordial, Morar, concluído. Se fechar o navegador, o trabalho continua.
- Fotos processadas mais rápido, com meta medida (20 fotos em ~30–60 s), sem perder qualidade nem marca d'água.
- Imóveis válidos que ainda não aparecem nos sites são recuperados em lotes; os bloqueados ficam listados com motivo.
- Três imóveis de teste (Ambos, só Cordial, só Morar) comprovam o fluxo nos sites publicados e depois são removidos.

## Etapas

1. **Diagnóstico atualizado (só leitura)**
   - Reler AGENTS.md, migrações aplicadas e definições reais de `cordial_site_*`/`morar_site_*`, visões `*_site_authorized_media`, dispatcher de fotos e crons.
   - Inventário antes por imóvel e destino (reaproveitando `owned_channel_take_inventory`).
   - Explicar por que nenhum imóvel tem `registration_completed_at` (82 com origem Gestão) e onde a intenção de publicar se perde entre conclusão, fotos e ativação.

2. **Destino único**
   - Módulo puro de destinos (normaliza "ambas" → as duas marcas, sem duplicar), usado pelo formulário, conclusão, marca d'água, publicação, filtros e recuperação.
   - Substituir "Sites integrados ao fornecedor anterior" + checkbox `publishOwnedMorar` por seletor Cordial/Morar/Ambos. `publishOwnedMorar` continua aceito por compatibilidade, convertido para o mesmo destino, nunca contraditório.
   - Mudar destino atualiza só os canais afetados; retirar uma marca não toca a outra.

3. **Conclusão com publicação automática** (em `finalizePropertyRegistration`)
   - Uma RPC transacional nova grava conclusão + intenção por destino + revisão + manifesto da galeria (fotos esperadas, ordem, capa).
   - Intenção do operador com permissão vale como decisão; autorização/disponibilidade vêm do cadastro, nunca preenchidas por padrão.
   - Sem ciclo: concluir não exige publicação ativa; ativar exige conclusão + mídias prontas.
   - Gatilho/rotina retoma a intenção quando a última foto fica pronta ou uma pendência é corrigida. Retirada manual, rascunho, oculto, indisponível ou arquivado nunca são republicados automaticamente.
   - Agenciamento automático idempotente preservado; responsável segue a regra atual.

4. **Fotos rápidas e confiáveis**
   - Upload direto ao armazenamento com concorrência limitada, progresso por arquivo e retomada (arquitetura atual mantida).
   - Trocar o encadeamento frágil (`void fetch` em `property-image-worker`) por despacho durável pelo banco (fila + chamada interna autenticada via `internal_worker_headers()`), com lote e concorrência ajustáveis; cron fica só como vigia.
   - Leases por foto, tentativas com espera crescente e erro por arquivo; nunca recomeçar a galeria inteira.
   - Derivados gerados uma vez, compartilhados entre marcas quando a variante permitir, mantendo marca d'água Cordial/Morar/conjunta.
   - Primeiro anúncio só aparece com galeria completa e capa; edição de anúncio já no ar mantém a versão pública estável até a nova ficar pronta (retirada e privacidade continuam imediatas).

5. **Confirmação real por marca**
   - Verificação ligada à revisão: catálogo e detalhe corretos, descrição/campos públicos, total de fotos = manifesto, capa e ordem, arquivos de imagem decodificáveis, ausência no destino não escolhido.
   - "Ambos" só fica concluído com as duas marcas confirmadas; falha em uma é retomada só nela.
   - Tela com acompanhamento por consulta periódica limitada, tolerante a reconexão.

6. **Recuperação do acervo**
   - Simulação classificando cada imóvel/destino: pedido preso, completo sem intenção, pendência de fotos, falta de autorização/disponibilidade, retirado/oculto/arquivado, legado sem marcador de conclusão.
   - Executar em lotes idempotentes só os comprovadamente elegíveis, com prioridade menor que cadastros novos e sem reprocessar fotos legadas. Lista final de bloqueados com motivo e correção.

7. **Testes isolados, publicação e testes reais**
   - Testes automatizados: destinos, conclusão + intenção, retomada após foto, retirada não revertida, revisão antiga, clique repetido, falha parcial, Imobi OFF.
   - Medir tempos (upload, conclusão→público, fila, cache frio), inclusive duas galerias simultâneas.
   - **Publicação do app**: necessária para testar nos domínios reais; farei somente após os testes isolados passarem e confirmarei a versão em execução.
   - Três imóveis "TESTE TÉCNICO TEMPORÁRIO" com 20+ imagens sintéticas numeradas, criados pelo menu Imóveis; conferência sem login em desktop e celular nos dois sites, API pública e arquivos; um ensaio de interrupção/retry.
   - Remoção: retirar dos sites, apagar só os registros, fotos, agenciamentos, reservas e pastas criados pelo teste; comprovar saída de busca, detalhe, sitemap e mídia. Sem nenhuma ação na ImobiBrasil.

8. **Entrega**: inventário antes/depois (novas publicações listadas como diferenças intencionais), arquivos/RPCs/gatilhos/filas alterados, tempos medidos e limitações, contagem recuperada/bloqueada por marca, confirmação da remoção dos testes.

## Detalhes técnicos
- Migrações apenas aditivas pelo journal Drizzle; o banco é compartilhado entre prévia e publicado, então a RPC nova aceita os dois formatos até a publicação do app.
- Imobi OFF mantido (`integration-switch.ts` + gatilho de cancelamento); nenhum token ou fila antiga participa.
- Novas tabelas recebem GRANTs, RLS e a política restritiva `meta_reviewer_block`.
- Não tocar NFS-e, boleto, recibos, Drive compartilhado nem imóveis reais fora da recuperação autorizada.

## Riscos e limites
- A meta de 30–60 s depende do limite de CPU/tempo da hospedagem; se não for atingida, entrego medição, gargalo e correção proposta, sem reduzir fotos ou qualidade.
- Se alguma rotina agendada não puder ser lida/alterada por permissão, registro o impedimento exato.
