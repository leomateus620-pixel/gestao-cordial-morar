# Imóvel cadastrado por secretária/admin também vira agenciamento

## Decisões do Leonardo
- Quando a Bianca (secretária) ou um admin cadastra um imóvel, o agenciamento fica **no nome de quem cadastrou**.
- Esse agenciamento **conta na bonificação normalmente**.

## O que muda
1. **Conclusão do cadastro** (botão final do assistente / "Concluir cadastro"):
   - Corretor escolhido no formulário continua valendo.
   - Sem escolha: corretor do imóvel; senão **quem criou o imóvel** (inclusive admin/secretária).
   - Quem só clicou em "Concluir" no rascunho de **outra pessoa** continua sem virar responsável (vale a regra acima, pelo criador).
2. **Publicação manual pelo painel** (agenciamento automático): mesma ordem — corretor do imóvel → criador (qualquer perfil) → quem publicou só se for corretor.
3. Imóvel sem criador gravado e sem corretor continua indo para "Cadastros não concluídos" (sem inventar responsável).
4. Bonificação: conferir que o cálculo aceita agenciamento no nome de admin/secretária; se hoje filtra só corretores, incluir esses perfis.

## Fora do escopo
- Nenhum agenciamento retroativo, nenhuma alteração em dados existentes, sem publicar, sem envio aos sites.

## Detalhes técnicos
- `registration-rules.ts`: `resolveFinalizeAgencyBroker` e `resolveAutoAgencyBroker` passam a aceitar `createdBy` de qualquer perfil; manter exclusão de "quem clicou ≠ criador".
- Nome do responsável (`corretor_nome`) lido do perfil do criador em `ensureAutoAgency`/`finalizePropertyAgencyCore`.
- Verificar triggers/funções de bônus e validação de `agenciamentos` (ex.: exigência de papel corretor); ajustar só se bloquear, via CREATE OR REPLACE aditivo.
- Atualizar testes de `registration-rules.test.ts` (secretária cria → ela; admin conclui rascunho alheio → criador; sem criador → pendente) e rodar tudo com TZ=America/Sao_Paulo + typecheck. Atualizar regra em AGENTS.md.
