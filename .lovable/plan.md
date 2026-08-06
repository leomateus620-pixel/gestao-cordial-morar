# Descrição no checklist de agenciamentos + corretor Geandre em Atendimentos

## 1. Campo de descrição abaixo do checklist (Agenciamentos)

Hoje o único campo de texto livre do agenciamento ("Observações internas") fica escondido dentro do bloco recolhível "Links e observações complementares", no fim da etapa de revisão.

Mudança:
- Adicionar, logo abaixo da lista do checklist (e acima do bloco "Agenciamento validado"), um campo de descrição em destaque: card próprio com título "Descrição do agenciamento", texto de apoio, área de texto ampla, contador de caracteres e placeholder com exemplos (o que falta, combinados com o proprietário, detalhes das fotos/placa).
- O conteúdo é salvo no campo de observações internas já existente do agenciamento — sem mudança de banco de dados — e continua aparecendo no detalhe do agenciamento.
- Remover o campo duplicado de dentro do bloco recolhível, que passa a conter apenas os links (Drive e site).
- Mostrar um resumo curto dessa descrição na lista de revisão antes de salvar.

## 2. Bianca não consegue selecionar o corretor "Geandre"

Causa verificada: cada usuário tem vínculo com as imobiliárias. Geandre Carpenedo está vinculado apenas à **Cordial**; todos os demais corretores estão em Cordial e Morar. Quando o atendimento é criado com imobiliária **Morar**, ele é filtrado da lista de corretores (e o banco também bloquearia o vínculo). Com "Cordial" ou "Cordial + Morar" ele aparece normalmente.

Correção:
- Vincular Geandre também à imobiliária **Morar**, igualando-o aos outros corretores — isso faz o fluxo voltar ao normal em qualquer imobiliária.
- Melhorar a interface para que esse tipo de situação não vire "erro invisível": quando algum corretor ficar de fora por não atender a imobiliária escolhida, exibir um aviso discreto abaixo do campo ("Alguns corretores não atendem esta imobiliária") em vez de simplesmente sumir da lista.

Se Geandre realmente não deve atender a Morar, basta avisar — nesse caso mantemos só o aviso na interface e não alteramos o vínculo.

## Detalhes técnicos

- `src/components/agenciamentos/AgenciamentoFormModal.tsx`: novo bloco de descrição em `ReviewStep` entre o grid do checklist e o card de validação, ligado a `form.observacoesInternas`; remover o `Field` duplicado do `Collapsible`; nova `ReviewRow` com trecho da descrição.
- Dados: inserir linha em `public.user_agencies` (`user_id` do Geandre, `agency = 'morar'`) via ferramenta de dados.
- `src/components/atendimentos/AtendimentoFormModal.tsx` e `AtendimentoActionsDialog.tsx`: nota informativa quando `brokerOptions` tiver itens filtrados por `brokerCanServeAgency`.
