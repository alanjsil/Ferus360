/** Interfaces de domínio do Finanças Pessoais */

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  role: "admin" | "user";
  ativo: boolean;
  avatar_url?: string | null;
  usar_pj?: boolean;
  criado_em?: string;
  ultimo_login?: string | null;
}

export type TipoPessoa = "PF" | "PJ";

export interface Categoria {
  id: string;
  nome: string;
  tipo: "RECEITA" | "DESPESA";
  usuario_id: string | null;
  eh_global: boolean;
  ativo: boolean;
  tipo_pessoa?: TipoPessoa | null;
  criado_em?: string;
  atualizado_em?: string;
  sync_status?: string;
  deleted_at?: string | null;
  version?: number;
}

export interface Subcategoria {
  id: string;
  categoria_id: string;
  nome: string;
  usuario_id: string;
  tipo_pessoa?: TipoPessoa | null;
  criado_em?: string;
  atualizado_em?: string;
  sync_status?: string;
  deleted_at?: string | null;
}

export interface Conta {
  id: string;
  nome: string;
  usuario_id: string;
  tipo_pessoa: TipoPessoa;
  criado_em?: string;
  atualizado_em?: string;
  sync_status?: string;
  deleted_at?: string | null;
}

export interface Pessoa {
  id: string;
  nome: string;
  usuario_id: string;
  tipo_pessoa: TipoPessoa;
  criado_em?: string;
  atualizado_em?: string;
  sync_status?: string;
  deleted_at?: string | null;
}

export type TipoLancamento = "RECEITA" | "DESPESA" | "TRANSFERENCIA";
export type StatusLancamento = "PAGO" | "PENDENTE" | "CANCELADO";

export interface Lancamento {
  id: string;
  usuario_id?: string;
  tipo: TipoLancamento;
  valor: number;
  data: string;
  descricao?: string | null;
  categoria_id?: string | null;
  subcategoria_id?: string | null;
  conta_origem_id?: string | null;
  conta_destino_id?: string | null;
  pessoa_id?: string | null;
  status: StatusLancamento;
  tipo_pessoa?: TipoPessoa;
  data_pagamento?: string | null;
  transferencia_grupo_id?: string | null;
  data_busca?: string;
  criado_em?: string;
  atualizado_em?: string;
  sync_status?: string;
  deleted_at?: string | null;
  version?: number;
  categoria?: { nome: string } | null;
  subcategoria?: { nome: string } | null;
}

export interface Orcamento {
  id: string;
  usuario_id?: string;
  data: string;
  tipo: TipoLancamento;
  descricao?: string | null;
  valor_planejado: number;
  valor_realizado: number;
  categoria_id?: string | null;
  subcategoria_id?: string | null;
  conta_id?: string | null;
  pessoa_id?: string | null;
  tipo_pessoa?: TipoPessoa;
  recorrente: boolean;
  observacoes?: string | null;
  mes?: number;
  data_busca?: string;
  criado_em?: string;
  atualizado_em?: string;
  sync_status?: string;
  deleted_at?: string | null;
  categoria?: { nome: string } | null;
  subcategoria?: { nome: string } | null;
}

export interface Chamado {
  id: string;
  usuario_id: string;
  titulo: string;
  descricao?: string | null;
  respostas?: RespostaChamado[];
  status: string;
  criado_em?: string;
  atualizado_em?: string;
  sync_status?: string;
  deleted_at?: string | null;
  usuario?: { nome: string; email: string } | null;
}

export interface RespostaChamado {
  admin_id: string;
  admin_nome: string;
  mensagem: string;
  criado_em: string;
}

export interface Auditoria {
  id: string;
  usuario_id?: string;
  acao: string;
  entidade?: string;
  entidade_id?: string;
  dados_anteriores?: unknown;
  dados_novos?: unknown;
  ip?: string | null;
  user_agent?: string | null;
  contexto?: string;
  criado_em?: string;
  usuario?: { nome: string; email: string } | null;
}

export interface Sessao {
  id: string;
  user_agent?: string;
  ip?: string;
  criado_em?: string;
}

export interface DashboardTotais {
  receitas_planejadas: number;
  receitas_realizadas: number;
  despesas_planejadas: number;
  despesas_realizadas: number;
}

export interface DashboardData {
  totais: DashboardTotais;
  orcamento: Orcamento[];
  realizados: Lancamento[];
}

export interface DashboardDadosResult {
  lancamentos: Lancamento[];
  orcamentos: Orcamento[];
  totalLancamentos: number;
  totalOrcamentos: number;
}

export interface AuthResult {
  token: string;
  refreshToken: string;
  usuario: Usuario;
}

export interface ResultadoPaginado<T> {
  dados: T[];
  total: number;
  pagina: number;
  totalPaginas: number;
  itensPorPagina: number;
}

export interface AdminDashboard {
  totalReceitas: number;
  totalDespesas: number;
  saldo: number;
  totalUsuariosAtivos: number;
}

export interface FiltrosAuditoria {
  usuarioId?: string;
  acao?: string;
  entidade?: string;
  de?: string;
  ate?: string;
  limite?: number;
}

export interface CriarCategoriaPayload {
  nome: string;
  tipo: string;
  usuarioId?: string;
  eh_global?: boolean;
  ehGlobal?: boolean;
  tipo_pessoa?: TipoPessoa | null;
}

export interface CriarSubcategoriaPayload {
  categoria_id: string;
  nome: string;
  tipo_pessoa?: TipoPessoa | null;
}

export type CriarContaPayload = {
  nome: string;
  tipo_pessoa?: TipoPessoa;
};

export type CriarPessoaPayload = {
  nome: string;
  tipo_pessoa?: TipoPessoa;
};

export interface CriarLancamentoPayload {
  data: string;
  tipo: string;
  valor: number;
  descricao?: string;
  categoria_id?: string;
  subcategoria_id?: string;
  conta_origem_id?: string;
  conta_destino_id?: string;
  pessoa_id?: string;
  status?: string;
  tipo_pessoa?: TipoPessoa;
  id?: string;
}

export interface CriarTransferenciaPayload {
  data: string;
  status: string;
  valor: number;
  categoria_id?: string;
  subcategoria_id?: string;
  pessoa_id?: string;
  descricao?: string;
  conta_origem_id?: string;
  conta_destino_id?: string;
  tipo_pessoa?: TipoPessoa;
}

export interface UpdatePerfilPayload {
  nome?: string;
  email?: string;
  avatar_url?: string;
  usar_pj?: boolean;
}

export interface UploadAvatarPerfilPayload {
  nome: string;
  tipo: string;
  bytes: ArrayBuffer;
}

export interface ImportarOrcamentoItem {
  data: string;
  data_busca?: string;
  tipo: string;
  descricao?: string;
  valor_planejado: number;
  valor_realizado: number;
  categoria_id?: string;
  subcategoria_id?: string;
  conta_id?: string;
  pessoa_id?: string;
  usuario_id?: string;
  recorrente?: boolean | string;
  observacoes?: string;
  tipo_pessoa?: TipoPessoa;
  id?: string;
}
