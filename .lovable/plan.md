# Telefone do proprietário: aceitar números internacionais

## Problema
O campo "Telefone do proprietário" (etapa de informações internas do imóvel) corta o que é digitado em 11 dígitos e força o formato brasileiro `(55) 99999-9999`. Números da Argentina e de outros países, que têm mais dígitos e código do país, não conseguem ser cadastrados.

## O que muda
- Se o número começar com `+` (ou tiver mais dígitos do que um número brasileiro), o campo passa a aceitar até 15 dígitos e mostra o número no formato internacional, por exemplo `+54 9 11 2345-6789`, sem cortar nada.
- Números brasileiros continuam exatamente como hoje: `(55) 99999-9999`.
- O texto de ajuda passa a indicar que dá para usar `+` e o código do país.
- O aviso "Uso interno: não é publicado nos sites" continua igual.

## Detalhes técnicos
- Ajustar `maskPhone` em `src/components/imoveis/PropertyForm.tsx`:
  - detectar prefixo `+` no valor digitado;
  - modo internacional: manter `+`, limitar a 15 dígitos (padrão E.164) e agrupar em blocos legíveis;
  - modo nacional: manter a lógica atual de 10/11 dígitos.
- Placeholder e `hint` atualizados no campo do proprietário.
- Nenhuma mudança de banco, de envio para os sites Cordial/Morar ou em outros formulários.
