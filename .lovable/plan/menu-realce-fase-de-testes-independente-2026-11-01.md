# Menu Realce — fase de testes independente

## O que o usuário terá
Novo item **Realce** (ícone de varinha/brilho) logo após **Imóveis** na barra lateral, no menu **Mais** do celular e no drawer. Liberado para Administração, Secretária e Corretor (checado também no servidor). Perfil de revisão Meta não acessa.

Fluxo único em uma tela: **Adicionar fotos → Realçar → Comparar → Baixar**.

1. **Adicionar**: área grande de arrastar/soltar e botão "Escolher fotos" (abre galeria no celular). Miniaturas aparecem na hora (geradas em segundo plano, sem travar). Remover foto, adicionar mais, contador. Aceita JPG, PNG, WebP e HEIC/HEIF (iPhone, convertido no próprio aparelho antes do envio; se a conversão falhar, aviso claro sugerindo "Mais compatível" na câmera do iPhone). Limite por foto e por teste com mensagem objetiva.
2. **Escolher**: todas marcadas por padrão; desmarcar uma a uma; botão secundário **"Simular seleção de 25%"** (arredonda para cima: 10→3, 20→5) que só sugere, editável. Faixa mostra "X de Y fotos serão realçadas".
3. **Realçar**: botão principal **✦ Realçar fotos**. Estados reais por foto: Aguardando, Enviando, Processando, Pronta para comparar, Falha. Resumo "3 de 5 fotos prontas". Sem percentuais fictícios.
4. **Comparar**: visualização grande com controle deslizante Original × Realçada (toque e mouse), imagens alinhadas sem corte. Ações: Baixar foto realçada, Manter original, Tentar novamente, Excluir teste. Lote: **Baixar todas (ZIP)**. Aviso quando o resultado volta com resolução/proporção diferente.

Histórico simples dos testes do próprio usuário (admin vê todos para acompanhamento). Visual: fotos em destaque, topo compacto no padrão das telas recém-reorganizadas (Sora + Manrope, paleta petróleo), ações fixas no rodapé no celular sem cobrir a foto.

## Tratamento
- **Realce Natural (IA)**: edição real pela IA de imagens já disponível no projeto (Lovable AI, modelo padrão de edição de imagem da OpenAI), usando a instrução-base do pedido, adaptada para preservar orientação e proporção. Não precisa de chave nova.
- **Preset fotográfico (sem IA)**: ajuste controlado de exposição, sombras, balanço de branco, contraste, saturação e nitidez, identificado claramente como "Preset — sem IA", para comparação.
- Nunca se mostra a original como editada; o selo indica qual técnica gerou cada resultado.

## O que NÃO muda
Fotos e galerias de imóveis, sites, Google Drive, marca-d'água e as filas existentes ficam intocados. Nada é publicado.

## Custos e limites
Cada foto realçada por IA consome créditos de IA da workspace (cobrança real por uso, valor conforme tabela do provedor — não estimo). Limite diário por usuário configurável e proteção contra cliques repetidos.

## Detalhes técnicos
- **Módulo** `realce` em `AppModule`/papéis (admin, secretaria, corretor); entrada em `module-menu.ts` seção operação; rotas `_app.realce.index.tsx` e `_app.realce.$testeId.tsx`.
- **Código** em `src/lib/realce/` com `AGENTS.md` próprio: `model.ts` (regra 25%, estados, nomes `nome-realce.jpg`), `provider.ts` (interface) + `provider-gateway.server.ts` (Lovable AI `/v1/images/edits`) + `provider-preset.server.ts`; `realce.functions.ts` (createServerFn + requireSupabaseAuth).
- **Banco** (Drizzle, aditivo): `realce_tests`, `realce_items` (status, provider, tentativa, request key idempotente, dimensões, erros sanitizados), `realce_events`. RLS: dono ou admin; política restritiva `meta_reviewer_block`; GRANTs.
- **Storage** bucket privado `realce`, caminhos `<user>/<test>/original|result/<item>`; downloads só por URL assinada curta. Resultado exportado sem EXIF/GPS; original preservado.
- **Processamento independente da aba**: job registrado no servidor; worker em `/api/public/hooks/realce-worker` autenticado com `internal_worker_headers()`, cron a cada minuto + disparo imediato; concorrência 2–3; lease. Chamada à IA marcada "processando" antes do envio; falha de transporte ambígua vira **incerto** sem reenvio automático (usuário decide "Tentar novamente"). Retentativa automática limitada só para 429/5xx claros. Créditos insuficientes/acesso negado pausam e mostram mensagem.
- **Qualidade**: orientação EXIF aplicada antes do envio; tamanho escolhido conforme proporção suportada pelo modelo; resultado validado (dimensões/proporção) e marcado quando diverge. JPEG qualidade alta.
- **Limpeza**: excluir teste apaga arquivos; testes com mais de 30 dias removidos por rotina.
- **ZIP** montado no navegador (fflate) a partir das URLs assinadas.
- **Preparação futura**: interface de provedor e modelo de seleção reutilizáveis para imóveis; nenhum vínculo com `property_*`, Drive ou watermark agora.
- **Testes**: unitários da regra 25% (4→1, 10→3, 15→4, 20→5, 30→8), estados/idempotência, permissões; Playwright no computador e no celular (390px) com edição real de fotos internas/externas, horizontal/vertical; medição de tempos; typecheck e build.
