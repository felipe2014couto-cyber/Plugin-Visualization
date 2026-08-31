# Requisitos de Hardening de Cibersegurança do Backend SIP/Oracle

Este documento especifica os controles e requisitos de segurança obrigatórios para o serviço backend SIP/Oracle e para o banco de dados Oracle.

---

## 1. Topologia e Comunicação

1. **Eliminação de DSN no Cliente**:
   - O frontend nunca envia `host`, `port`, `service_name` ou DSN Oracle.
   - O frontend envia apenas o identificador de perfil: `connectionProfile: "sip"`.
   - O backend resolve o perfil exclusivamente a partir de variáveis de ambiente/secret store seguro (ex.: `SIP_ORACLE_DSN`).
2. **Prevenção contra SSRF**:
   - Rejeitar qualquer requisição em que o cliente tente fornecer parâmetros de conexão arbitrários.
   - Falhar fechado se o perfil solicitado não estiver previamente cadastrado no backend.
3. **Same-Origin / Reverse Proxy**:
   - Em produção, o backend SIP não deve ter sua porta TCP (ex.: 8085) exposta diretamente aos usuários do navegador.
   - A comunicação deve ocorrer exclusivamente via HTTPS same-origin através de `/api/sip` no Grafana ou reverse proxy dedicado.
4. **CORS e CSRF**:
   - Não permitir `Access-Control-Allow-Origin: *`.
   - Exigir allowlist explícita de origens autorizadas (`SIP_ALLOWED_ORIGINS`).
   - Validar cabeçalhos `Origin` e `Referer` em todas as requisições que alteram estado (POST).

---

## 2. Gestão de Sessão e Credenciais

1. **Cookies de Sessão Seguros**:
   - O backend emite sessão em cookie `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, preferencialmente com prefixo `__Host-sip-session` em produção.
   - O identificador de sessão deve possuir alta entropia (ex.: `secrets.token_urlsafe(48)`).
   - O frontend não armazena tokens de sessão em estado JavaScript, localStorage, sessionStorage ou URL.
2. **Nunca Enviar Session ID na URL**:
   - Proibido `/disconnect?session_id=...`. Desconexões usam `POST /disconnect` identificado via cookie.
3. **Expiração e Limpeza**:
   - Timeout de inatividade (padrão: 1800 segundos / 30 minutos).
   - Timeout absoluto de sessão (padrão: 28800 segundos / 8 horas).
   - Limite máximo de sessões simultâneas no servidor.
   - `POST /disconnect` deve fechar a conexão Oracle e invalidar a sessão no servidor.
4. **Ciclo de Vida de Senhas**:
   - A senha recebida no `POST /connect` deve ser utilizada unicamente na autenticação com o driver Oracle e imediatamente descartada da memória.
   - Nunca registrar senhas em logs, mensagens de exceção ou respostas da API.

---

## 3. Política Estrita de Leitura (Read-Only) e SQL Injection

1. **Defesa em Profundidade Server-Side**:
   - Toda consulta deve ser validada por parser/lexer no servidor antes da execução.
   - Permitir apenas consultas `SELECT` e `WITH ... SELECT`.
   - Bloquear terminantemente:
     - DML: `INSERT`, `UPDATE`, `DELETE`, `MERGE`
     - DDL: `CREATE`, `ALTER`, `DROP`, `TRUNCATE`, `RENAME`
     - Controle de Acesso: `GRANT`, `REVOKE`
     - Transações: `COMMIT`, `ROLLBACK`, `SAVEPOINT`
     - Blocos anônimos e procedimentos: `BEGIN`, `DECLARE`, `CALL`, `EXEC`, `EXECUTE`
     - Locks e sessões: `LOCK TABLE`, `ALTER SESSION`, `SET ROLE`
     - Cláusulas de bloqueio: `SELECT ... FOR UPDATE`
     - Múltiplos statements (rejeitar consultas compostas com ponto e vírgula fora de strings/comentários literais).
2. **Packages Perigosos do Oracle**:
   - Bloquear chamadas a packages com efeitos colaterais ou acesso a rede/SO, tais como: `UTL_HTTP`, `UTL_FILE`, `UTL_TCP`, `UTL_SMTP`, `DBMS_SYS`, `DBMS_LOB` (modificações), `DBMS_SCHEDULER`, `DBMS_JAVA`, `JAVA`.
3. **Bind Variables Obrigatórias**:
   - Parâmetros fornecidos pelo usuário devem ser passados exclusivamente como binds (`cursor.execute(sql, params)`).
   - Proibida concatenação de strings ou substituição textual de parâmetros no SQL.
4. **Privilégios Mínimos no Oracle (Least Privilege)**:
   - A conta Oracle utilizada pelo SIP deve ter apenas privilégio `SELECT` em views ou tabelas explicitamente autorizadas.
   - Nunca conceder `DBA`, `RESOURCE`, `SELECT ANY TABLE`, `EXECUTE ANY`, `CREATE ANY`, `ALTER ANY` ou `DROP ANY`.
   - Configurar a sessão com `SET TRANSACTION READ ONLY` após a conexão.

---

## 4. Limites, Proteção contra DoS e Timeouts

1. **Limites de Linhas Centralizados**:
   - Limite padrão: `SIP_DEFAULT_MAX_ROWS = 200`.
   - Limite máximo estrito (Hard Cap): `SIP_HARD_MAX_ROWS = 2000`.
   - O backend sempre aplica `min(requested_rows, SIP_HARD_MAX_ROWS)` e nunca confia no valor enviado pelo navegador.
2. **Limites de Payload e Estrutura**:
   - Tamanho máximo do SQL: 64 KB (`SIP_MAX_SQL_BYTES = 65536`).
   - Limite de colunas retornadas: 256 colunas (`SIP_MAX_COLUMNS = 256`).
   - Limite de tamanho por célula: 64 KB (`SIP_MAX_CELL_BYTES = 65536`).
   - Limite total de payload de resposta: 8 MB (`SIP_MAX_RESPONSE_BYTES = 8388608`).
   - Tipos binários e LOBs não processados diretamente sem sanitização.
3. **Timeouts**:
   - Timeout de execução de query no Oracle: `30000 ms` (`call_timeout`).
   - Cancelamento imediato do cursor em caso de timeout.
4. **Taxa e Concorrência**:
   - Rate limit por IP/cliente: máximo 10 conexões/minuto e 60 consultas/minuto.
   - Máximo de 1 consulta concorrente ativa por sessão.

---

## 5. Tratamento de Erros, Logs e Respostas

1. **Sanitização de Erros**:
   - O backend nunca deve retornar stack traces, detalhes internos de arquivos, DSNs, nomes de host, senhas ou erros `ORA-xxxxx` brutos para o frontend.
   - As respostas devem utilizar códigos estáveis sanitizados:
     - `SIP_AUTH_FAILED`
     - `SIP_SESSION_EXPIRED`
     - `SIP_QUERY_REJECTED`
     - `SIP_QUERY_TIMEOUT`
     - `SIP_QUERY_LIMIT`
     - `SIP_DATABASE_UNAVAILABLE`
     - `SIP_INVALID_PARAMETERS`
     - `SIP_RATE_LIMIT`
     - `SIP_ORIGIN_REJECTED`
2. **Correlation ID (`request_id`)**:
   - Toda requisição deve conter ou gerar um `request_id` único para fins de rastreamento e auditoria no suporte.
3. **Auditoria e Logs Seguros**:
   - Logar em formato estruturado (JSON): `request_id`, `timestamp`, `action`, `username`, `duration_ms`, `row_count`, `query_hash`.
   - **NUNCA logar**: senhas, tokens de sessão, cookies, valores de binds sensíveis ou o SQL completo desnecessariamente.
4. **Headers de Segurança HTTP**:
   - `Cache-Control: no-store`
   - `X-Content-Type-Options: nosniff`
   - `X-Request-ID: <id>`
