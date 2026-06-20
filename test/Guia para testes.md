# Software Design Document (SDD): Diretrizes e Boas Práticas para Arquitetura de Testes

## 1. Controle de Documentação do Arquivo (Changelog de Cabeçalho)

Todo arquivo de teste ou suíte de testes deve conter um cabeçalho de documentação padronizado no topo do arquivo. Esse cabeçalho serve como registro histórico de auditoria, escopo do teste (referência a requisitos/SPEC) e histórico de modificações.

### 1.1. Padrão do Cabeçalho (Template)

```javascript
/**
 * @file Suíte de Testes do Sistema de Auditoria (SPEC-11).
 * @description Valida o disparo de logs de auditoria originados pelo serviço de autenticação.
 * @module tests/services/auth.audit.spec.js
 * * @changelog
 * [2026-06-08] - João Silva
 * - Criado os testes unitários para a integração entre auth.js e logAuditoria.
 * - Implementado mock do Supabase e injeção de dependência para isolamento.
 * [2026-07-15] - Maria Souza
 * - Atualizado contrato do mock de login para suportar MFA (Multi-Factor Authentication).
 */
```

## 2. A Pirâmide de Testes e Estratégia de Isolamento

Para garantir a confiabilidade e a velocidade do pipeline de CI/CD, a estratégia de testes baseia-se na Pirâmide de Testes. Cada camada possui um propósito claro, um nível de isolamento específico e um balanço entre custo de execução e fidelidade.

### 2.1. Camada 1: Testes Unitários (Foco em Lógica e Comportamento)

    Objetivo: Validar a tomada de decisão interna de um módulo isolado.

    Uso de Mocks: Obrigatório para dependências externas (banco de dados, APIs de terceiros, sistemas de log).

    Exemplo Prático: Garantir que o método auth.login() dispara o gatilho correto (logAuditoria) com os parâmetros esperados quando o login falha. Não importa se o log foi salvo no banco de dados real neste momento; importa apenas que o comando foi emitido.

### 2.2. Camada 2: Testes de Integração (Foco em Contratos e Persistência)

    Objetivo: Garantir que dois ou mais módulos/sistemas funcionam juntos corretamente.

    Uso de Mocks: Mínimo ou inexistente para componentes internos. Testes reais conectam-se a uma instância Supabase de verdade usando service_role para seed/cleanup e anon para operações como usuário real.

    Exemplo Prático: Chamar a função real logAuditoria passando dados simulados e, em seguida, consultar a tabela do banco de dados para verificar se o registro foi realmente persistido com a tipagem e estrutura corretas.

### 2.3. Camada 3: Testes de Ponta a Ponta - E2E (Foco na Jornada do Usuário)

    Objetivo: Simular o fluxo completo que um usuário final faria no sistema.

    Uso de Mocks: Evitado ao máximo. Roda em ambiente de Staging ou Sandbox.

## 3. Injeção de Dependência vs. Acoplamento de Contrato

A injeção de dependência é a prática recomendada para desacoplar a lógica de negócios das implementações de infraestrutura. Ela permite que mocks substituam serviços reais em ambientes de teste.

### 3.1. Vantagens da Injeção de Dependência nos Testes

    Velocidade: Evita chamadas de rede (I/O) lentas.

    Determinismo: O teste não falha por oscilações externas (ex: banco de dados fora do ar).

    Simulação de Cenários Extremos: Facilidade para simular erros de infraestrutura (ex: forçar o mock a rejeitar uma Promise para testar o catch do sistema).

### 3.2. A Fragilidade do Mock (Acoplamento de Contrato)

Mocar dependências cria um risco: se a função real mudar de assinatura, o teste unitário mockado continuará passando (falso positivo).

Como mitigar essa fragilidade:

    Testes de Integração Obrigatórios: Todo serviço mockado em testes unitários deve possuir sua própria suíte de testes de integração onde ele é testado contra o ambiente real.

    Tipagem Estrita (TypeScript): Utilizar interfaces e tipos compartilhados. Se a assinatura da função logAuditoria(userId, acao, metadados) mudar para logAuditoria({ userId, acao, metadados }), o compilador do TypeScript quebrará o mock no arquivo de teste imediatamente, acusando incompatibilidade de tipo.

## 4. Padrões de Escrita de Testes Modernos

### 4.1. Estrutura AAA (Arrange, Act, Assert)

Os testes devem ser organizados visual e logicamente em três blocos:

    Arrange (Preparar): Configuração do cenário, criação de mocks e instanciacão de variáveis.

    Act (Agir): Execução da unidade de código que está sendo testada.

    Assert (Verificar): Validação dos resultados e comportamento esperados.

### 4.2. Convenção de Nomenclatura (Nomes Limpos)

Evite nomes genéricos como it("funciona"). Use descrições baseadas no comportamento esperado do negócio:

    Bom: it("deve disparar LOGIN_FAILED com o e-mail do usuário em metadados quando as credenciais forem inválidas")

    Ruim: it("testa erro de login")

Testes na liguagem PT-BR
