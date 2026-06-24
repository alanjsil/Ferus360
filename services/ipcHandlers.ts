import type { Usuario, Categoria, Conta, Pessoa, Lancamento, Orcamento, TipoPessoa } from "../src/types";
import type { IpcMainInvokeEvent } from "electron";
import { AuthError } from "./auth";
import * as logger from "./logger";

let _ipCache: string | undefined;
let _ipCacheAt: number = 0;
let _ipPromise: Promise<string | undefined> | undefined;
const IP_CACHE_TTL_MS = 5 * 60 * 1000;

async function _obterIpPublico(): Promise<string | undefined> {
  if (_ipCache && Date.now() - _ipCacheAt < IP_CACHE_TTL_MS) {
    return _ipCache;
  }
  if (_ipPromise) return _ipPromise;
  _ipPromise = (async () => {
    try {
      const res = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(5000) });
      const data = await res.json() as { ip: string };
      _ipCache = data.ip;
      _ipCacheAt = Date.now();
      return _ipCache;
    } catch {
      _ipPromise = undefined;
      return undefined;
    }
  })();
  return _ipPromise;
}

function createHandlers(
  repository: Record<string, Function>,
  setState: (key: string, value: unknown) => void,
  getState: (key: string) => unknown,
  resetStateFn: () => void = () => {},
  auth: Record<string, Function> = require("./auth"),
  adminService: Record<string, Function> = require("./admin"),
  promptSenha?: (msg: string) => Promise<string>,
  sync?: Record<string, Function>,
): Record<string, Function> {
  function obterUsuarioId(): string | null {
    const usuario = getState("usuarioAtual") as { id: string } | null;
    return usuario?.id || null;
  }

  function obterTipoPessoaAtivo(): string {
    if (!getState("usarPjAtivo")) return "PF";
    return (getState("tipoPessoaAtivo") as string) || "PF";
  }

  async function _extrairMetadados(event?: IpcMainInvokeEvent): Promise<{ ip?: string; user_agent?: string }> {
    const user_agent = (event as any)?.sender?.session?.getUserAgent() || undefined;
    const ip = await _obterIpPublico();
    return { ip, user_agent };
  }

  return {
    handleLogError: async (_event: unknown, context: string, message: string, err?: unknown) => {
      logger.error(context, message, err);
      return { success: true };
    },
    handleLogWarn: async (_event: unknown, context: string, message: string, err?: unknown) => {
      logger.warn(context, message, err);
      return { success: true };
    },
    handleAuthLogin: async (event: IpcMainInvokeEvent, email: string, senha: string) => {
      try {
        const metadados = await _extrairMetadados(event);
        const data = await auth.login(email, senha, metadados);
        setState("usuarioAtual", data.usuario);
        setState("usarPjAtivo", data.usuario?.usar_pj === true);
        return data;
      } catch (err) {
        const code = (err as { code?: string }).code || (err as Error).message || "ERRO_INTERNO";
        logger.warn("ipcHandlers", `login falhou: ${code}`, err);
        return { error: code };
      }
    },

    handleAuthLogout: async (event: IpcMainInvokeEvent) => {
      const metadados = await _extrairMetadados(event);
      const data = await auth.logout(metadados);
      resetStateFn();
      setState("usuarioAtual", null);
      return data;
    },

    handleAuthVerificar: async (_event: unknown, token: string, refreshToken: string) => {
      const usuario = await auth.verificarToken(token);
      if (refreshToken) {
        await repository.setAuthSession(token, refreshToken).catch((err: unknown) => logger.error("ipcHandlers", "setAuthSession falhou", err));
      }
      if (usuario) {
        setState("usuarioAtual", usuario);
        setState("usarPjAtivo", usuario.usar_pj === true);
      }
      return usuario;
    },

    handleAuthRecuperar: async (event: IpcMainInvokeEvent, email: string) => {
      const metadados = await _extrairMetadados(event);
      return auth.solicitarRecuperacao(email, metadados);
    },

    handleAuthConfirmarRecuperacao: async (event: IpcMainInvokeEvent, email: string, token: string, novaSenha: string) => {
      const metadados = await _extrairMetadados(event);
      return auth.confirmarRecuperacao(email, token, novaSenha, metadados);
    },

    handleAuthRedefinirSenha: async (_event: unknown, novaSenha: string) => {
      const recoveryTokens = auth.getRecoveryTokens();
      if (!recoveryTokens) return { error: "TOKEN_RECUPERACAO_AUSENTE" };
      return await auth.redefinirSenha(recoveryTokens.accessToken, recoveryTokens.refreshToken, novaSenha);
    },

    handleAuthTemTokenRecuperacao: async () => auth.temTokenRecuperacao(),
    handleAuthTempoRestanteRecuperacao: async () => auth.getTempoRestanteRecuperacao(),

    handleAuthRenovar: async (_event: unknown, refreshToken: string) => {
      try {
        const result = await auth.renovarSessao(refreshToken);
        await repository.setAuthSession(result.token, result.refreshToken);
        setState("usuarioAtual", result.usuario);
        setState("usarPjAtivo", result.usuario?.usar_pj === true);
        return result;
      } catch (err) {
        return { error: err instanceof AuthError ? err.code : "ERRO_INTERNO" };
      }
    },

    handleAuthTrocarSenha: async (event: IpcMainInvokeEvent, usuarioId: string, novaSenha: string) => {
      try {
        const metadados = await _extrairMetadados(event);
        const senhaAtual = await promptSenha!("Digite sua senha atual para confirmar a troca");
        return await auth.trocarSenha(usuarioId, senhaAtual, novaSenha, metadados);
      } catch (err) {
        if ((err as Error)?.message === "USUARIO_CANCELOU") {
          return { error: "USUARIO_CANCELOU" };
        }
        throw err;
      }
    },

    handleCategoriasGet: async (_event: unknown, tipo: string) => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      const tipoPessoa = obterTipoPessoaAtivo();
      return await repository.getCategorias(usuarioId, tipo, false, tipoPessoa);
    },

    handleSubcategoriasGet: async (_event: unknown, categoriaId: string) => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      const tipoPessoa = obterTipoPessoaAtivo();
      return await repository.getSubcategorias(usuarioId, categoriaId, tipoPessoa);
    },

    handleContasGet: async () => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      const tipoPessoa = obterTipoPessoaAtivo();
      return await repository.getContas(usuarioId, tipoPessoa);
    },

    handleContaCreate: async (_event: unknown, payload: Record<string, unknown>) => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      try {
        if (!payload.tipo_pessoa) payload.tipo_pessoa = obterTipoPessoaAtivo();
        const data = await repository.criarConta(usuarioId, payload);
        const current = (getState("contas") as unknown[]) || [];
        setState("contas", [...current, data]);
        return data;
      } catch (err) {
        return { error: (err as Error).message };
      }
    },

    handleContaUpdate: async (_event: unknown, id: string, patch: Record<string, unknown>) => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      try {
        const data = await repository.updateConta(id, patch);
        const current = (getState("contas") as { id: string }[]) || [];
        setState(
          "contas",
          current.map((c: { id: string }) => (c.id === id ? data : c)),
        );
        return data;
      } catch (err) {
        return { error: (err as Error).message };
      }
    },

    handleContaDelete: async (_event: unknown, id: string) => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      try {
        const data = await repository.deletarConta(usuarioId, id);
        const current = (getState("contas") as { id: string }[]) || [];
        setState(
          "contas",
          current.filter((c: { id: string }) => c.id !== id),
        );
        return data;
      } catch (err) {
        return { error: (err as Error).message };
      }
    },

    handlePessoasGet: async () => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      const tipoPessoa = obterTipoPessoaAtivo();
      return await repository.getPessoas(usuarioId, tipoPessoa);
    },

    handlePessoaCreate: async (_event: unknown, payload: Record<string, unknown>) => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      try {
        if (!payload.tipo_pessoa) payload.tipo_pessoa = obterTipoPessoaAtivo();
        const data = await repository.criarPessoa(usuarioId, payload);
        const current = (getState("pessoas") as unknown[]) || [];
        setState("pessoas", [...current, data]);
        return data;
      } catch (err) {
        return { error: (err as Error).message };
      }
    },

    handlePessoaUpdate: async (_event: unknown, id: string, patch: Record<string, unknown>) => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      try {
        const data = await repository.updatePessoa(id, patch);
        const current = (getState("pessoas") as { id: string }[]) || [];
        setState(
          "pessoas",
          current.map((p: { id: string }) => (p.id === id ? data : p)),
        );
        return data;
      } catch (err) {
        return { error: (err as Error).message };
      }
    },

    handlePessoaDelete: async (_event: unknown, id: string) => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      try {
        const data = await repository.deletarPessoa(usuarioId, id);
        const current = (getState("pessoas") as { id: string }[]) || [];
        setState(
          "pessoas",
          current.filter((p: { id: string }) => p.id !== id),
        );
        return data;
      } catch (err) {
        return { error: (err as Error).message };
      }
    },

    handleLancamentosGet: async (_event: unknown, mes: string) => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      const tipoPessoa = obterTipoPessoaAtivo();
      return await repository.getLancamentos(mes, usuarioId, tipoPessoa);
    },

    handleOrcamentoGet: async (_event: unknown, mes: string) => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      const tipoPessoa = obterTipoPessoaAtivo();
      return await repository.getOrcamento(mes, usuarioId, tipoPessoa);
    },

    handleDashboardDados: async (_event: unknown, ano: unknown, mes: unknown, categoria: string) => {
      try {
        const usuarioId = obterUsuarioId();
        if (!usuarioId) return { error: "UNAUTHORIZED" };
        const tipoPessoa = obterTipoPessoaAtivo();
        return await repository.getDashboardDados(ano, mes, categoria, usuarioId, tipoPessoa);
      } catch (err) {
        logger.error("ipc", "Erro no dashboard:dados", err);
        return { error: "ERRO_INTERNO", detalhe: err instanceof Error ? err.message : String(err) };
      }
    },

    handleDashboardAnos: async () => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      const tipoPessoa = obterTipoPessoaAtivo();
      return await repository.getAnosDisponiveis(usuarioId, tipoPessoa);
    },

    handleDashboardGet: async (_event: unknown, mes: string) => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      const tipoPessoa = obterTipoPessoaAtivo();
      const data = await repository.getDashboard(mes, usuarioId, tipoPessoa);
      return data;
    },

    handleLancamentosCreate: async (_event: unknown, payload: Record<string, unknown>) => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      try {
        if (!payload.tipo_pessoa) payload.tipo_pessoa = obterTipoPessoaAtivo();
        const data = await repository.criarLancamento(payload, usuarioId);
        const current = (getState("lancamentos") as unknown[]) || [];
        setState("lancamentos", [...current, data]);
        return data;
      } catch (err) {
        // FIX: erro de validação/banco não era surfaced corretamente
        const msg = (err as Error).message || "ERRO_CRIAR_LANCAMENTO";
        logger.error("ipcHandlers", "createLancamento falhou", err);
        return { error: msg };
      }
    },

    handleLancamentosDelete: async (_event: unknown, id: string) => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      try {
        const data = await repository.deletarLancamento(id, usuarioId);
        const current = (getState("lancamentos") as { id: string }[]) || [];
        setState(
          "lancamentos",
          current.filter((l: { id: string }) => l.id !== id),
        );
        return data;
      } catch (err) {
        // FIX: erro de delete silencioso causava estado inconsistente
        const msg = (err as Error).message || "ERRO_EXCLUIR_LANCAMENTO";
        logger.error("ipcHandlers", "deleteLancamento falhou", err);
        return { error: msg };
      }
    },

    handleLancamentosUpdate: async (_event: unknown, id: string, payload: Record<string, unknown>) => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      try {
        const data = await repository.updateLancamento(id, payload, usuarioId);
        const current = (getState("lancamentos") as { id: string }[]) || [];
        setState(
          "lancamentos",
          current.map((l: { id: string }) => (l.id === id ? data : l)),
        );
        return data;
      } catch (err) {
        // FIX: erros de update silenciosos em produção
        const msg = (err as Error).message || "ERRO_ATUALIZAR_LANCAMENTO";
        logger.error("ipcHandlers", "updateLancamento falhou", err);
        return { error: msg };
      }
    },

    handleOrcamentoImportar: async (_event: unknown, itens: unknown[]) => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      const data = await repository.importarOrcamento(itens, usuarioId);
      return data;
    },

    handleTransferenciaCreate: async (_event: unknown, payload: Record<string, unknown>) => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      if (!payload.tipo_pessoa) payload.tipo_pessoa = obterTipoPessoaAtivo();
        const data = await repository.criarTransferencia(payload, usuarioId);
      const current = (getState("lancamentos") as unknown[]) || [];
      setState("lancamentos", [...current, ...(data as unknown[])]);
      return data;
    },

    handleTransferenciaDelete: async (_event: unknown, grupoId: string) => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      const data = await repository.deletarTransferencia(grupoId, usuarioId);
      const current = (getState("lancamentos") as { transferencia_grupo_id: string }[]) || [];
      setState(
        "lancamentos",
        current.filter((l: { transferencia_grupo_id: string }) => l.transferencia_grupo_id !== grupoId),
      );
      return data;
    },

    handleTransferenciaUpdate: async (_event: unknown, grupoId: string, payload: Record<string, unknown>) => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      const data = await repository.updateTransferencia(grupoId, payload, usuarioId);
      const current = (getState("lancamentos") as { transferencia_grupo_id: string }[]) || [];
      const withoutGroup = current.filter((l: { transferencia_grupo_id: string }) => l.transferencia_grupo_id !== grupoId);
      setState("lancamentos", [...withoutGroup, ...(data as unknown[])]);
      return data;
    },

    handleCatList: async () => {
      const usuarioId = obterUsuarioId();
      const tipoPessoa = obterTipoPessoaAtivo();
      const data = await repository.getCategorias(usuarioId, null, true, tipoPessoa);
      setState("categorias", data);
      return data;
    },

    handleCatCreate: async (_event: unknown, payload: Record<string, unknown>) => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      try {
        const ehGlobal = payload.eh_global ?? payload.ehGlobal ?? false;
        if (!payload.tipo_pessoa && !ehGlobal) payload.tipo_pessoa = obterTipoPessoaAtivo();
        const data = await repository.criarCategoria({
          ...payload,
          ...(ehGlobal ? {} : { usuarioId }),
        });
        const current = (getState("categorias") as unknown[]) || [];
        setState("categorias", [...current, data]);
        return data;
      } catch (err) {
        return { error: (err as Error).message };
      }
    },

    handleCatUpdate: async (_event: unknown, id: string, patch: Record<string, unknown>) => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      try {
        const data = await repository.updateCategoria(id, patch, usuarioId);
        const current = (getState("categorias") as { id: string }[]) || [];
        setState(
          "categorias",
          current.map((c: { id: string }) => (c.id === id ? data : c)),
        );
        return data;
      } catch (err) {
        return { error: (err as Error).message };
      }
    },

    handleCatToggleAtivo: async (_event: unknown, id: string) => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      try {
        const data = await repository.toggleCategoriaAtivo(id, usuarioId);
        const current = (getState("categorias") as { id: string }[]) || [];
        setState(
          "categorias",
          current.map((c: { id: string }) => (c.id === id ? data : c)),
        );
        return data;
      } catch (err) {
        return { error: (err as Error).message };
      }
    },

    handleSubcatCreate: async (_event: unknown, payload: Record<string, unknown>) => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      try {
        if (!payload.tipo_pessoa) payload.tipo_pessoa = obterTipoPessoaAtivo();
        const data = await repository.criarSubcategoria(usuarioId, payload);
        return data;
      } catch (err) {
        return { error: (err as Error).message };
      }
    },

    handleSubcatUpdate: async (_event: unknown, id: string, patch: Record<string, unknown>) => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      try {
        const data = await repository.updateSubcategoria(id, patch);
        return data;
      } catch (err) {
        return { error: (err as Error).message };
      }
    },

    handleSubcatDelete: async (_event: unknown, id: string) => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      try {
        const data = await repository.deletarSubcategoria(id);
        return data;
      } catch (err) {
        return { error: (err as Error).message };
      }
    },

    handleConfigGetPerfil: async () => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      return await repository.getPerfil(usuarioId);
    },

    handleConfigUpdatePerfil: async (_event: unknown, payload: Record<string, unknown>) => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      return await repository.updatePerfil(usuarioId, payload);
    },

    handleConfigGetSessoes: async () => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      return await repository.getSessoes(usuarioId);
    },

    handleConfigEncerrarSessao: async (_event: unknown, sessaoId: string) => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      try {
        return await repository.deletarSessao(sessaoId);
      } catch (err) {
        logger.error("ipcHandlers", "Erro ao encerrar sessão", err);
        return { error: "FALHA_AO_ENCERRAR_SESSAO" };
      }
    },

    handleConfigEncerrarOutrasSessoes: async () => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      try {
        return await repository.revokeOtherSessions();
      } catch (err) {
        logger.error("ipcHandlers", "Erro ao encerrar outras sessões", err);
        return { error: "FALHA_AO_ENCERRAR_SESSOES" };
      }
    },

    handleConfigExportarDados: async () => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      return await repository.exportarDados(usuarioId);
    },

    handleConfigExcluirConta: async () => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      try {
        const senha = await promptSenha!("Digite sua senha para excluir sua conta");
        await auth.verificarSenha(usuarioId, senha);
        const result = await repository.excluirConta(usuarioId);
        resetStateFn();
        setState("usuarioAtual", null);
        await repository.limparSessaoAuth();
        return result;
      } catch {
        return { error: "USUARIO_CANCELOU" };
      }
    },

    handleAdminGetDashboard: async () => {
      try {
        return await adminService.getDashboard();
      } catch {
        return { error: "UNAUTHORIZED" };
      }
    },

    handleAdminGetClientes: async () => {
      try {
        return await adminService.getClientes();
      } catch {
        return { error: "UNAUTHORIZED" };
      }
    },

    handleAdminToggleCliente: async (_event: unknown, id: string) => {
      try {
        return await adminService.toggleCliente(id);
      } catch {
        return { error: "UNAUTHORIZED" };
      }
    },

    handleAdminGetResumoCliente: async (_event: unknown, id: string, tipoPessoa: unknown) => {
      try {
        return await adminService.getResumoCliente(id, (tipoPessoa as string) || undefined);
      } catch {
        return { error: "UNAUTHORIZED" };
      }
    },

    handleAdminGetTransacoesCliente: async (_event: unknown, id: string, mes: unknown, ano: unknown, tipoPessoa: unknown) => {
      try {
        return await adminService.getTransacoesCliente(id, mes, ano, (tipoPessoa as string) || undefined);
      } catch {
        return { error: "UNAUTHORIZED" };
      }
    },

    handleAdminGetOrcamentoCliente: async (_event: unknown, id: string, tipoPessoa: unknown) => {
      try {
        return await adminService.getOrcamentoCliente(id, (tipoPessoa as string) || undefined);
      } catch {
        return { error: "UNAUTHORIZED" };
      }
    },

    handleAdminGetDashboardDadosCliente: async (_event: unknown, usuarioId: string, ano: unknown, mes: unknown, categoria: string, tipoPessoa: unknown) => {
      try {
        return await adminService.getDashboardDadosCliente(usuarioId, ano, mes, categoria, (tipoPessoa as string) || undefined);
      } catch {
        return { error: "UNAUTHORIZED" };
      }
    },

    handleAdminGetAnosDisponiveisCliente: async (_event: unknown, usuarioId: string, tipoPessoa: unknown) => {
      try {
        return await adminService.getAnosDisponiveisCliente(usuarioId, (tipoPessoa as string) || undefined);
      } catch {
        return { error: "UNAUTHORIZED" };
      }
    },

    handleAdminGetContasCliente: async (_event: unknown, id: string, tipoPessoa: unknown) => {
      try {
        return await adminService.getContasCliente(id, (tipoPessoa as string) || undefined);
      } catch {
        return { error: "UNAUTHORIZED" };
      }
    },

    handleAdminResetSenha: async (_event: unknown, id: string) => {
      try {
        return await adminService.resetSenha(id);
      } catch {
        return { error: "UNAUTHORIZED" };
      }
    },

    handleAdminGetChamados: async () => {
      try {
        return await adminService.getChamados();
      } catch {
        return { error: "UNAUTHORIZED" };
      }
    },

    handleAdminResponderChamado: async (_event: unknown, id: string, msg: string) => {
      try {
        return await adminService.responderChamado(id, msg);
      } catch {
        return { error: "UNAUTHORIZED" };
      }
    },

    handleAdminUpdateChamado: async (_event: unknown, id: string, status: string) => {
      try {
        return await adminService.updateChamado(id, status);
      } catch {
        return { error: "UNAUTHORIZED" };
      }
    },

    handleAdminGetAuditoria: async (_event: unknown, filtros: Record<string, unknown>) => {
      try {
        return await adminService.getAuditoria(filtros);
      } catch {
        return { error: "UNAUTHORIZED" };
      }
    },

    handleAdminCriarUsuario: async (_event: unknown, nome: string, email: string, senha: string) => {
      try {
        return await adminService.criarUsuario(nome, email, senha);
      } catch (err) {
        return { error: (err as { code?: string }).code || "ERRO_CRIAR_USUARIO" };
      }
    },

    handleSyncForce: async () => {
      if (!sync) return { error: "SYNC_NAO_INICIALIZADO" };
      await sync.forcarSync();
      return { success: true };
    },

    handleSyncConflitos: async () => {
      if (!sync) return { error: "SYNC_NAO_INICIALIZADO" };
      return sync.getConflitos();
    },

    handleSyncResolverConflito: async (_event: unknown, id: string, decisao: string, payloadMesclado: Record<string, unknown>) => {
      if (!sync) return { error: "SYNC_NAO_INICIALIZADO" };
      try {
        await sync.resolverConflito(id, decisao, payloadMesclado);
        return { success: true };
      } catch (err) {
        return { error: (err as Error).message };
      }
    },

    handleTipoPessoaGet: async () => {
      return obterTipoPessoaAtivo();
    },

    handleTipoPessoaSet: async (_event: unknown, tipoPessoa: string) => {
      if (!getState("usarPjAtivo") && tipoPessoa === "PJ") {
        return { success: false };
      }
      setState("tipoPessoaAtivo", tipoPessoa);
      return { success: true };
    },

    handleUsarPjGet: async () => {
      return !!getState("usarPjAtivo");
    },

    handleUsarPjSet: async (_event: unknown, value: boolean) => {
      setState("usarPjAtivo", value);
      if (!value) {
        setState("tipoPessoaAtivo", "PF");
      }
      const usuarioId = obterUsuarioId();
      if (usuarioId) {
        await repository.updatePerfil(usuarioId, { usar_pj: value });
      }
      return { success: true };
    },

    handleCatToggleUniversal: async (_event: unknown, id: string) => {
      const usuarioId = obterUsuarioId();
      if (!usuarioId) return { error: "UNAUTHORIZED" };
      try {
        const tipoPessoaAtivo = obterTipoPessoaAtivo();
        const data = await repository.toggleCategoriaUniversal(id, usuarioId, tipoPessoaAtivo);
        const current = (getState("categorias") as { id: string }[]) || [];
        setState(
          "categorias",
          current.map((c: { id: string }) => (c.id === id ? data : c)),
        );
        return data;
      } catch (err) {
        return { error: (err as Error).message };
      }
    },

    handleLimparCache: async () => {
      repository.limparCacheGeral();
      return { success: true };
    },

    handleTrialStatus: async () => {
      const { estaExpirado, diasRestantes, diasTrial } = require("./expiration");
      return {
        expirado: estaExpirado(),
        diasRestantes: diasRestantes(),
        diasTrial: diasTrial(),
      };
    },
  };
}

function registerHandlers(promptSenha: (msg: string) => Promise<string>): void {
  let ipcMain: { handle: (channel: string, handler: Function) => void };
  try {
    ({ ipcMain } = require("electron"));
  } catch {
    return;
  }

  const repository = require("./repository");
  const { setState, getState, reiniciarState } = require("./state");
  const auth = require("./auth");
  const admin = require("./admin");
  const sync = require("./sync");
  const handlers = createHandlers(repository, setState, getState, reiniciarState, auth, admin, promptSenha, sync);

  ipcMain.handle("log:error", handlers.handleLogError);
  ipcMain.handle("log:warn", handlers.handleLogWarn);
  ipcMain.handle("categorias:get", handlers.handleCategoriasGet);
  ipcMain.handle("auth:login", handlers.handleAuthLogin);
  ipcMain.handle("auth:logout", handlers.handleAuthLogout);
  ipcMain.handle("auth:verificar", handlers.handleAuthVerificar);
  ipcMain.handle("auth:recuperar", handlers.handleAuthRecuperar);
  ipcMain.handle("auth:confirmar-recuperacao", handlers.handleAuthConfirmarRecuperacao);
  ipcMain.handle("auth:redefinir-senha", handlers.handleAuthRedefinirSenha);
  ipcMain.handle("auth:tem-token-recuperacao", handlers.handleAuthTemTokenRecuperacao);
  ipcMain.handle("auth:tempo-restante-recuperacao", handlers.handleAuthTempoRestanteRecuperacao);
  ipcMain.handle("auth:renovar", handlers.handleAuthRenovar);
  ipcMain.handle("auth:trocar-senha", handlers.handleAuthTrocarSenha);
  ipcMain.handle("subcategorias:get", handlers.handleSubcategoriasGet);
  ipcMain.handle("contas:get", handlers.handleContasGet);
  ipcMain.handle("conta:create", handlers.handleContaCreate);
  ipcMain.handle("conta:update", handlers.handleContaUpdate);
  ipcMain.handle("conta:delete", handlers.handleContaDelete);
  ipcMain.handle("pessoas:get", handlers.handlePessoasGet);
  ipcMain.handle("pessoa:create", handlers.handlePessoaCreate);
  ipcMain.handle("pessoa:update", handlers.handlePessoaUpdate);
  ipcMain.handle("pessoa:delete", handlers.handlePessoaDelete);
  ipcMain.handle("lancamentos:get", handlers.handleLancamentosGet);
  ipcMain.handle("orcamento:get", handlers.handleOrcamentoGet);
  ipcMain.handle("dashboard:dados", handlers.handleDashboardDados);
  ipcMain.handle("dashboard:anos", handlers.handleDashboardAnos);
  ipcMain.handle("dashboard:get", handlers.handleDashboardGet);
  ipcMain.handle("lancamentos:create", handlers.handleLancamentosCreate);
  ipcMain.handle("lancamentos:delete", handlers.handleLancamentosDelete);
  ipcMain.handle("lancamentos:update", handlers.handleLancamentosUpdate);
  ipcMain.handle("transferencia:create", handlers.handleTransferenciaCreate);
  ipcMain.handle("transferencia:delete", handlers.handleTransferenciaDelete);
  ipcMain.handle("transferencia:update", handlers.handleTransferenciaUpdate);
  ipcMain.handle("orcamento:importar", handlers.handleOrcamentoImportar);
  ipcMain.handle("cat:list", handlers.handleCatList);
  ipcMain.handle("cat:create", handlers.handleCatCreate);
  ipcMain.handle("cat:update", handlers.handleCatUpdate);
  ipcMain.handle("cat:toggleAtivo", handlers.handleCatToggleAtivo);
  ipcMain.handle("cat:toggleUniversal", handlers.handleCatToggleUniversal);
  ipcMain.handle("subcat:create", handlers.handleSubcatCreate);
  ipcMain.handle("subcat:update", handlers.handleSubcatUpdate);
  ipcMain.handle("subcat:delete", handlers.handleSubcatDelete);
  ipcMain.handle("config:getPerfil", handlers.handleConfigGetPerfil);
  ipcMain.handle("config:updatePerfil", handlers.handleConfigUpdatePerfil);
  ipcMain.handle("config:getSessoes", handlers.handleConfigGetSessoes);
  ipcMain.handle("config:encerrar-sessao", handlers.handleConfigEncerrarSessao);
  ipcMain.handle("config:encerrar-outras-sessoes", handlers.handleConfigEncerrarOutrasSessoes);
  ipcMain.handle("config:exportarDados", handlers.handleConfigExportarDados);
  ipcMain.handle("config:excluir-conta", handlers.handleConfigExcluirConta);
  ipcMain.handle("admin:getDashboard", handlers.handleAdminGetDashboard);
  ipcMain.handle("admin:getClientes", handlers.handleAdminGetClientes);
  ipcMain.handle("admin:toggleCliente", handlers.handleAdminToggleCliente);
  ipcMain.handle("admin:getResumoCliente", handlers.handleAdminGetResumoCliente);
  ipcMain.handle("admin:getTransacoesCliente", handlers.handleAdminGetTransacoesCliente);
  ipcMain.handle("admin:getOrcamentoCliente", handlers.handleAdminGetOrcamentoCliente);
  ipcMain.handle("admin:getDashboardDadosCliente", handlers.handleAdminGetDashboardDadosCliente);
  ipcMain.handle("admin:getAnosDisponiveisCliente", handlers.handleAdminGetAnosDisponiveisCliente);
  ipcMain.handle("admin:getContasCliente", handlers.handleAdminGetContasCliente);
  ipcMain.handle("admin:resetSenha", handlers.handleAdminResetSenha);
  ipcMain.handle("admin:getChamados", handlers.handleAdminGetChamados);
  ipcMain.handle("admin:responderChamado", handlers.handleAdminResponderChamado);
  ipcMain.handle("admin:updateChamado", handlers.handleAdminUpdateChamado);
  ipcMain.handle("admin:getAuditoria", handlers.handleAdminGetAuditoria);
  ipcMain.handle("admin:criarUsuario", handlers.handleAdminCriarUsuario);
  ipcMain.handle("tipo-pessoa:get", handlers.handleTipoPessoaGet);
  ipcMain.handle("tipo-pessoa:set", handlers.handleTipoPessoaSet);
  ipcMain.handle("usar-pj:get", handlers.handleUsarPjGet);
  ipcMain.handle("usar-pj:set", handlers.handleUsarPjSet);
  ipcMain.handle("sync:force", handlers.handleSyncForce);
  ipcMain.handle("sync:conflitos", handlers.handleSyncConflitos);
  ipcMain.handle("sync:resolver-conflito", handlers.handleSyncResolverConflito);
  ipcMain.handle("sync:limpar-cache", handlers.handleLimparCache);
  ipcMain.handle("trial:status", handlers.handleTrialStatus);
}

export { registerHandlers, createHandlers };
