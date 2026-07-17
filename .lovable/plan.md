## Objetivo
No formulário do menu **Clientes**, o seletor "Corretor responsável" deve mostrar a mesma lista real usada em **Atendimentos** (corretores + admins hidratados do banco: Bruna, Ricardo, Felipe, Pablo, Geandre Carpenedo + "A definir"), em vez da lista fixa "Ricardo / Bruna / Bianca / Felipe / Outro".

## Alterações
Arquivo: `src/components/clients/ClientFormModal.tsx`

1. Remover a importação/uso de `brokerOptions` de `@/types/client`.
2. Importar `useApp` de `@/store/app-store` e derivar a lista igual ao AtendimentoFormModal:
   ```ts
   const corretores = useApp((s) => s.corretores);
   const brokerOptions = [...corretores]
     .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
     .map((c) => ({ id: c.id, label: c.nome }))
     .concat({ id: "a_definir", label: "A definir" });
   ```
3. Ajustar `initialForm.assignedBrokerId` de `"ricardo"` para `"a_definir"` (valor sempre presente na lista).
4. Remover o ramo "outro" (input livre "Nome do corretor"), pois o padrão em Atendimentos não usa esse campo — o layout passa a mostrar sempre "Status atual" ao lado do seletor. Também remove-se `customBrokerName` do estado e o bloco condicional extra abaixo.
5. Ajustar `brokerName` para simplesmente ler o `label` do broker escolhido; se não achar, `undefined`.

Nenhuma outra alteração de negócio, tipos ou banco — apenas o form. O campo `assignedBrokerId` continua sendo enviado ao `ClientCreateInput` como hoje.

## Efeito
- O dropdown mostra os mesmos nomes reais do menu Atendimentos.
- Novos usuários corretores cadastrados aparecem automaticamente sem editar código.
- Leonardo continua fora (já filtrado no hook global `useHydrateCorretores`).
