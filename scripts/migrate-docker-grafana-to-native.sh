#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/PIMS/Plugin_grafana"
BACKUP_DIR="$PROJECT_DIR/.migration-backup/native-conversion-20260812"
DOCKER_BACKUP="$BACKUP_DIR/docker"
NATIVE_BACKUP="$BACKUP_DIR/native"

if [ "$(id -u)" -ne 0 ]; then
  echo "Execute este script com sudo."
  exit 1
fi

if ! /usr/sbin/grafana -v | grep -q '12.0.0'; then
  echo "A instalação nativa não está na versão 12.0.0. Migração cancelada."
  exit 1
fi

if [ ! -s "$DOCKER_BACKUP/grafana.db" ]; then
  echo "Backup do banco Docker não encontrado. Migração cancelada."
  exit 1
fi

if [ "$(sqlite3 "$DOCKER_BACKUP/grafana.db" 'PRAGMA integrity_check;')" != "ok" ]; then
  echo "O backup do banco Docker não passou na verificação de integridade."
  exit 1
fi

systemctl stop grafana-server
docker stop pims-vision-app >/dev/null 2>&1 || true

mkdir -p "$NATIVE_BACKUP"
cp -a /var/lib/grafana/grafana.db "$NATIVE_BACKUP/grafana.db"
cp -a /etc/grafana/grafana.ini "$NATIVE_BACKUP/grafana.ini"
cp -a /etc/default/grafana-server "$NATIVE_BACKUP/grafana-server.default"
if [ -d /var/lib/grafana/plugins ] && [ ! -e "$NATIVE_BACKUP/plugins-before-migration" ]; then
  cp -a /var/lib/grafana/plugins "$NATIVE_BACKUP/plugins-before-migration"
fi
if [ -d /etc/grafana/provisioning ] && [ ! -e "$NATIVE_BACKUP/provisioning-before-migration" ]; then
  cp -a /etc/grafana/provisioning "$NATIVE_BACKUP/provisioning-before-migration"
fi

install -o grafana -g grafana -m 0640 "$DOCKER_BACKUP/grafana.db" /var/lib/grafana/grafana.db

if [ -d /var/lib/grafana/plugins ] && [ ! -e "$NATIVE_BACKUP/plugins-live-before-migration" ]; then
  mv /var/lib/grafana/plugins "$NATIVE_BACKUP/plugins-live-before-migration"
fi
install -d -o grafana -g grafana -m 0750 /var/lib/grafana/plugins
cp -a "$DOCKER_BACKUP/plugins/." /var/lib/grafana/plugins/
chown -R grafana:grafana /var/lib/grafana/plugins

cp -a "$PROJECT_DIR/provisioning/." /etc/grafana/provisioning/
chown -R root:grafana /etc/grafana/provisioning

install -d -m 0755 /etc/systemd/system/grafana-server.service.d
install -o root -g root -m 0644 "$PROJECT_DIR/.config/grafana-native-pims-vision.conf" /etc/systemd/system/grafana-server.service.d/pims-vision.conf

install -o root -g root -m 0644 "$PROJECT_DIR/.config/pims-vision-dashboard-redirect.js" /usr/share/grafana/public/pims-vision-dashboard-redirect.js
if ! grep -q 'pims-vision-dashboard-redirect.js' /usr/share/grafana/public/views/index.html; then
  sed -i '/<\/head>/i\    <script src="[[.AppSubUrl]]/public/pims-vision-dashboard-redirect.js"></script>' /usr/share/grafana/public/views/index.html
fi

systemctl daemon-reload
systemctl enable grafana-server
systemctl start grafana-server

for attempt in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:3000/api/health >/dev/null; then
    break
  fi
  sleep 1
done

curl --fail --silent http://127.0.0.1:3000/api/health
systemctl --no-pager --full status grafana-server | sed -n '1,12p'
echo
echo "Migração concluída. O container Docker foi mantido parado para rollback."
