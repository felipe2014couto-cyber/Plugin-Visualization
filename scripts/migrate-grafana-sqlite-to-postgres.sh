#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/PIMS/Plugin_grafana"
BACKUP_DIR="$PROJECT_DIR/.migration-backup/postgres-conversion-20260812"
SQLITE_SOURCE="$BACKUP_DIR/grafana.sqlite"
GRAFANA_INI="/etc/grafana/grafana.ini"
GRAFANA_INI_BACKUP="$BACKUP_DIR/grafana.ini.sqlite"
PG_VERSION="14"
PG_PORT="5432"
PG_DATABASE="grafana"
PG_USER="zabbix"
PG_PASSWORD_FILE="/etc/grafana/pims-vision-postgres-password"
PGPASS_FILE="$BACKUP_DIR/pgpass"
TABLE_EXPORT_DIR="$BACKUP_DIR/table-export"
SQLITE_EXPORTER="$PROJECT_DIR/scripts/export-sqlite-table.py"
PG_LISTEN_OVERRIDE="/etc/postgresql/14/main/conf.d/zz-pims-vision-grafana.conf"
PG_HBA_FILE="/etc/postgresql/14/main/pg_hba.conf"
PG_HBA_RULE="host grafana zabbix 127.0.0.1/32 md5"
PUBLIC_LOG="$PROJECT_DIR/postgres-migration.log"

if [ "$(id -u)" -ne 0 ]; then
  echo "Execute este script com sudo."
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 0700 "$BACKUP_DIR"
touch "$PUBLIC_LOG"
chmod 0644 "$PUBLIC_LOG"
exec > >(tee -a "$PUBLIC_LOG") 2>&1

echo "Iniciando migração em $(date --iso-8601=seconds)"

if ! /usr/lib/postgresql/14/bin/postgres --version | grep -q ' 14\.'; then
  echo "PostgreSQL 14 não está disponível. Migração cancelada."
  exit 1
fi
if [ -f /etc/postgresql/12/main/start.conf ]; then
  cp -a -n /etc/postgresql/12/main/start.conf "$BACKUP_DIR/postgresql-12-start.conf"
  printf 'manual\n' > /etc/postgresql/12/main/start.conf
fi
pg_ctlcluster 12 main stop >/dev/null 2>&1 || true
pg_ctlcluster "$PG_VERSION" main stop >/dev/null 2>&1 || true
pg_conftool "$PG_VERSION" main set port "$PG_PORT"

# O cluster 14 era mantido apenas no socket Unix enquanto o PostgreSQL 12
# ocupava a porta 5432. O Grafana e a importação usam TCP em 127.0.0.1.
if [ -f "$PG_LISTEN_OVERRIDE" ]; then
  cp -a -n "$PG_LISTEN_OVERRIDE" "$BACKUP_DIR/zz-pims-vision-grafana.conf.before-migration"
fi
printf "listen_addresses = '127.0.0.1'\nport = %s\n" "$PG_PORT" > "$PG_LISTEN_OVERRIDE"
chown postgres:postgres "$PG_LISTEN_OVERRIDE"
chmod 0644 "$PG_LISTEN_OVERRIDE"

cp -a -n "$PG_HBA_FILE" "$BACKUP_DIR/pg_hba.conf.before-migration"
temporary_hba="$(mktemp)"
printf '%s\n' "$PG_HBA_RULE" > "$temporary_hba"
awk '!($1 == "host" && $2 == "grafana" && $3 == "zabbix" && $4 == "127.0.0.1/32")' "$PG_HBA_FILE" >> "$temporary_hba"
cat "$temporary_hba" > "$PG_HBA_FILE"
rm -f "$temporary_hba"
chown postgres:postgres "$PG_HBA_FILE"
chmod 0640 "$PG_HBA_FILE"

pg_ctlcluster "$PG_VERSION" main start

for attempt in $(seq 1 30); do
  if pg_isready -h 127.0.0.1 -p "$PG_PORT" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! pg_isready -h 127.0.0.1 -p "$PG_PORT"; then
  echo "O PostgreSQL 14 não abriu a conexão TCP em 127.0.0.1:$PG_PORT."
  tail -80 /var/log/postgresql/postgresql-14-main.log || true
  exit 1
fi
echo "PostgreSQL 14 disponível em 127.0.0.1:$PG_PORT."

CURRENT_DB_TYPE="$(sed -n '/^\[database\]/,/^\[/p' "$GRAFANA_INI" | awk -F= '/^[[:space:]]*type[[:space:]]*=/{gsub(/[[:space:]]/, "", $2); print $2; exit}')"
if [ "$CURRENT_DB_TYPE" = "postgres" ]; then
  echo "O Grafana já está configurado para PostgreSQL. Nenhum dado foi alterado."
  exit 0
fi

# Limpa exclusivamente o banco incompleto deixado pela tentativa anterior.
if runuser -u postgres -- psql -p "$PG_PORT" -tAc "SELECT 1 FROM pg_database WHERE datname='$PG_DATABASE'" | grep -q 1; then
  EXISTING_OWNER="$(runuser -u postgres -- psql -p "$PG_PORT" -tAc "SELECT pg_catalog.pg_get_userbyid(datdba) FROM pg_database WHERE datname='$PG_DATABASE'")"
  if [ "$EXISTING_OWNER" != "$PG_USER" ]; then
    echo "O banco $PG_DATABASE já existe e pertence a $EXISTING_OWNER. Migração cancelada para não sobrescrever dados."
    exit 1
  fi
  echo "Removendo o banco incompleto da tentativa anterior."
  systemctl stop grafana-server
  runuser -u postgres -- psql -p "$PG_PORT" -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$PG_DATABASE' AND pid <> pg_backend_pid();"
  runuser -u postgres -- dropdb -p "$PG_PORT" "$PG_DATABASE"
fi
if runuser -u postgres -- psql -p "$PG_PORT" -tAc "SELECT 1 FROM pg_roles WHERE rolname='$PG_USER'" | grep -q 1; then
  runuser -u postgres -- psql -p "$PG_PORT" -v ON_ERROR_STOP=1 -c "DROP ROLE $PG_USER;"
fi

systemctl stop grafana-server
cp -a "$GRAFANA_INI" "$GRAFANA_INI_BACKUP"
cp -a /var/lib/grafana/grafana.db "$SQLITE_SOURCE"

POSTGRES_CREATED=0
rollback_migration() {
  echo "A migração falhou. Restaurando o Grafana com SQLite."
  systemctl stop grafana-server || true
  if [ -s "$GRAFANA_INI_BACKUP" ]; then
    cp -a "$GRAFANA_INI_BACKUP" "$GRAFANA_INI"
  fi
  rm -f "$PGPASS_FILE"
  rm -rf "$TABLE_EXPORT_DIR"
  if [ "$POSTGRES_CREATED" -eq 1 ]; then
    runuser -u postgres -- psql -p "$PG_PORT" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$PG_DATABASE' AND pid <> pg_backend_pid();" || true
    runuser -u postgres -- dropdb -p "$PG_PORT" --if-exists "$PG_DATABASE" || true
    runuser -u postgres -- psql -p "$PG_PORT" -c "DROP ROLE IF EXISTS $PG_USER" || true
    rm -f "$PG_PASSWORD_FILE"
  fi
  systemctl start grafana-server || true
}
trap rollback_migration ERR

if [ "$(sqlite3 "$SQLITE_SOURCE" 'PRAGMA integrity_check;')" != "ok" ]; then
  echo "O SQLite atual não passou na verificação de integridade."
  false
fi

SQLITE_DASHBOARDS="$(sqlite3 "$SQLITE_SOURCE" 'SELECT count(*) FROM dashboard;')"
SQLITE_DATASOURCES="$(sqlite3 "$SQLITE_SOURCE" 'SELECT count(*) FROM data_source;')"
SQLITE_ORGS="$(sqlite3 "$SQLITE_SOURCE" 'SELECT count(*) FROM org;')"

DB_PASSWORD="$(openssl rand -hex 32)"
umask 077
printf '%s\n' "$DB_PASSWORD" > "$PG_PASSWORD_FILE"
chown root:grafana "$PG_PASSWORD_FILE"
chmod 0640 "$PG_PASSWORD_FILE"

runuser -u postgres -- psql -p "$PG_PORT" -v ON_ERROR_STOP=1 <<SQL
SET password_encryption = 'md5';
CREATE ROLE $PG_USER LOGIN PASSWORD '$DB_PASSWORD';
SQL
runuser -u postgres -- createdb -p "$PG_PORT" -O "$PG_USER" "$PG_DATABASE"
POSTGRES_CREATED=1

if ! PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" -tAc 'SELECT 1' | grep -q 1; then
  echo "A autenticação TCP do usuário $PG_USER no banco $PG_DATABASE falhou."
  false
fi
echo "Autenticação PostgreSQL validada para $PG_USER@$PG_DATABASE."

sed -i '/^\[database\]/,/^\[/{
  s|^;\?type =.*|type = postgres|
  s|^;\?host =.*|host = 127.0.0.1:5432|
  s|^;\?name =.*|name = grafana|
  s|^;\?user =.*|user = zabbix|
  s|^;\?password =.*|password = $__file{/etc/grafana/pims-vision-postgres-password}|
  s|^;\?ssl_mode =.*|ssl_mode = disable|
}' "$GRAFANA_INI"

# O próprio Grafana cria o esquema PostgreSQL exato para a versão 12.0.0.
systemctl start grafana-server
for attempt in $(seq 1 180); do
  if curl --fail --silent http://127.0.0.1:3000/api/health | grep -q '"database": "ok"'; then
    break
  fi
  sleep 1
done
if ! curl --fail --silent http://127.0.0.1:3000/api/health | grep -q '"database": "ok"'; then
  echo "O Grafana não conseguiu criar o esquema PostgreSQL em até 180 segundos."
  systemctl --no-pager --full status grafana-server || true
  false
fi
systemctl stop grafana-server

POSTGRES_TABLES="$(PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" -tAc "SELECT count(*) FROM pg_tables WHERE schemaname='public';")"
if [ "$POSTGRES_TABLES" -lt 70 ]; then
  echo "O esquema PostgreSQL criado pelo Grafana está incompleto: $POSTGRES_TABLES tabelas."
  false
fi
echo "Esquema PostgreSQL criado pelo Grafana: $POSTGRES_TABLES tabelas."

# Remove os registros iniciais criados no banco vazio, preservando o esquema.
PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  table_list text;
BEGIN
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
    INTO table_list
    FROM pg_tables
   WHERE schemaname = 'public';
  IF table_list IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE ' || table_list || ' RESTART IDENTITY CASCADE';
  END IF;
END $$;
SQL

printf '127.0.0.1:%s:%s:%s:%s\n' "$PG_PORT" "$PG_DATABASE" "$PG_USER" "$DB_PASSWORD" > "$PGPASS_FILE"
chmod 0600 "$PGPASS_FILE"
rm -rf "$TABLE_EXPORT_DIR"
mkdir -p "$TABLE_EXPORT_DIR"
chmod 0700 "$TABLE_EXPORT_DIR"

while IFS= read -r table_name; do
  if [[ ! "$table_name" =~ ^[a-zA-Z0-9_]+$ ]]; then
    echo "Nome de tabela SQLite inesperado: $table_name"
    false
  fi
  mapfile -t sqlite_columns < <(sqlite3 "$SQLITE_SOURCE" "SELECT name FROM pragma_table_info('$table_name') ORDER BY cid;")
  mapfile -t postgres_columns < <(
    PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" -At \
      -c "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='$table_name' ORDER BY ordinal_position;"
  )

  common_columns=()
  for postgres_column in "${postgres_columns[@]}"; do
    for sqlite_column in "${sqlite_columns[@]}"; do
      if [ "$postgres_column" = "$sqlite_column" ]; then
        common_columns+=("$postgres_column")
        break
      fi
    done
  done
  if [ "${#common_columns[@]}" -eq 0 ]; then
    echo "A tabela $table_name não possui colunas compatíveis."
    false
  fi

  export_file="$TABLE_EXPORT_DIR/$table_name.csv"
  python3 "$SQLITE_EXPORTER" "$SQLITE_SOURCE" "$table_name" "$export_file" "${common_columns[@]}"
  if [ -s "$export_file" ]; then
    quoted_columns="$(printf '"%s",' "${common_columns[@]}")"
    quoted_columns="${quoted_columns%,}"
    PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" -v ON_ERROR_STOP=1 \
      -c "\\copy \"$table_name\" ($quoted_columns) FROM '$export_file' WITH (FORMAT csv, NULL '\\N')"
  fi
done < <(sqlite3 "$SQLITE_SOURCE" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;")

rm -f "$PGPASS_FILE"
rm -rf "$TABLE_EXPORT_DIR"

PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  item record;
  maximum bigint;
BEGIN
  FOR item IN
    SELECT table_schema, table_name, column_name,
           pg_get_serial_sequence(format('%I.%I', table_schema, table_name), column_name) AS sequence_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_default LIKE 'nextval(%'
  LOOP
    IF item.sequence_name IS NOT NULL THEN
      EXECUTE format('SELECT MAX(%I) FROM %I.%I', item.column_name, item.table_schema, item.table_name) INTO maximum;
      IF maximum IS NULL THEN
        PERFORM setval(item.sequence_name, 1, false);
      ELSE
        PERFORM setval(item.sequence_name, maximum, true);
      END IF;
    END IF;
  END LOOP;
END $$;
SQL

POSTGRES_DASHBOARDS="$(PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" -tAc 'SELECT count(*) FROM dashboard;')"
POSTGRES_DATASOURCES="$(PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" -tAc 'SELECT count(*) FROM data_source;')"
POSTGRES_ORGS="$(PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" -tAc 'SELECT count(*) FROM org;')"

if [ "$SQLITE_DASHBOARDS" != "$POSTGRES_DASHBOARDS" ] || [ "$SQLITE_DATASOURCES" != "$POSTGRES_DATASOURCES" ] || [ "$SQLITE_ORGS" != "$POSTGRES_ORGS" ]; then
  echo "As contagens migradas não conferem. O Grafana continuará em SQLite."
  false
fi

systemctl start grafana-server
for attempt in $(seq 1 180); do
  if curl --fail --silent http://127.0.0.1:3000/api/health | grep -q '"database": "ok"'; then
    break
  fi
  sleep 1
done

if ! curl --fail --silent http://127.0.0.1:3000/api/health | grep -q '"database": "ok"'; then
  echo "O Grafana não iniciou com os dados migrados em até 180 segundos."
  systemctl --no-pager --full status grafana-server || true
  false
fi
curl --fail --silent http://127.0.0.1:3000/api/health
systemctl --no-pager --full status grafana-server | sed -n '1,12p'
trap - ERR

echo
echo "Migração PostgreSQL concluída."
echo "Dashboards: $POSTGRES_DASHBOARDS | Datasources: $POSTGRES_DATASOURCES | Organizações: $POSTGRES_ORGS"
echo "O SQLite foi preservado em $SQLITE_SOURCE"
