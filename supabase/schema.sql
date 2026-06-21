-- ============================================================
-- SCHEMA: Finanças Pessoais
-- Descrição: Estrutura completa do banco de dados do projeto
--            de controle financeiro pessoal (Electron + Supabase)
-- ============================================================
-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. USUÁRIOS
CREATE TABLE financas_usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL CHECK (char_length(nome) BETWEEN 2 AND 40),
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  avatar_url TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. CATEGORIAS
CREATE TABLE financas_categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL CHECK (char_length(nome) BETWEEN 2 AND 40),
  tipo TEXT NOT NULL CHECK (tipo IN ('RECEITA', 'DESPESA', 'TRANSFERENCIA')),
  usuario_id UUID REFERENCES financas_usuarios (id) ON DELETE CASCADE,
  eh_global BOOLEAN NOT NULL DEFAULT FALSE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  tipo_pessoa TEXT CHECK (tipo_pessoa IN ('PF', 'PJ')), -- NULL = compartilhada
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  device_id TEXT,
  updated_by UUID REFERENCES financas_usuarios (id)
);

-- 3. SUBCATEGORIAS
CREATE TABLE financas_subcategorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id UUID NOT NULL REFERENCES financas_categorias (id) ON DELETE CASCADE,
  nome TEXT NOT NULL CHECK (char_length(nome) BETWEEN 2 AND 40),
  usuario_id UUID NOT NULL REFERENCES financas_usuarios (id),
  tipo_pessoa TEXT CHECK (tipo_pessoa IN ('PF', 'PJ')), -- NULL = compartilhada
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  device_id TEXT,
  updated_by UUID REFERENCES financas_usuarios (id)
);

-- 4. CONTAS
CREATE TABLE financas_contas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL CHECK (char_length(nome) BETWEEN 2 AND 40),
  usuario_id UUID REFERENCES financas_usuarios (id) ON DELETE CASCADE,
  tipo_pessoa TEXT NOT NULL DEFAULT 'PF' CHECK (tipo_pessoa IN ('PF', 'PJ')),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  device_id TEXT,
  updated_by UUID REFERENCES financas_usuarios (id)
);

-- 5. PESSOAS
CREATE TABLE financas_pessoas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL CHECK (char_length(nome) BETWEEN 2 AND 40),
  usuario_id UUID REFERENCES financas_usuarios (id) ON DELETE CASCADE,
  tipo_pessoa TEXT NOT NULL DEFAULT 'PF' CHECK (tipo_pessoa IN ('PF', 'PJ')),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  device_id TEXT,
  updated_by UUID REFERENCES financas_usuarios (id)
);

-- 6. CHAMADOS (suporte)
CREATE TABLE financas_chamados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES financas_usuarios (id) ON DELETE CASCADE,
  titulo TEXT NOT NULL CHECK (char_length(titulo) BETWEEN 2 AND 200),
  descricao TEXT,
  respostas JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'em_andamento', 'resolvido')),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  device_id TEXT,
  updated_by UUID REFERENCES financas_usuarios (id)
);

-- 8. LANÇAMENTOS
CREATE TABLE financas_lancamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES financas_usuarios (id) ON DELETE CASCADE,
  data DATE NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('RECEITA', 'DESPESA', 'TRANSFERENCIA')),
  valor NUMERIC(12, 2) NOT NULL CHECK (valor > 0),
  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PAGO', 'PENDENTE', 'CANCELADO')),
  categoria_id UUID REFERENCES financas_categorias (id) ON DELETE SET NULL,
  subcategoria_id UUID REFERENCES financas_subcategorias (id) ON DELETE SET NULL,
  conta_origem_id UUID REFERENCES financas_contas (id) ON DELETE SET NULL,
  conta_destino_id UUID REFERENCES financas_contas (id) ON DELETE SET NULL,
  transferencia_grupo_id UUID,
  pessoa_id UUID REFERENCES financas_pessoas (id) ON DELETE SET NULL,
  descricao TEXT,
  tipo_pessoa TEXT NOT NULL DEFAULT 'PF' CHECK (tipo_pessoa IN ('PF', 'PJ')),
  data_pagamento TIMESTAMPTZ,
  data_busca TEXT GENERATED ALWAYS AS (
    EXTRACT(
      YEAR
      FROM
        data
    )::int::text || '-' || LPAD(
      EXTRACT(
        MONTH
        FROM
          data
      )::int::text,
      2,
      '0'
    )
  ) STORED,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  device_id TEXT,
  updated_by UUID REFERENCES financas_usuarios (id)
);

-- 9. ORÇAMENTO
CREATE TABLE financas_orcamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES financas_usuarios (id) ON DELETE CASCADE,
  data DATE NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('RECEITA', 'DESPESA')),
  descricao TEXT,
  tipo_pessoa TEXT NOT NULL DEFAULT 'PF' CHECK (tipo_pessoa IN ('PF', 'PJ')),
  valor_planejado NUMERIC(12, 2) NOT NULL CHECK (valor_planejado >= 0),
  valor_realizado NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (valor_realizado >= 0),
  categoria_id UUID REFERENCES financas_categorias (id) ON DELETE SET NULL,
  subcategoria_id UUID REFERENCES financas_subcategorias (id) ON DELETE SET NULL,
  conta_id UUID REFERENCES financas_contas (id) ON DELETE SET NULL,
  pessoa_id UUID REFERENCES financas_pessoas (id) ON DELETE SET NULL,
  recorrente BOOLEAN NOT NULL DEFAULT FALSE,
  observacoes TEXT,
  mes INTEGER GENERATED ALWAYS AS (
    EXTRACT(
      MONTH
      FROM
        data
    )
  ) STORED,
  data_busca TEXT GENERATED ALWAYS AS (
    EXTRACT(
      YEAR
      FROM
        data
    )::int::text || '-' || LPAD(
      EXTRACT(
        MONTH
        FROM
          data
      )::int::text,
      2,
      '0'
    )
  ) STORED,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  device_id TEXT,
  updated_by UUID REFERENCES financas_usuarios (id)
);

-- ============================================================
-- ÍNDICES
-- ============================================================
-- financas_categorias
CREATE INDEX idx_categorias_usuario ON financas_categorias (usuario_id);

-- financas_subcategorias
CREATE INDEX idx_subcategorias_categoria_id ON financas_subcategorias (categoria_id);

CREATE INDEX idx_subcategorias_usuario ON financas_subcategorias (usuario_id);

-- financas_lancamentos
CREATE INDEX idx_lancamentos_data ON financas_lancamentos (data);

CREATE INDEX idx_lancamentos_tipo ON financas_lancamentos (tipo);

CREATE INDEX idx_lancamentos_status ON financas_lancamentos (status);

CREATE INDEX idx_lancamentos_categoria_id ON financas_lancamentos (categoria_id);

CREATE INDEX idx_lancamentos_data_busca ON financas_lancamentos (data_busca);

CREATE INDEX idx_lancamentos_data_range ON financas_lancamentos (data, status);

CREATE INDEX idx_lancamentos_usuario ON financas_lancamentos (usuario_id);

CREATE INDEX idx_lancamentos_transferencia_grupo ON financas_lancamentos (transferencia_grupo_id);

-- financas_categorias
CREATE INDEX idx_categorias_tipo_pessoa ON financas_categorias (tipo_pessoa);

-- financas_subcategorias
CREATE INDEX idx_subcategorias_tipo_pessoa ON financas_subcategorias (tipo_pessoa);

-- financas_contas
CREATE INDEX idx_contas_tipo_pessoa ON financas_contas (tipo_pessoa);

-- financas_pessoas
CREATE INDEX idx_pessoas_tipo_pessoa ON financas_pessoas (tipo_pessoa);

-- financas_lancamentos
CREATE INDEX idx_lancamentos_tipo_pessoa ON financas_lancamentos (tipo_pessoa);

-- financas_orcamento
CREATE INDEX idx_orcamento_data ON financas_orcamento (data);

CREATE INDEX idx_orcamento_tipo ON financas_orcamento (tipo);

CREATE INDEX idx_orcamento_mes ON financas_orcamento (mes);

CREATE INDEX idx_orcamento_data_busca ON financas_orcamento (data_busca);

CREATE INDEX idx_orcamento_usuario ON financas_orcamento (usuario_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE financas_usuarios ENABLE ROW LEVEL SECURITY;

ALTER TABLE financas_categorias ENABLE ROW LEVEL SECURITY;

ALTER TABLE financas_subcategorias ENABLE ROW LEVEL SECURITY;

ALTER TABLE financas_contas ENABLE ROW LEVEL SECURITY;

ALTER TABLE financas_pessoas ENABLE ROW LEVEL SECURITY;

ALTER TABLE financas_chamados ENABLE ROW LEVEL SECURITY;

ALTER TABLE financas_lancamentos ENABLE ROW LEVEL SECURITY;

ALTER TABLE financas_orcamento ENABLE ROW LEVEL SECURITY;

-- Helper: verifica se o usuário autenticado é admin
CREATE OR REPLACE FUNCTION is_admin () RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM financas_usuarios
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$;

-- Usuários: próprio perfil ou admin
CREATE POLICY "usuarios_select" ON financas_usuarios FOR
SELECT
  USING (
    id = auth.uid ()
    OR is_admin ()
  );

CREATE POLICY "usuarios_update" ON financas_usuarios
FOR UPDATE
  USING (
    id = auth.uid ()
    OR is_admin ()
  );

-- Categorias: globais são públicas, próprias são isoladas, admin vê tudo
CREATE POLICY "categorias_select" ON financas_categorias FOR
SELECT
  USING (
    eh_global = true
    OR usuario_id = auth.uid ()
    OR is_admin ()
  );

CREATE POLICY "categorias_insert" ON financas_categorias FOR INSERT
WITH
  CHECK (
    usuario_id = auth.uid ()
    OR is_admin ()
  );

CREATE POLICY "categorias_update" ON financas_categorias
FOR UPDATE
  USING (
    usuario_id = auth.uid ()
    OR is_admin ()
  );

CREATE POLICY "categorias_delete" ON financas_categorias FOR DELETE USING (
  usuario_id = auth.uid ()
  OR is_admin ()
);

-- Subcategorias: isolamento por usuário (diretamente via usuario_id)
CREATE POLICY "subcategorias_select" ON financas_subcategorias FOR
SELECT
  USING (
    usuario_id = auth.uid ()
    OR is_admin ()
  );

CREATE POLICY "subcategorias_insert" ON financas_subcategorias FOR INSERT
WITH
  CHECK (
    usuario_id = auth.uid ()
    OR is_admin ()
  );

CREATE POLICY "subcategorias_update" ON financas_subcategorias
FOR UPDATE
  USING (
    usuario_id = auth.uid ()
    OR is_admin ()
  );

CREATE POLICY "subcategorias_delete" ON financas_subcategorias FOR DELETE USING (
  usuario_id = auth.uid ()
  OR is_admin ()
);

-- Contas: admin vê tudo, usuário só as próprias
CREATE POLICY "contas_select" ON financas_contas FOR
SELECT
  USING (
    usuario_id = auth.uid ()
    OR is_admin ()
  );

CREATE POLICY "contas_insert" ON financas_contas FOR INSERT
WITH
  CHECK (usuario_id = auth.uid ());

CREATE POLICY "contas_update" ON financas_contas
FOR UPDATE
  USING (usuario_id = auth.uid ())
WITH
  CHECK (usuario_id = auth.uid ());

CREATE POLICY "contas_delete" ON financas_contas FOR DELETE USING (usuario_id = auth.uid ());

-- Pessoas: admin vê tudo, usuário só as próprias
CREATE POLICY "pessoas_select" ON financas_pessoas FOR
SELECT
  USING (
    usuario_id = auth.uid ()
    OR is_admin ()
  );

CREATE POLICY "pessoas_insert" ON financas_pessoas FOR INSERT
WITH
  CHECK (usuario_id = auth.uid ());

CREATE POLICY "pessoas_update" ON financas_pessoas
FOR UPDATE
  USING (usuario_id = auth.uid ())
WITH
  CHECK (usuario_id = auth.uid ());

CREATE POLICY "pessoas_delete" ON financas_pessoas FOR DELETE USING (usuario_id = auth.uid ());

-- Chamados: próprio usuário ou admin
CREATE POLICY "chamados_select" ON financas_chamados FOR
SELECT
  USING (
    usuario_id = auth.uid ()
    OR is_admin ()
  );

CREATE POLICY "chamados_insert" ON financas_chamados FOR INSERT
WITH
  CHECK (usuario_id = auth.uid ());

CREATE POLICY "chamados_update" ON financas_chamados
FOR UPDATE
  USING (
    usuario_id = auth.uid ()
    OR is_admin ()
  );

-- Lançamentos: admin vê tudo, usuário só os próprios
CREATE POLICY "lancamentos_select" ON financas_lancamentos FOR
SELECT
  USING (
    usuario_id = auth.uid ()
    OR is_admin ()
  );

CREATE POLICY "lancamentos_insert" ON financas_lancamentos FOR INSERT
WITH
  CHECK (usuario_id = auth.uid ());

CREATE POLICY "lancamentos_update" ON financas_lancamentos
FOR UPDATE
  USING (usuario_id = auth.uid ())
WITH
  CHECK (usuario_id = auth.uid ());

CREATE POLICY "lancamentos_delete" ON financas_lancamentos FOR DELETE USING (usuario_id = auth.uid ());

-- Orçamento: admin vê tudo, usuário só o próprio
CREATE POLICY "orcamento_select" ON financas_orcamento FOR
SELECT
  USING (
    usuario_id = auth.uid ()
    OR is_admin ()
  );

CREATE POLICY "orcamento_insert" ON financas_orcamento FOR INSERT
WITH
  CHECK (usuario_id = auth.uid ());

CREATE POLICY "orcamento_update" ON financas_orcamento
FOR UPDATE
  USING (usuario_id = auth.uid ())
WITH
  CHECK (usuario_id = auth.uid ());

CREATE POLICY "orcamento_delete" ON financas_orcamento FOR DELETE USING (usuario_id = auth.uid ());

-- ============================================================
-- TRIGGER: atualizado_em automático
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_set_atualizado_em () RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_atualizado_em_usuarios BEFORE
UPDATE ON financas_usuarios FOR EACH ROW
EXECUTE FUNCTION trigger_set_atualizado_em ();

CREATE TRIGGER set_atualizado_em_categorias BEFORE
UPDATE ON financas_categorias FOR EACH ROW
EXECUTE FUNCTION trigger_set_atualizado_em ();

CREATE TRIGGER set_atualizado_em_subcategorias BEFORE
UPDATE ON financas_subcategorias FOR EACH ROW
EXECUTE FUNCTION trigger_set_atualizado_em ();

CREATE TRIGGER set_atualizado_em_contas BEFORE
UPDATE ON financas_contas FOR EACH ROW
EXECUTE FUNCTION trigger_set_atualizado_em ();

CREATE TRIGGER set_atualizado_em_pessoas BEFORE
UPDATE ON financas_pessoas FOR EACH ROW
EXECUTE FUNCTION trigger_set_atualizado_em ();

CREATE TRIGGER set_atualizado_em_chamados BEFORE
UPDATE ON financas_chamados FOR EACH ROW
EXECUTE FUNCTION trigger_set_atualizado_em ();

CREATE TRIGGER set_atualizado_em_lancamentos BEFORE
UPDATE ON financas_lancamentos FOR EACH ROW
EXECUTE FUNCTION trigger_set_atualizado_em ();

CREATE TRIGGER set_atualizado_em_orcamento BEFORE
UPDATE ON financas_orcamento FOR EACH ROW
EXECUTE FUNCTION trigger_set_atualizado_em ();

-- ============================================================
-- TRIGGER: atualizado_em via sync (BEFORE UPDATE)
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at () RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_categorias BEFORE
UPDATE ON financas_categorias FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at ();

CREATE TRIGGER set_updated_at_subcategorias BEFORE
UPDATE ON financas_subcategorias FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at ();

CREATE TRIGGER set_updated_at_contas BEFORE
UPDATE ON financas_contas FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at ();

CREATE TRIGGER set_updated_at_pessoas BEFORE
UPDATE ON financas_pessoas FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at ();

CREATE TRIGGER set_updated_at_chamados BEFORE
UPDATE ON financas_chamados FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at ();

CREATE TRIGGER set_updated_at_lancamentos BEFORE
UPDATE ON financas_lancamentos FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at ();

CREATE TRIGGER set_updated_at_orcamento BEFORE
UPDATE ON financas_orcamento FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at ();

-- ============================================================
-- RPCs de sincronia (offline-first)
-- ============================================================
CREATE OR REPLACE FUNCTION sync_insert (tabela TEXT, payload JSONB) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = public AS $$
DECLARE
  v_resultado JSONB;
  v_sql TEXT;
  v_cols TEXT;
  v_vals TEXT;
BEGIN
  IF tabela NOT IN ('financas_lancamentos', 'financas_categorias', 'financas_subcategorias', 'financas_contas', 'financas_pessoas', 'financas_orcamento', 'financas_chamados') THEN
    RAISE EXCEPTION 'Tabela não permitida: %', tabela;
  END IF;

  SELECT string_agg(format('%I', key), ', '),
         string_agg(format('$1->>%L', key), ', ')
  INTO v_cols, v_vals
  FROM jsonb_object_keys(payload) AS key;

  v_sql := format('INSERT INTO %I (%s) VALUES (%s) RETURNING row_to_json(%I.*)',
    tabela, v_cols, v_vals, tabela);

  EXECUTE v_sql INTO v_resultado USING payload;
  RETURN v_resultado;
END;
$$;

CREATE OR REPLACE FUNCTION sync_upsert (registro_id UUID, expected_version INT, tabela TEXT, payload JSONB) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = public AS $$
DECLARE
  v_linhas INT;
  v_resultado JSONB;
  v_sets TEXT;
  v_sql TEXT;
BEGIN
  IF tabela NOT IN ('financas_lancamentos', 'financas_categorias', 'financas_subcategorias', 'financas_contas', 'financas_pessoas', 'financas_orcamento', 'financas_chamados') THEN
    RAISE EXCEPTION 'Tabela não permitida: %', tabela;
  END IF;

  SELECT string_agg(format('%I = $3->>%L', key, key), ', ')
  INTO v_sets
  FROM jsonb_object_keys(payload) AS key
  WHERE key NOT IN ('id', 'version');

  IF v_sets IS NULL OR v_sets = '' THEN
    RAISE EXCEPTION 'Payload vazio ou contém apenas id/version';
  END IF;

  v_sql := format(
    'UPDATE %I SET %s, version = version + 1 WHERE id = $1 AND version = $2',
    tabela, v_sets
  );

  EXECUTE v_sql USING registro_id, expected_version, payload;
  GET DIAGNOSTICS v_linhas = ROW_COUNT;

  IF v_linhas = 0 THEN
    RAISE EXCEPTION 'CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  EXECUTE format('SELECT row_to_json(t) FROM %I t WHERE id = $1', tabela)
    INTO v_resultado USING registro_id;
  RETURN v_resultado;
END;
$$;

CREATE OR REPLACE FUNCTION sync_delete (registro_id UUID, tabela TEXT) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = public AS $$
BEGIN
  IF tabela NOT IN ('financas_lancamentos', 'financas_categorias', 'financas_subcategorias', 'financas_contas', 'financas_pessoas', 'financas_orcamento', 'financas_chamados') THEN
    RAISE EXCEPTION 'Tabela não permitida: %', tabela;
  END IF;

  EXECUTE format(
    'UPDATE %I SET deleted_at = now(), version = version + 1 WHERE id = $1',
    tabela
  ) USING registro_id;
END;
$$;

-- ============================================================
-- RPCs de gerenciamento de sessões (auth schema)
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_sessions (p_user_id UUID)
RETURNS TABLE (
  id UUID,
  user_agent TEXT,
  ip INET,
  created_at TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = auth AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.user_agent, s.ip, s.created_at
  FROM auth.sessions s
  WHERE s.user_id = p_user_id
  ORDER BY s.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION delete_user_session (p_session_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = auth AS $$
BEGIN
  DELETE FROM auth.refresh_tokens WHERE session_id = p_session_id;
  DELETE FROM auth.sessions WHERE id = p_session_id;
END;
$$;

-- ============================================================
-- FUNÇÃO: exclusão de conta (bypass RLS via SECURITY DEFINER)
-- ============================================================
CREATE OR REPLACE FUNCTION excluir_conta () RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  INSERT INTO financas_auditoria (
    usuario_id,
    acao,
    entidade,
    entidade_id,
    dados_novos,
    contexto
  )
  VALUES (
    v_user_id,
    'CONTA_EXCLUIDA',
    'usuarios',
    v_user_id,
    jsonb_build_object('metodo', 'user'),
    'user'
  );

  DELETE FROM financas_lancamentos   WHERE usuario_id = v_user_id;
  DELETE FROM financas_orcamento     WHERE usuario_id = v_user_id;
  DELETE FROM financas_contas        WHERE usuario_id = v_user_id;
  DELETE FROM financas_pessoas       WHERE usuario_id = v_user_id;
  DELETE FROM financas_categorias    WHERE usuario_id = v_user_id;
  DELETE FROM financas_subcategorias WHERE usuario_id = v_user_id;
  DELETE FROM financas_chamados      WHERE usuario_id = v_user_id;

  DELETE FROM financas_usuarios
  WHERE id = v_user_id;

  DELETE FROM auth.users
  WHERE id = v_user_id
    AND v_user_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION excluir_conta ()
FROM
  PUBLIC;

GRANT
EXECUTE ON FUNCTION excluir_conta () TO authenticated;

-- ============================================================
-- TRIGGER: criar perfil ao cadastrar via Supabase Auth
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.financas_usuarios (
    id,
    nome,
    email,
    role
  )
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'nome',
      split_part(NEW.email, '@', 1)
    ),
    NEW.email,
    'user'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW
EXECUTE FUNCTION handle_new_user ();

-- ============================================================
-- AUDITORIA (SPEC-11)
-- ============================================================
CREATE TYPE acao_auditoria AS ENUM(
  'INSERT',
  'UPDATE',
  'DELETE',
  'LOGIN',
  'LOGOUT',
  'LOGIN_FAILED',
  'SENHA_TROCADA',
  'DADOS_EXPORTADOS',
  'CONTA_EXCLUIDA',
  'ADMIN_TOGGLE_USUARIO',
  'ADMIN_RESET_SENHA',
  'ADMIN_CRIOU_USUARIO',
  'CONFLITO_RESOLVIDO'
);

CREATE TABLE financas_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES financas_usuarios (id) ON DELETE SET NULL,
  acao acao_auditoria NOT NULL,
  entidade TEXT NOT NULL,
  entidade_id UUID,
  dados_anteriores JSONB,
  dados_novos JSONB,
  ip TEXT,
  user_agent TEXT,
  contexto TEXT NOT NULL DEFAULT 'user' CHECK (contexto IN ('user', 'admin', 'trigger')),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_auditoria_usuario ON financas_auditoria (usuario_id);

CREATE INDEX idx_auditoria_acao ON financas_auditoria (acao);

CREATE INDEX idx_auditoria_entidade ON financas_auditoria (entidade, entidade_id);

CREATE INDEX idx_auditoria_data ON financas_auditoria (criado_em DESC);

CREATE INDEX idx_auditoria_busca ON financas_auditoria (criado_em, acao, usuario_id);

-- Função gatilho genérica: captura INSERT / UPDATE / DELETE
CREATE OR REPLACE FUNCTION auditoria_trigger () RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = public AS $$
DECLARE
  _usuario_id UUID;
BEGIN
  _usuario_id := auth.uid();

  IF TG_TABLE_NAME = 'financas_usuarios' AND TG_OP = 'DELETE' THEN
    _usuario_id := NULL;
  END IF;

  INSERT INTO financas_auditoria (
    usuario_id,
    acao,
    entidade,
    entidade_id,
    dados_anteriores,
    dados_novos,
    contexto
  ) VALUES (
    _usuario_id,
    TG_OP::acao_auditoria,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    CASE WHEN _usuario_id IS NULL THEN 'trigger' ELSE 'user' END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Triggers AFTER em todas as tabelas de dados
CREATE TRIGGER audit_lancamentos
AFTER INSERT
OR
UPDATE
OR DELETE ON financas_lancamentos FOR EACH ROW
EXECUTE FUNCTION auditoria_trigger ();

CREATE TRIGGER audit_orcamento
AFTER INSERT
OR
UPDATE
OR DELETE ON financas_orcamento FOR EACH ROW
EXECUTE FUNCTION auditoria_trigger ();

CREATE TRIGGER audit_categorias
AFTER INSERT
OR
UPDATE
OR DELETE ON financas_categorias FOR EACH ROW
EXECUTE FUNCTION auditoria_trigger ();

CREATE TRIGGER audit_subcategorias
AFTER INSERT
OR
UPDATE
OR DELETE ON financas_subcategorias FOR EACH ROW
EXECUTE FUNCTION auditoria_trigger ();

CREATE TRIGGER audit_contas
AFTER INSERT
OR
UPDATE
OR DELETE ON financas_contas FOR EACH ROW
EXECUTE FUNCTION auditoria_trigger ();

CREATE TRIGGER audit_pessoas
AFTER INSERT
OR
UPDATE
OR DELETE ON financas_pessoas FOR EACH ROW
EXECUTE FUNCTION auditoria_trigger ();

CREATE TRIGGER audit_chamados
AFTER INSERT
OR
UPDATE
OR DELETE ON financas_chamados FOR EACH ROW
EXECUTE FUNCTION auditoria_trigger ();

CREATE TRIGGER audit_usuarios
AFTER INSERT
OR
UPDATE
OR DELETE ON financas_usuarios FOR EACH ROW
EXECUTE FUNCTION auditoria_trigger ();

-- RLS: admin vê tudo; usuário vê apenas os próprios logs
ALTER TABLE financas_auditoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auditoria_select" ON financas_auditoria FOR
SELECT
  USING (
    usuario_id = auth.uid ()
    OR is_admin ()
  );

CREATE POLICY "auditoria_insert" ON financas_auditoria FOR INSERT TO public
WITH
  CHECK (auth.role () = 'authenticated');
