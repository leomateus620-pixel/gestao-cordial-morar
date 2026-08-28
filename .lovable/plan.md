# Etapa 8 — Google Drive no cadastro de imóveis

## O que já existe (auditoria)

- **Conexão Drive**: já ativa via conector de workspace (conta compartilhada), usada hoje pelo módulo Aluguéis. As credenciais ficam só no backend (`drive.server.ts`), nunca no navegador. **Será reutilizada como está** — nenhuma segunda autenticação, nenhum token novo.
- **Pasta raiz**: hoje existe uma raiz fixa de Aluguéis salva em `app_settings`. Vamos adicionar uma **segunda raiz, exclusiva de Imóveis**, configurável por link pelo administrador (o link enviado será o valor inicial).
- **Fotos**: as fotos da Etapa 6 já ficam no Storage com versão original privada + versão final com marca (Morar+Cordial), checksum, ordem, capa e **largura/altura já gravadas** — a classificação horizontal/vertical sai daí, sem reprocessar imagem.
- **Fila**: já existe o padrão de fila persistente + worker em segundo plano usado pelo pipeline de marca-d'água e pela publicação Cordial/Morar. A Etapa 8 usa **a mesma infraestrutura**, sem criar um mecanismo paralelo.
- **Checklist**: o item “Fotos enviadas ao Drive” já existe no checklist oficial de Agenciamentos (Etapa 7 e menu Agenciamentos), assim como “Vídeo realizado”. Serão alimentados pelo resultado real.
- **Vídeo**: **não existe hoje** nenhum campo/upload de vídeo. Será criado na Etapa 8.

## O que será entregue

### 1. Configuração administrativa da raiz (Configurações)
Campo “Pasta raiz dos imóveis no Google Drive” + botão **Validar acesso**. O backend extrai o ID do link, confere host e formato, verifica no Drive se a pasta existe, se há permissão de escrita e se suporta criação de subpastas (inclusive Shared Drive). Salva apenas o ID estável, quem configurou e quando. Status exibido: Conectado / Sem permissão / Pasta não encontrada / Reconectar. Nunca cria nada fora dessa raiz e nunca altera compartilhamentos.

### 2. Estrutura no Drive
Para cada imóvel, uma única pasta persistente:

```text
IMÓVEL - CORDIAL 1234 - MORAR 5678
├── 01 - Fotos Horizontais
├── 02 - Fotos Verticais
└── 03 - Vídeos
```

Nome montado por função central a partir dos códigos por provedor (só Cordial, só Morar, ou os dois — nunca um código genérico). Sem endereço, nome do proprietário ou dado pessoal. Se um código mudar depois, a **mesma pasta é renomeada** pelo ID, nunca recriada.

### 3. Etapa 8 no wizard
Cabeçalho com estado da conexão, nome previsto da pasta, códigos e destino. Três cards — Fotos Horizontais, Fotos Verticais, Vídeos — cada um com contagem e estado (Aguardando / Preparando / Enviando 4 de 12 / Concluído / Concluído com pendências / Erro — tentar novamente). Botão “Abrir pasta no Drive” só depois da criação confirmada. Retry por arquivo e por categoria. Link “Voltar à Etapa 6” para ajustar fotos. Área de upload de vídeo exclusiva da Etapa 8. Desktop em linha, mobile empilhado, alvos de toque de 44 px, nomes longos truncados. Nenhum ID, token ou log técnico visível.

### 4. Classificação e versão enviada
Largura ≥ altura → Horizontais; altura > largura → Verticais; quadrada → Horizontais por padrão, com correção manual possível antes de sincronizar (a correção move o vínculo, não duplica arquivo). Vídeos sempre em 03. Sobe **sempre a versão final com marca** já usada na publicação; se a marca ainda estiver processando, o job **espera** — o original sem marca nunca é enviado como alternativa. O Storage continua sendo a fonte original e privada.

### 5. Sincronização real
Fila persistente por arquivo: pending → uploading → uploaded → verifying → synced, com `failed_retryable` / `failed_permanent`. Backoff, limite de tentativas, concorrência controlada, chave de idempotência por checksum. Fotos usam upload simples; vídeos e arquivos grandes usam **upload resumível com checkpoint**. O ID do arquivo no Drive é salvo antes de marcar sucesso e conferido (nome, pasta pai, tamanho). Falha de vídeo não trava fotos; falha no Drive não bloqueia publicação Cordial/Morar nem apaga imóvel/agenciamento. Os jobs continuam rodando depois que o usuário sai da tela; a tela só acompanha o progresso.

### 6. Idempotência
Operação única `ensure-property-drive-structure(propertyId)`: devolve a estrutura existente, cria só o que falta, grava cada ID na hora, recupera criação parcial e não duplica em duplo clique, refresh ou concorrência. Uma pasta de mesmo nome pertencente a outro imóvel nunca é reaproveitada.

### 7. Checklist de Agenciamentos
“Fotos enviadas ao Drive” só é marcado quando a pasta e as três subpastas existirem, todas as fotos ativas e prontas estiverem confirmadas na subpasta correta, sem pendência ou erro permanente, e na revisão atual do imóvel. Vídeo não é exigido para esse item. Ao concluir, o motor atual de validade/bonificação é reexecutado e o corretor é notificado — sem duplicar histórico ou contagem em eventos repetidos.

### 8. Edições posteriores
Foto nova entra sozinha na subpasta certa; mudança de orientação move o vínculo; vídeo novo vai para 03; reordenação renomeia com segurança; mudança de código renomeia a pasta; passar a publicar nos dois sites atualiza o nome e a versão de marca. Nada confirmado é apagado por edição; exclusão definitiva exige ação administrativa; arquivar o imóvel não apaga a pasta.

## Detalhes técnicos

- Migrations pequenas e retrocompatíveis: `property_drive_folders` (1 por imóvel, IDs de raiz/pasta/3 subpastas, status, erro, timestamps) e `property_drive_files` (vínculo com a mídia, categoria, `drive_file_id`, checksum, tamanho, MIME, status, tentativas, erro, timestamps). Índices de fila/status, unique por `property_id` e por mídia+destino ativo, FKs sem cascade destrutivo, RLS e GRANTs no padrão do projeto; tokens nunca são gravados.
- Nova tabela de vídeos do imóvel (`property_videos`) + bucket privado, seguindo o mesmo padrão das fotos.
- Server functions em `src/lib/imoveis/drive/*.functions.ts` com `requireSupabaseAuth`; toda chamada ao Drive fica em `*.server.ts` reaproveitando o cliente e o gateway atuais, com `supportsAllDrives`.
- Worker em `src/routes/api/public/hooks/property-drive-worker.ts` no mesmo formato dos workers existentes, agendado pelo mesmo mecanismo, com RPC de claim/lease.
- Auditoria reaproveitando a tabela de log de Drive já existente (criação, upload, retry, renomeação, exclusão), com correlation ID e mensagens sanitizadas.
- Validação de MIME real, extensão, tamanho e limites de pixel/duração; remoção de metadados sensíveis; nenhum link público.
- Testes: unitários de nome de pasta/arquivo e classificação; integração de idempotência, criação parcial, retry, renomeação e delta; E2E desktop/mobile do progresso. Validação inicial em **pasta de teste controlada**, sem apagar arquivos reais.

## Limitações a confirmar durante a execução
- Se os escopos atuais da conexão não permitirem criar arquivos na raiz informada, o sistema mostra “Reconectar Drive” e avisa que é preciso reautorização administrativa — sem falhar em silêncio.
- Limite de tamanho de vídeo definido pelo runtime; acima disso, o upload resumível é obrigatório e o limite fica explícito na interface.
