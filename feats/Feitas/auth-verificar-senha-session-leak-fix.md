# Plano: Vazamento de sessão no `verificarSenha`

## Problema

`services/auth.ts:254-270` — `verificarSenha` cria um client Supabase (`_authCheckClient`), chama `signInWithPassword` e, em caso de sucesso, abandona a sessão criada. O client é cacheado no closure e **nunca** sofre `signOut`.

Cada chamada bem-sucedida:
- Consome quota de sessões ativas no Supabase Auth
- Gera refresh tokens órfãos
- Pode causar comportamentos inesperados ao trocar senha

```ts
let _authCheckClient = null;

async function verificarSenha(_usuarioId, senha) {
  const email = (await supabase.auth.getSession()).session?.user?.email;
  if (!email) throw new AuthError("USUARIO_INVALIDO");

  if (!_authCheckClient)
    _authCheckClient = _createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { error } = await _authCheckClient.auth.signInWithPassword({ email, password: senha });
  if (error) throw new AuthError("SENHA_INVALIDA");
  return { success: true };
  // Sessão criada no _authCheckClient, NUNCA removida
}
```

## Solução

Remover o cache do client e chamar `signOut` obrigatoriamente após a verificação:

```ts
async function verificarSenha(_usuarioId, senha) {
  const { data: sessionData } = await supabase.auth.getSession();
  const email = sessionData?.session?.user?.email;
  if (!email) throw new AuthError("USUARIO_INVALIDO");

  const client = _createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error } = await client.auth.signInWithPassword({ email, password: senha });

  await client.auth.signOut().catch(() => {});

  if (error) throw new AuthError("SENHA_INVALIDA");
  return { success: true };
}
```

### Mudanças

| Item | Antes | Depois |
|---|---|---|
| `_authCheckClient` (cache) | Persistido no closure, nunca sofre signOut | Removido — client descartável |
| Criação do client | `if (!_authCheckClient) _authCheckClient = ...` | Sempre cria um client novo |
| `signOut` | Nunca chamado | Chamado sempre após signInWithPassword |
| Segurança | Sessão vaza | Sessão destruída imediatamente |

### Testes

O mock de `signOut` já existe em `test/unitarios/services/auth.test.js:62`. Nenhum ajuste necessário.
