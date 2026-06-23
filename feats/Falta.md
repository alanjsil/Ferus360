Funções como \_inserirLocal, \_atualizarLocal e \_popularCache verificam database.getDb() e retornam silenciosamente se o banco não estiver inicializado. Isso faz com que dados escritos durante falha de abertura do banco sejam silenciosamente descartados sem log ou alerta.
→Logar um erro explícito via logger.error quando o banco for null nessas funções. Considerar lançar exceção em vez de retornar silenciosamente para que a camada superior possa tratar.

---

O pull silenciosamente pula registros onde sync_status IN ('pending', 'conflict'). Se um registro ficar preso nesse estado (ex: falha de rede durante push), ele nunca será sobrescrito por dados mais recentes do servidor e o usuário verá dados desatualizados indefinidamente.
→Adicionar um campo pending_since e, após N horas/dias sem resolução, logar aviso ou notificar o usuário. Expor contagem de registros "presos" no status de sync.

---

buildAdminService() é chamado duas vezes no mesmo módulo: uma vez para criar defaultService e depois seus métodos são re-exportados individualmente. Dependências (repository, auth, crypto) são resolvidas em cada chamada. Se createDefaultDependencies() tiver efeitos colaterais, eles disparam duas vezes.
→ Exportar apenas defaultService e acessar via namespace: import { defaultService as admin } from './admin'. Remover os re-exports individuais.

---

O badge de conflitos só aparece quando conflitos já existem. Não há indicador de que um sync está em progresso. O usuário não sabe se seus dados foram enviados ao servidor ou estão pendentes — especialmente crítico offline.
→Adicionar ao SyncStatus um campo syncing: boolean e exibir um indicador giratório sutil no header enquanto push/pull estiver ativo. Mostrar "Última sincronização: X minutos atrás".

---

Quando a validação falha (ex: valor inválido, senhas não conferem), a mensagem aparece mas o foco não é movido para o campo com erro. Em formulários longos o usuário pode não ver a mensagem de erro que ficou fora da viewport.
→Após exibir mensagem de erro, chamar .focus() e .scrollIntoView() no campo problemático. Adicionar aria-invalid="true" e aria-describedby para acessibilidade.
