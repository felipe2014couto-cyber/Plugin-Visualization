# Segurança do SIP/Oracle

## Estado

O frontend e o serviço `backend-python` foram endurecidos. A implantação ainda deve configurar o proxy HTTPS e comprovar os privilégios mínimos da conta Oracle antes de ser considerada integralmente segura.

**FRONTEND HARDENED**

**BACKEND HARDENED — DEPLOYMENT/ORACLE VERIFICATION REQUIRED**

## Arquitetura e fronteiras de confiança

```text
Navegador/Grafana (não confiável)
  -> HTTPS same-origin /api/sip
  -> backend SIP (autoridade de sessão, SQL e limites)
  -> perfil Oracle "sip" resolvido no servidor
  -> conta Oracle estritamente read-only
```

O browser nunca escolhe host, porta, service name ou DSN. O perfil `sip` é resolvido por `SIP_ORACLE_DSN` no backend. Em produção, o frontend chama somente `/api/sip`; o reverse proxy deve encaminhar esse caminho para o serviço local. A API deve permanecer inacessível diretamente pela rede de usuários.

## Threat model resumido

| Ameaça | Controle aplicado |
|---|---|
| SQL injection e binds | SQL e parâmetros são enviados separadamente ao driver (`cursor.execute(sql, params)`). |
| SQL arbitrário, DML/DDL, PL/SQL e packages | Lexer conservador aceita apenas um `SELECT` ou `WITH ... SELECT`, bloqueia operações de escrita, `FOR UPDATE` e packages Oracle perigosos. A conta Oracle read-only é o controle principal. |
| SSRF por DSN | DSN removido do bundle/request; apenas perfis server-side cadastrados. |
| Roubo/fixação de sessão | Token aleatório de alta entropia em cookie HttpOnly, Secure e SameSite=Strict; não aparece em JavaScript, storage ou URL. |
| CSRF/CORS | `Origin`/`Referer` validado e allowlist exata em `SIP_ALLOWED_ORIGINS`; CORS não usa wildcard. |
| Credenciais | Senha apagada da UI após sucesso ou erro e não persistida; backend mantém somente conexão já autenticada. |
| DoS | Limites de SQL, linhas, colunas, célula, payload, sessões, taxa, concorrência por sessão e `call_timeout`. |
| Exposição de erro/log | Respostas usam códigos estáveis e request ID; log contém fingerprint, duração e contagem, sem senha, token, DSN, binds ou SQL completo. |
| Formula injection | Células SIP persistem `valueOrigin: sip`, nunca passam pelo avaliador e são neutralizadas ao copiar/exportar TSV para Excel/Sheets. |
| XSS | Resultados continuam renderizados como texto React; não são convertidos automaticamente em HTML, URL, `href`, `src` ou estilo. |

## Política read-only

O backend permite `SELECT` e `WITH ... SELECT`, inclusive binds. Rejeita múltiplos statements, DML, DDL, transações, PL/SQL, alterações de sessão, locks e `SELECT ... FOR UPDATE`. Isso é defesa em profundidade, não substitui a configuração Oracle.

A conta usada no SIP deve receber apenas `SELECT` em views/tabelas aprovadas. Não conceder `DBA`, `RESOURCE`, `SELECT ANY TABLE`, `EXECUTE ANY`, `CREATE ANY`, `ALTER ANY` ou `DROP ANY`. Revogar acesso a packages de rede/arquivo (`UTL_*`), `DBMS_*`, Java stored procedures, external functions e funções de usuário com efeitos colaterais. Preferir views de leitura e testar os grants no ambiente de homologação.

## Sessão, credenciais e identidade

- Cookie: `__Host-sip-session` em produção, `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`.
- Expiração: inatividade e duração absoluta configuráveis; disconnect invalida e fecha a conexão.
- Uma query concorrente por sessão; sessões e taxa possuem limites.
- Usuário e senha nunca são gravados em dashboard, MiniSheetsDocument, storage ou logs.
- O backend ainda não recebe uma identidade Grafana autenticada confiável. Caso autorização/auditoria por usuário Grafana seja exigida, o reverse proxy/plugin backend deve propagar identidade assinada/verificada; não aceite um username livre do browser para esse fim.

## Limites e timeouts

| Variável | Padrão |
|---|---:|
| `SIP_DEFAULT_MAX_ROWS` | 200 |
| `SIP_HARD_MAX_ROWS` | 2000 |
| `SIP_MAX_SQL_BYTES` | 65536 |
| `SIP_MAX_COLUMNS` | 256 |
| `SIP_MAX_CELL_BYTES` | 65536 |
| `SIP_MAX_RESPONSE_BYTES` | 8388608 |
| `SIP_MAX_REQUEST_BYTES` | 1048576 |
| `SIP_QUERY_TIMEOUT_MS` | 30000 |
| `SIP_SESSION_IDLE_SECONDS` | 1800 |
| `SIP_SESSION_MAX_SECONDS` | 28800 |

O backend é a autoridade. O frontend usa o mesmo default/hard cap nos módulos SIP e Mini-Sheets e também possui timeout/AbortController.

## Configuração obrigatória da implantação

1. Definir `SIP_ENV=production`, `SIP_ORACLE_DSN` e `SIP_ALLOWED_ORIGINS=https://<grafana-autorizado>` em secret/config store; não colocar segredos no repositório.
2. Publicar Grafana somente por HTTPS válido e encaminhar `/api/sip` ao backend em loopback/rede privada. Não expor a porta 8085 ao usuário.
3. Verificar grants read-only da conta/roles Oracle e restringir objetos/packages.
4. Ajustar limites para capacidade real, mantendo caps finitos.
5. Proteger logs e configurar retenção; pesquisar por `request_id`, nunca por credenciais ou SQL completo.
6. Executar os testes do backend em ambiente com `fastapi` e `oracledb` instalados. Não executar payload destrutivo em produção.

## Mini-Sheets

O SQL, célula de destino, limite e opção de cabeçalho podem ser persistidos para reabrir a configuração. Sessão, cookie, usuário, senha, DSN e binds não são persistidos. Abrir um documento não executa a consulta automaticamente. Valores retornados pelo SIP, inclusive `=1+1`, `+123`, `-123` e `@texto`, permanecem dados literais após salvar, carregar e recalcular.
