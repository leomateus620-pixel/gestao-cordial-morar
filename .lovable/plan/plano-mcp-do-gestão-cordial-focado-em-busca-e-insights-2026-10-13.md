# Plano — MCP do Gestão Cordial focado em busca e insights

## Objetivo
Transformar o MCP do app (hoje com 3 ferramentas de busca: imóveis, clientes, atendimentos) em um servidor prioritariamente de **consulta e insights**, para as IAs conectadas (Claude, ChatGPT etc.) responderem perguntas sobre o negócio com dados reais. Tudo **somente leitura**, com o login do usuário (OAuth) e as mesmas permissões que ele já tem no app (RLS). Nenhuma ferramenta de escrita.

## Ferramentas novas (além das 3 de busca já existentes)

1. **Resumo da carteira de imóveis** — totais por situação (disponível, alugado, à venda, reservado), por cidade/bairro e por empresa (Cordial/Morar), com contagem de anúncios publicados por site.
2. **Resumo financeiro de aluguéis** — por competência (mês/ano): total de aluguéis ativos, soma de aluguéis e comissões, inadimplência/pendências, NFS-e emitidas vs. pendentes.
3. **Funil de atendimentos/CRM** — atendimentos por etapa e por período, origens, taxa de conversão, atendimentos parados há X dias.
4. **Desempenho de marketing** — campanhas (manuais e importadas), investimento, leads, CPL, CTR, comparativo com o mês anterior, por imobiliária e plataforma.
5. **Insights automáticos** — uma ferramenta que cruza os dados acima e devolve achados prontos em texto (ex.: "3 imóveis alugados há mais de 12 meses sem reajuste", "campanha X com CPL 40% acima da média", "2 competências com NFS-e pendente").
6. **Consulta livre assistida (opcional, se aprovado)** — a IA descreve o que quer e o servidor devolve dados agregados; sem expor SQL bruto.

## Como será feito
- Uma ferramenta por arquivo em `src/lib/mcp/tools/`, registradas no `defineMcp` existente; consultas sempre com o token do usuário conectado (RLS vale como no app).
- Agregações feitas no servidor (contagens/somas), devolvendo resumos compactos — nunca listas enormes nem dados pessoais além do necessário.
- Sem migração de banco, sem mudança em telas do app, sem tocar em NFS-e, recibos, fotos/Imobi ou marketing.
- Após as edições, rodar a extração do manifesto MCP e os testes/typecheck.

## O que NÃO muda
- As 3 ferramentas atuais continuam iguais.
- Nada de escrita, exclusão ou ações — só leitura e resumo.
- Não publicar: o MCP novo só entra no ar depois que você publicar.

## Validação
- Testes das agregações com dados de exemplo; typecheck e suíte existente sem regressão.
- Teste de conexão real só após a publicação, com sua autorização.
