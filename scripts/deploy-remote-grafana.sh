#!/usr/bin/env bash
# ==============================================================================
# Script de Deploy e Configuração do PIMS Vision no Grafana Remoto (10.247.72.134)
# ==============================================================================
set -euo pipefail

REMOTE_HOST="${1:-10.247.72.134}"
REMOTE_USER="${2:-felipe}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== 1. Compilando o plugin localmente ==="
cd "$PROJECT_DIR"
npm run build

echo "=== 2. Enviando arquivos para o servidor remoto ($REMOTE_USER@$REMOTE_HOST) ==="
# Cria diretório de trabalho temporário no remoto
ssh "$REMOTE_USER@$REMOTE_HOST" "mkdir -p /tmp/pims-vision-deploy"

# Copia os arquivos necessários
rsync -avz --delete "$PROJECT_DIR/dist/" "$REMOTE_USER@$REMOTE_HOST:/tmp/pims-vision-deploy/dist/"
rsync -avz "$PROJECT_DIR/provisioning/" "$REMOTE_USER@$REMOTE_HOST:/tmp/pims-vision-deploy/provisioning/"
rsync -avz "$PROJECT_DIR/.config/grafana-native-pims-vision.conf" "$REMOTE_USER@$REMOTE_HOST:/tmp/pims-vision-deploy/"
rsync -avz "$PROJECT_DIR/.config/pims-vision-dashboard-redirect.js" "$REMOTE_USER@$REMOTE_HOST:/tmp/pims-vision-deploy/"
rsync -avz "$PROJECT_DIR/pi-vision-proxy.js" "$REMOTE_USER@$REMOTE_HOST:/tmp/pims-vision-deploy/"
if [ -f "$PROJECT_DIR/.env" ]; then
  rsync -avz "$PROJECT_DIR/.env" "$REMOTE_USER@$REMOTE_HOST:/tmp/pims-vision-deploy/"
fi

rsync -avz "$PROJECT_DIR/backend-python/" "$REMOTE_USER@$REMOTE_HOST:/tmp/pims-vision-deploy/backend-python/"

# Se houver Oracle Instant Client localmente, enviamos para suporte ao modo Thick (SIP)
if [ -d "/opt/oracle/instantclient_19_30" ]; then
  echo "=== Copiando Oracle Instant Client (Thick Mode) ==="
  rsync -avz --exclude='sdk*' "/opt/oracle/instantclient_19_30" "$REMOTE_USER@$REMOTE_HOST:/tmp/pims-vision-deploy/"
fi

# Se houver o plugin PI Data Source localmente, enviamos também
if [ -d "/var/lib/grafana/plugins/gridprotectionalliance-osisoftpi-datasource" ]; then
  echo "=== Copiando gridprotectionalliance-osisoftpi-datasource ==="
  rsync -avz "/var/lib/grafana/plugins/gridprotectionalliance-osisoftpi-datasource/" "$REMOTE_USER@$REMOTE_HOST:/tmp/pims-vision-deploy/gridprotectionalliance-osisoftpi-datasource/"
fi

echo "=== 3. Aplicando configurações no Grafana remoto (requer sudo no remoto) ==="
ssh -t "$REMOTE_USER@$REMOTE_HOST" "sudo bash -c '
  set -euo pipefail
  echo \"Instalando plugin pims-vision-app...\"
  mkdir -p /var/lib/grafana/plugins/pims-vision-app
  cp -a /tmp/pims-vision-deploy/dist/. /var/lib/grafana/plugins/pims-vision-app/
  chown -R grafana:grafana /var/lib/grafana/plugins/pims-vision-app

  if [ -d /tmp/pims-vision-deploy/gridprotectionalliance-osisoftpi-datasource ]; then
    echo \"Instalando plugin PI Datasource...\"
    mkdir -p /var/lib/grafana/plugins/gridprotectionalliance-osisoftpi-datasource
    cp -a /tmp/pims-vision-deploy/gridprotectionalliance-osisoftpi-datasource/. /var/lib/grafana/plugins/gridprotectionalliance-osisoftpi-datasource/
    chown -R grafana:grafana /var/lib/grafana/plugins/gridprotectionalliance-osisoftpi-datasource
  fi

  echo \"Aplicando provisioning...\"
  mkdir -p /etc/grafana/provisioning/plugins
  cp -a /tmp/pims-vision-deploy/provisioning/. /etc/grafana/provisioning/
  chown -R root:grafana /etc/grafana/provisioning

  echo \"Configurando override do Grafana (plugins nao assinados, logs, etc)...\"
  mkdir -p /etc/systemd/system/grafana-server.service.d
  install -o root -g root -m 0644 /tmp/pims-vision-deploy/grafana-native-pims-vision.conf /etc/systemd/system/grafana-server.service.d/pims-vision.conf

  echo \"Instalando script de redirecionamento de dashboards...\"
  if [ -d /usr/share/grafana/public ]; then
    install -o root -g root -m 0644 /tmp/pims-vision-deploy/pims-vision-dashboard-redirect.js /usr/share/grafana/public/pims-vision-dashboard-redirect.js
    if [ -f /usr/share/grafana/public/views/index.html ] && ! grep -q \"pims-vision-dashboard-redirect.js\" /usr/share/grafana/public/views/index.html; then
      sed -i \"/<\/head>/i\    <script src=\\\"[[.AppSubUrl]]/public/pims-vision-dashboard-redirect.js\\\"></script>\" /usr/share/grafana/public/views/index.html
    fi
  fi

  echo \"Reiniciando Grafana...\"
  systemctl daemon-reload
  systemctl restart grafana-server

  echo \"Verificando e instalando nodejs e curl se necessario...\"
  if ! command -v node >/dev/null 2>&1; then
    apt-get update -y && apt-get install -y nodejs curl
  fi
  NODE_BIN=$(command -v node || echo "/usr/bin/node")

  echo \"Configurando pasta e servico do Proxy PI Vision...\"
  mkdir -p /opt/pims-vision-proxy
  cp -a /tmp/pims-vision-deploy/pi-vision-proxy.js /opt/pims-vision-proxy/
  if [ -f /tmp/pims-vision-deploy/.env ]; then
    cp -a /tmp/pims-vision-deploy/.env /opt/pims-vision-proxy/
  fi
  chown -R root:root /opt/pims-vision-proxy

  cat << SERVICE_EOF > /etc/systemd/system/pims-vision-proxy.service
[Unit]
Description=PIMS Vision Proxy Service
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/pims-vision-proxy
ExecStart=${NODE_BIN} /opt/pims-vision-proxy/pi-vision-proxy.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
SERVICE_EOF

  systemctl daemon-reload
  systemctl enable pims-vision-proxy
  systemctl restart pims-vision-proxy

  echo \"Configurando backend Python (SIP / Oracle API - Porta 8085)...\"
  apt-get update -y && apt-get install -y python3 python3-pip python3-venv
  
  if [ -d /tmp/pims-vision-deploy/instantclient_19_30 ]; then
    echo \"Instalando Oracle Instant Client e libaio...\"
    apt-get install -y libaio1 2>/dev/null || apt-get install -y libaio1t64 2>/dev/null || true
    ln -sf /usr/lib/x86_64-linux-gnu/libaio.so.1t64 /usr/lib/x86_64-linux-gnu/libaio.so.1 2>/dev/null || true
    mkdir -p /opt/oracle
    cp -a /tmp/pims-vision-deploy/instantclient_19_30 /opt/oracle/
    echo \"/opt/oracle/instantclient_19_30\" > /etc/ld.so.conf.d/oracle-instantclient.conf
    ldconfig
  fi

  mkdir -p /opt/pims-vision-sql-api
  cp -a /tmp/pims-vision-deploy/backend-python/. /opt/pims-vision-sql-api/
  if [ ! -d /opt/pims-vision-sql-api/venv ]; then
    python3 -m venv /opt/pims-vision-sql-api/venv
  fi
  /opt/pims-vision-sql-api/venv/bin/pip install --upgrade pip 2>/dev/null || true
  /opt/pims-vision-sql-api/venv/bin/pip install -r /opt/pims-vision-sql-api/requirements.txt 2>/dev/null || true
  chown -R root:root /opt/pims-vision-sql-api

  cat << SERVICE_EOF > /etc/systemd/system/pims-vision-sql-api.service
[Unit]
Description=PIMS Vision SQL API Service
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/pims-vision-sql-api
ExecStart=/opt/pims-vision-sql-api/venv/bin/python app.py
Restart=always
RestartSec=5
Environment=ORACLE_DEFAULT_ROW_LIMIT=200
Environment=ORACLE_MAX_ROW_LIMIT=2000

[Install]
WantedBy=multi-user.target
SERVICE_EOF

  systemctl daemon-reload
  systemctl enable pims-vision-sql-api
  systemctl restart pims-vision-sql-api

  echo \"Limpando temporarios...\"
  rm -rf /tmp/pims-vision-deploy
'\"

echo "=== Deploy concluído com sucesso no servidor $REMOTE_HOST! ==="
