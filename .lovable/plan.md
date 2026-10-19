# Verificação após aumento do banco (Mini, 1 GB) e conclusão do incidente 19/10

Situação agora: o backend voltou a responder (login, banco e a ligação entre eles respondem em menos de 0,5 s).

## 1) Saúde (somente leitura)
- Painel de saúde do banco: memória, conexões, disco, reinícios e alertas depois da troca.
- Login de verdade com a conta de teste: perfil, permissões e imobiliárias carregam e a casca do sistema abre (sem tela branca).
- Arquivos: abrir uma foto de imóvel e um documento privado por link assinado.
- Site Cordial e Morar: busca, ficha e galeria respondem.
- Rotinas automáticas: últimas execuções de cada uma (sync Imobi, fotos, Drive, importação, avisos, agenda, Google, derivados do site, NFS-e PDF) sem falhas recentes.

## 2) Pendências do incidente (já aprovadas)
- Status "Conflito de código" no banco (adição simples).
- Limpeza gradual do histórico das rotinas (5.000 linhas por vez, a cada 10 min, só o que tem mais de 3 dias). Nada apagado de uma vez.
- Índice para a recuperação de fotos, que hoje varre a tabela inteira, e essa rotina passa a rodar a cada 10 min.
- Rotinas em horários diferentes: o sync Imobi continua a cada 1 min; as outras passam a rodar a cada 2–5 min, como no plano anterior; a NFS-e não muda.

## 3) Testes e publicação
- Bateria completa de testes, testes do site, checagem de tipos e compilação.
- Fluxos no navegador, com sessão real: painel, imóveis (lista e ficha), Novo atendimento (checagem de cliente repetido), agenda, aluguéis (só abrir) e o Assistente.
- Publicar, como já autorizado, e repetir login e abertura do painel no site oficial.

## Fora do escopo
Alterar dados, NFS-e, endereços, códigos, ordem ou envio de fotos, pausar o sync Imobi.

## Riscos
- Se o disco voltar a saturar durante uma mudança, ela para; cada mudança é pequena e pode ser repetida.
- Rotinas mais espaçadas atrasam alguns minutos as fotos, o Drive e os lembretes.
