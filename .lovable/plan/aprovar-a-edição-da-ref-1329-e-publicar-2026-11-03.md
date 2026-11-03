# Aprovar a edição da Ref. 1329 e publicar

1. **Aprovar a edição** da semana atual (casa Ref. 1329), registrando a aprovação no nome do Leonardo/administração. A abertura do site passa a usar a foto editada.
2. **Conferir na prévia:** a home abre com a foto editada e o endereço da imagem responde normalmente.
3. **Publicar** em cordialgestao.com: verificar antes os alertas de segurança; se a publicação for bloqueada, informo o motivo.
4. **Conferir no site publicado:** abertura com a foto editada; Morar e o restante da home sem mudança.

## Detalhes técnicos
- A aprovação grava `approved_at`/`approved_by`, com `use_original=false`, na semana ativa (o mesmo efeito do botão "Aprovar e ativar").
- A rotina horária (cron `cordial-showcase`) chama o site publicado; ela só passa a funcionar ali depois da publicação.
