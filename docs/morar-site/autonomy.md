# Autonomia e operação Morar

Checklist de responsabilidades a conferir com a Cordial/Morar. A presença do código no repositório não comprova titularidade de contas, backup ou restauração.

| Item                    | Verificação e evidência esperada                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repositório             | Administradores sob controle da empresa, proteção da branch principal, recuperação de acesso e exportação/clonagem completa.                                 |
| Domínio e DNS           | Titular, acesso ao registrador e à zona DNS, renovação, recuperação e registro da configuração anterior. Nenhuma troca executada nesta entrega.              |
| Hospedagem              | Conta, faturamento, variáveis de servidor, build reproduzível, logs restritos e possibilidade de voltar à versão anterior.                                   |
| Banco Supabase/Postgres | Administradores, RLS, migrações versionadas, permissões, exportação e plano para transferência de ambiente.                                                  |
| Storage                 | Bucket original privado, associações/capa/ordem, exportação de arquivos com checksums e plano de restauração. URLs assinadas não servem como backup.         |
| Segredos                | Cofre/variáveis de servidor, rotação e acesso mínimo; chave de serviço ausente do navegador, Git e relatórios. Crons/hooks usam credencial interna do cofre. |
| Certificados            | Renovação HTTPS e alerta de expiração; comprovar na hospedagem antes da troca de domínio.                                                                    |
| Backups                 | Política acordada de frequência/retenção, responsáveis e objetivos de recuperação; registrar a configuração real, sem presumir plano contratado.             |
| Restauração             | Exercício em ambiente separado com dados, imagens, relações, permissões e cadastro/contato verificados. Registrar duração e falhas reais.                    |
| Exportação              | Banco e imagens canônicas, publicações próprias, IDs por marca, conteúdo, leads e auditoria; formatos documentados e arquivo de integridade.                 |
| Atendimento             | Responsável pelos leads Morar e pela triagem; entrega durável não significa visita agendada ou mensagem WhatsApp recebida.                                   |
| Operação editorial      | Quem revisa autorização, disponibilidade, conteúdo, mídias, áreas e retirada. Usar o canal próprio sem depender de status ImobiBrasil.                       |
| Custos                  | Registrar contratos, faturas, limites e responsáveis de hospedagem, banco, storage, tráfego/CDN e domínio. Não há estimativa de preço nesta entrega.         |

Dependências explícitas: Node.js e stack do repositório para build; hospedagem compatível com TanStack Start; Supabase/Postgres e Storage privado; serviços de domínio/HTTPS escolhidos pela empresa. WhatsApp e redes sociais são canais externos opcionais. O catálogo e suas fotos não consultam o fornecedor antigo durante a navegação.

As instruções de lote autorizado, simulação e rollback estão em [activation.md](activation.md). Configuração, contratos e limites de mídia/cache permanecem nos documentos do módulo. Manter os relatórios integrais em armazenamento restrito; não publicar IDs internos ou snapshots em `public/`.
