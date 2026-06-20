# Testes Unitários (Unit Tests)

Este diretório contém testes que validam **funções e módulos isoladamente**, com mocks de todas as dependências externas.

## Diferença entre Testes Unitários e Integrados

| Aspecto | Unitário | Integrado |
|--------|----------|-----------|
| **Escopo** | Função/método isolado | Fluxo multi-serviço |
| **Mocks** | Mocks de tudo | Apenas componentes externos (Supabase) |
| **Velocidade** | Rápido | Mais lento |
| **Confiabilidade** | Encontra bugs isolados | Encontra bugs de integração |

## Estrutura

| Pasta | O que testa | Arquivos |
|-------|-------------|----------|
| `services/` | Serviços do main process (`services/`) | `auth.test.js`, `admin-service.test.js`, `repository.test.js`, `state.test.js` |
| `pages/` | Renderer/DOM (`public/`) — páginas HTML + JS | `admin.test.js`, `configuracoes.test.js`, `dashboard.test.js`, `login.test.js`, `orcamento.test.js`, `redefinir.test.js` |
| `utils/` | Utilitários e módulos transversais | `authGuard.test.js`, `auditoria.test.js`, `config.test.js`, `ipcHandlers.test.js`, `password-utils.test.js`, `toast.test.js` |

## Padrão de Documentação

Os testes seguem as diretrizes do [Guia de Testes](../Guia%20para%20testes.md):

- **Cabeçalho JSDoc**: Todo arquivo possui `@file`, `@description`, `@module` e `@changelog` no topo
- **AAA (Arrange, Act, Assert)**: Os blocos de cada teste são separados visualmente com comentários `// Arrange`, `// Act`, `// Assert`
- **Nomenclatura PT-BR**: `describe` e `it` em português, descrevendo o comportamento esperado

## Padrão

Testes de serviços seguem:

```javascript
describe("auth (wrapper Supabase Auth)", () => {
  let auth;
  let mockSupabase;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSupabase = { /* mocks específicos */ };
    const mod = await import("../../../services/auth.js");
    auth = mod.createAuthService({ supabase: mockSupabase, ... });
  });

  it("testa comportamento isolado", async () => {
    const result = await auth.login("email@t.com", "senha");
    expect(result.token).toBeDefined();
  });
});
```

Testes de páginas/DOM carregam o HTML via `fs.readFileSync` e testam interações do DOM:

```javascript
const html = fs.readFileSync(
  path.resolve(__dirname, "../../../public/login.html"), "utf-8"
);

it("preenche campos do formulário", () => {
  document.body.innerHTML = html;
  document.getElementById("email").value = "teste@t.com";
  expect(document.getElementById("email").value).toBe("teste@t.com");
});
```

## Rodando os Testes

```bash
# Todos os testes unitários
npm test -- test/unitarios

# Uma categoria específica
npm test -- test/unitarios/services
npm test -- test/unitarios/pages
npm test -- test/unitarios/utils

# Um arquivo específico
npm test -- test/unitarios/services/auth.test.js

# Com coverage
npm test -- --coverage test/unitarios
```
