# Publicar imóvel na última etapa + menu Imóveis para corretores e secretária

## 1. Botão final vira "Publicar imóvel"

Hoje o botão da última etapa mostra "Salvar rascunho" e só publica se a caixinha
"Publicar nos sites selecionados logo após salvar" estiver marcada.

Mudanças:
- O botão da última etapa passa a se chamar **"Publicar imóvel"**.
- A caixinha de publicação sai da tela: clicar no botão já salva o cadastro e
  envia para os sites escolhidos na Etapa 1 (Cordial, Morar ou os dois).
- Se nenhum destino estiver marcado, o botão fica como "Salvar imóvel" e apenas
  grava no catálogo — sem publicar em site nenhum (evita erro silencioso).
- Mensagens de retorno: sucesso confirma para quais imobiliárias foi enviado; se
  o envio ao site falhar, o imóvel continua salvo e o aviso explica o motivo.

## 2. Menu Imóveis liberado para corretor e secretária

- "Imóveis" passa a aparecer na navegação dos perfis **corretor** e
  **secretária**, com as mesmas ações do admin: ver, cadastrar, editar,
  publicar e excluir.
- Nenhum outro menu é liberado — financeiro, relatórios, corretores, etc.
  continuam restritos como estão hoje.
- As regras do banco (RLS) do módulo de imóveis já permitem corretor/admin nas
  operações principais; a liberação faltante é revisada e ajustada para que
  secretária e corretor tenham o mesmo alcance do admin apenas nas tabelas de
  imóveis (imóvel, fotos, vídeos, publicações e sincronização).

## Detalhes técnicos

- `src/routes/_app.imoveis.novo.tsx`: remover o estado/checkbox `publicar`,
  tratar `destinos.length > 0` como intenção de publicar, ajustar `submitLabel`
  para "Publicar imóvel" / "Salvar imóvel" e manter a chamada existente de
  `enqueue.mutateAsync({ providers: destinos, action: "publish" })`.
- `src/lib/mock/permissions.ts`: adicionar `"imoveis"` aos `modules` e
  `imoveis:read` / `imoveis:write` às `permissions` de `secretaria` e
  `corretor`.
- Revisar as policies de `properties`, `property_images`, `property_videos`,
  `property_provider_publications` e `property_sync_jobs` e, se necessário,
  aplicar uma migração para incluir os perfis corretor/secretária nas ações de
  leitura/escrita do módulo de imóveis.
- Rota `/imoveis` já é protegida por `RequireModuleAccess module="imoveis"`;
  ela passa a permitir os novos perfis automaticamente.
