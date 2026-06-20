# Testes Integrados (Integration Tests)

Este diretório contém testes que validam **fluxos completos** do sistema, combinando múltiplos serviços.

## Diferença entre Testes Unitários e Integrados

| Aspecto | Unitário | Integrado |
|--------|----------|-----------|
| **Escopo** | Função/método isolado | Fluxo multi-serviço (Auth → Repository → Dashboard) |
| **Mocks** | Mocks de tudo | Apenas componentes externos (Supabase) |
| **Velocidade** | Rápido | Mais lento |
| **Confiabilidade** | Encontra bugs isolados | Encontra bugs de integração |

## Padrão de Documentação

Os testes seguem as diretrizes do [Guia de Testes](../Guia%20para%20testes.md):

- **Cabeçalho JSDoc**: Todo arquivo possui `@file`, `@description`, `@module` e `@changelog` no topo
- **Nomenclatura PT-BR**: `describe` e `it` em português, descrevendo o comportamento esperado

## Padrão

Cada arquivo de teste integrado segue:

```javascript
describe("Fluxo: [Descrição Clara]", () => {
  let auth;           // Serviço real
  let repository;     // Serviço real  
  let mockSupabase;   // Mock do Supabase

  beforeEach(async () => {
    // 1. Resetar módulos
    vi.resetModules();
    
    // 2. Criar mock do Supabase com dados iniciais
    mockSupabase = createMockSupabase();
    
    // 3. Injetar mock e criar instâncias reais
    auth = createAuthService({ supabase: mockSupabase });
    repository = createRepositoryService({ supabase: mockSupabase });
  });

  it("fluxo completo funciona do início ao fim", async () => {
    // Step 1: Login
    const user = await auth.login("teste@t.com", "senha");
    
    // Step 2: Criar dados
    const lancamento = await repository.createLancamento({...}, user.id);
    
    // Step 3: Validar efeitos colaterais
    const dashboard = await repository.getDashboard("2026-06", user.id);
    expect(dashboard.totalDespesas).toBeGreaterThan(0);
  });
});
```

## Testes Disponíveis

| Arquivo | Fluxo |
|---------|-------|
| `auth-lancamento.test.js` | Login → Criar Lançamento → Dashboard |
| `categoria-lancamento.test.js` | Gerenciar Categorias → Lançamentos |
| `conta-lancamento.test.js` | Gerenciar Contas → Lançamentos |
| `orcamento-dashboard.test.js` | Importar Orçamento → Dashboard |
| `perfil-auditoria.test.js` | Atualizar Perfil → Auditoria |
| `excluir-conta.test.js` | Exclusão de Conta → Verificação |
| `chamados-suporte.test.js` | Criar/Responder Chamados |
| `admin-global.test.js` | Admin — Dashboard, Clientes, Chamados |

## Rodando os Testes

```bash
# Todos os testes integrados
npm test -- test/integrados

# Um arquivo específico
npm test -- test/integrados/auth-lancamento.test.js

# Com coverage
npm test -- --coverage test/integrados
```
