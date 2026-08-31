# Vírgula nos campos de área (Etapa 3)

## O problema

Na Etapa 3 ("Características e áreas") os campos de área são controlados por um número, não pelo texto digitado. Quando o usuário digita `32,`, o valor é convertido para o número `32` e o campo volta a exibir `32` — a vírgula desaparece antes de conseguir digitar os decimais. O mesmo acontece nos campos de valores (Etapa 4), que usam a mesma mecânica.

## A correção

- Guardar o texto digitado enquanto o campo estiver em edição, e só converter para número ao sair do campo (blur) ou ao avançar de etapa. Assim `32,5` é digitado normalmente e vira `32.5` no banco.
- Aceitar tanto `32,5` quanto `32.5`, ignorar separador de milhar, e bloquear caracteres inválidos (letras/símbolos).
- Ao reabrir/editar um imóvel, exibir os decimais em formato brasileiro (`32,5` em vez de `32.5`).
- Aplicar o mesmo comportamento nos campos numéricos decimais das Etapas 3 e 4 (áreas, valor, IPTU, condomínio). Campos inteiros (dormitórios, vagas etc.) continuam só com dígitos.

## Envio para Cordial e Morar

O envio já converte decimais para o padrão das duas APIs: área `32.5` sai como `"32,50"` e valores em reais inteiros. Como hoje o campo nunca chega a receber decimal, esse caminho nunca era exercitado. Após a correção vou validar com um cadastro real que o payload enviado às duas imobiliárias contém a área com vírgula (`"32,50"`), incluindo os testes automáticos já existentes do serializador.

## Detalhes técnicos

- `src/components/imoveis/PropertyForm.tsx`: substituir o padrão `value={str(number)} onChange={num(...)}` por um componente interno `DecimalInput` com estado de rascunho de texto (commit no blur), reutilizado nas áreas e nos valores.
- Novo helper de formatação pt-BR para exibição do número inicial.
- Nenhuma mudança de schema ou de backend; `serializers.ts` (`areaToString`/`moneyToString`) permanece como está.
- Validação: `bunx vitest run` do serializador + cadastro real de teste verificando o payload das duas imobiliárias.
