#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/PIMS/Plugin_grafana"
BACKUP_DIR="$PROJECT_DIR/.migration-backup/native-conversion-20260812"
DOCKER_DB="$BACKUP_DIR/docker/grafana.db"
REPAIR_BACKUP="$BACKUP_DIR/post-migration-before-sqlite-repair"

if [ "$(id -u)" -ne 0 ]; then
  echo "Execute este script com sudo."
  exit 1
fi

if [ "$(sqlite3 "$DOCKER_DB" 'PRAGMA integrity_check;')" != "ok" ]; then
  echo "O backup Docker não passou na verificação de integridade."
  exit 1
fi

systemctl stop grafana-server
mkdir -p "$REPAIR_BACKUP"
find /var/lib/grafana -maxdepth 1 -type f -name 'grafana.db*' -exec cp -a -n {} "$REPAIR_BACKUP/" \;

install -o grafana -g grafana -m 0640 "$DOCKER_DB" /var/lib/grafana/grafana.db.restore
mv /var/lib/grafana/grafana.db.restore /var/lib/grafana/grafana.db
rm -f /var/lib/grafana/grafana.db-wal /var/lib/grafana/grafana.db-shm

install -o root -g root -m 0644 "$PROJECT_DIR/.config/grafana-native-pims-vision.conf" /etc/systemd/system/grafana-server.service.d/pims-vision.conf
systemctl daemon-reload
systemctl start grafana-server

for attempt in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:3000/api/health >/dev/null; then
    break
  fi
  sleep 1
done

curl --fail --silent http://127.0.0.1:3000/api/health
echo
echo "Banco SQLite restaurado sem WAL/SHM antigo."
