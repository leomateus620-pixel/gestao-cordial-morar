# Selecionar quantidades de 0 a 20 na Etapa 3

## O que muda

Na etapa "Características e áreas", os cinco campos de contagem — Dormitórios, Suítes, Banheiros, Vagas e Salas — deixam de ser caixas de digitação livre e passam a ter um seletor rápido de quantidade.

Como fica cada campo:

- Uma linha de botões rápidos com os valores mais usados: 0, 1, 2, 3, 4, 5 e "6+".
- Um clique em um número já preenche o campo e ele fica destacado.
- Ao tocar em "6+", abre-se uma lista rolável com todos os valores de 0 a 20 para escolher.
- Um botão "Limpar" deixa o campo vazio novamente (quando a informação não se aplica).
- O valor escolhido aparece sempre visível ao lado do nome do campo.

Nada muda nos campos de área, no tipo de área nem no restante do cadastro. O valor salvo continua sendo um número inteiro igual ao de hoje, então imóveis já cadastrados abrem normalmente com a quantidade certa já marcada.

## Detalhes técnicos

- Novo componente interno `CountPicker` em `src/components/imoveis/PropertyForm.tsx`: props `value: number | null`, `onChange(next: number | null)`, `label`, `max = 20`.
  - Renderiza chips 0–5 (botões acessíveis, `aria-pressed`), chip "6+" que abre um `Select`/`DropdownMenu` com opções 0..20 numa lista rolável (`max-h` + scroll), e um botão "Limpar" visível apenas quando há valor.
  - Quando o valor atual for > 5, esse valor é exibido como chip ativo no lugar do "6+".
  - Usa apenas tokens do design system (classes `inputCls` existentes e `bg-primary/text-primary-foreground` para o estado ativo).
- Substituir o `map` das linhas 748–767 pelo uso de `CountPicker`, mantendo `set(key, value as never)`.
- Sem mudança de tipos, schema, serializers ou envio para Cordial/Morar.
- Validação: `bunx tsgo --noEmit` e conferência visual em `/imoveis/novo` na etapa 3.
