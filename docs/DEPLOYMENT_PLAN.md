# Plano de Implantação e Checklist de Produção - PIMS Vision

## Visão Geral da Arquitetura

O ecossistema do **PIMS Vision** é composto por 3 camadas de serviço integradas:

1. **Frontend App Plugin (`pims-vision-app`):** Plugin nativo do Grafana (porta `3000`), responsável pela interface de edição e visualização de telas sinóticas industriais.
2. **Proxy PI Vision (`pi-vision-proxy`):** Serviço Node.js (porta `3001`), responsável pela autenticação NTLM e bypass de CORS para busca de displays do PI Vision.
3. **API Backend SIP / Oracle (`pims-vision-sql-api`):** Serviço Python/FastAPI (porta `8085`), responsável pela conexão e execução de queries SQL somente-leitura no banco Oracle do SIP.

---

## Checklist Crítico de Verificação para Produção

> [!IMPORTANT]
> **Atenção aos seguintes pontos durante o deploy em novos servidores de produção:**

### 1. Oracle Instant Client e Modo Thick (Autenticação Legada do SIP)
- **Problema:** O banco Oracle do SIP utiliza um verificador de senhas legado (versão 10g/11g com hash `0x939`). O driver `python-oracledb` em modo Thin **rejeita** essa autenticação gerando o erro `DPY-3015: password verifier type 0x939 is not supported in thin mode`.
- **Solução Obrigatória:**
  1. Instalar o **Oracle Instant Client** em `/opt/oracle/instantclient_19_30/`.
  2. Registrar no carregador dinâmico de bibliotecas:
     ```bash
     echo "/opt/oracle/instantclient_19_30" | sudo tee /etc/ld.so.conf.d/oracle-instantclient.conf
     sudo ldconfig
     ```
  3. Instalar a biblioteca nativa `libaio`:
     - No Ubuntu 20/22: `sudo apt-get install -y libaio1`
     - No Ubuntu 24 (Noble): `sudo apt-get install -y libaio1t64 && sudo ln -sf /usr/lib/x86_64-linux-gnu/libaio.so.1t64 /usr/lib/x86_64-linux-gnu/libaio.so.1`

### 2. Ambiente Isolado e Redes Corporativas sem Acesso ao PyPI
- **Problema:** Servidores de produção atrás de proxy corporativo / inspeção SSL (ex: Squid) bloqueiam o `pip install` com erro de certificado SSL (`CERTIFICATE_VERIFY_FAILED`).
- **Solução:**
  - Transferir as dependências Python empacotadas previamente ou usar mirrors internos confiáveis (`--trusted-host`).
  - Isolar a aplicação em um virtual environment (`/opt/pims-vision-sql-api/venv`).

### 3. Configuração de CORS no Proxy PI Vision
- O arquivo `pi-vision-proxy.js` deve conter no `ALLOWED_ORIGINS` (ou permitir dinamicamente via regex / variável de ambiente `ALLOWED_ORIGINS`) o IP/DNS e porta do Grafana de produção (`http://<IP_DO_SERVIDOR>:3000`).

### 4. Permissão de Plugin Unsigned no Grafana
- Configurar o drop-in do systemd em `/etc/systemd/system/grafana-server.service.d/pims-vision.conf`:
  ```ini
  [Service]
  Environment="GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=pims-vision-app"
  Environment="GF_LOG_FILTERS=plugin.pims-vision-app:debug"
  Environment="GF_DATAPROXY_LOGGING=1"
  ```
- Sempre executar `sudo systemctl daemon-reload && sudo systemctl restart grafana-server`.

### 5. Injeção do Redirecionador de Dashboards
- O script `/usr/share/grafana/public/pims-vision-dashboard-redirect.js` deve estar presente e injetado antes da tag `</head>` em `/usr/share/grafana/public/views/index.html`.

---

## Estrutura de Serviços no Servidor de Produção

| Serviço | Porta | Tipo | Diretório de Instalação | Arquivo Systemd |
|---|---|---|---|---|
| **Grafana Server** | `3000` | Nativo | `/var/lib/grafana/plugins/pims-vision-app` | `grafana-server.service` |
| **PI Vision Proxy** | `3001` | Node.js | `/opt/pims-vision-proxy` | `/etc/systemd/system/pims-vision-proxy.service` |
| **SIP Oracle API** | `8085` | Python | `/opt/pims-vision-sql-api` | `/etc/systemd/system/pims-vision-sql-api.service` |

---

## Passo a Passo de Deploy em Produção

### Passo 1: Build Local
```bash
cd /PIMS/Plugin_grafana
npm run build
```

### Passo 2: Executar o Script Automatizado de Deploy
```bash
./scripts/deploy-remote-grafana.sh <IP_DO_SERVIDOR> <USUARIO_SSH>
```

---

## Checklist de Aceite e Homologação

Execute no servidor remoto para validar todas as portas:

```bash
# 1. Validar saúde do Grafana (Porta 3000)
curl --noproxy "*" http://127.0.0.1:3000/api/health
# Esperado: {"database":"ok","version":"..."}

# 2. Validar Proxy PI Vision (Porta 3001)
curl --noproxy "*" http://127.0.0.1:3001/health
# Esperado: {"status":"ok","proxy":"pi-vision-proxy-curl"}

# 3. Validar Backend SIP/Oracle (Porta 8085)
curl --noproxy "*" http://127.0.0.1:8085/docs
# Esperado: HTML do Swagger UI

# 4. Validar status dos serviços no Systemd
sudo systemctl status grafana-server pims-vision-proxy pims-vision-sql-api --no-pager
```

### Validações Funcionais na Interface Web:
- [ ] Abrir `http://<IP>:3000/a/pims-vision-app` e carregar o editor.
- [ ] Testar **Importar PI Vision** (valida comunicação na porta 3001).
- [ ] Testar **Conexão SIP** com usuário e senha (valida autenticação Oracle Thick Mode na porta 8085).
- [ ] Abrir um dashboard salvo e verificar se o redirecionamento `/d/...` -> `/a/pims-vision-app?...` funciona.

