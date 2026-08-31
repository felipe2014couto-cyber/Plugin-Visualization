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

  echo \"Limpando temporarios...\"
  rm -rf /tmp/pims-vision-deploy
'"

echo "=== Deploy concluído com sucesso no servidor $REMOTE_HOST! ==="
