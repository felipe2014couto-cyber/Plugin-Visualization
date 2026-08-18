#!/usr/bin/env bash

set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Execute este instalador como root: sudo $0" >&2
  exit 1
fi

readonly wrapper_path="/usr/local/sbin/codex-grafana-token"
readonly helper_path="/usr/local/libexec/codex-grafana-token"
readonly sudoers_path="/etc/sudoers.d/codex-grafana-token"
readonly temp_dir="$(mktemp -d /tmp/codex-grafana-token.XXXXXX)"

cleanup() {
  rm -rf -- "$temp_dir"
}
trap cleanup EXIT HUP INT TERM

install -d -o root -g root -m 0755 /usr/local/libexec

cat >"$temp_dir/helper" <<'HELPER'
#!/usr/bin/env bash

set -euo pipefail

readonly grafana_url="http://127.0.0.1:3000"
readonly account_name="codex-alert-maintenance-$(/bin/date +%Y%m%d%H%M%S)"
readonly token_name="${account_name}-token"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Este comando deve ser executado como root." >&2
  exit 1
fi

command -v /usr/bin/curl >/dev/null || { echo "curl não encontrado" >&2; exit 1; }
command -v /usr/bin/jq >/dev/null || { echo "jq não encontrado" >&2; exit 1; }

read -r -p "Usuário administrador do Grafana [admin]: " admin_user
admin_user="${admin_user:-admin}"

echo "A senha será solicitada pelo curl e não será armazenada."
account_response="$(/usr/bin/curl --silent --show-error --fail-with-body \
  --user "$admin_user" \
  -H 'Accept: application/json' -H 'Content-Type: application/json' \
  --data "$(/usr/bin/jq -cn --arg name "$account_name" '{name: $name, role: "Editor", isDisabled: false}')" \
  "$grafana_url/api/serviceaccounts")"
account_id="$(/usr/bin/jq -er '.id' <<<"$account_response")"

token_response="$(/usr/bin/curl --silent --show-error --fail-with-body \
  --user "$admin_user" \
  -H 'Accept: application/json' -H 'Content-Type: application/json' \
  --data "$(/usr/bin/jq -cn --arg name "$token_name" '{name: $name, secondsToLive: 3600}')" \
  "$grafana_url/api/serviceaccounts/$account_id/tokens")"
token="$(/usr/bin/jq -er '.key' <<<"$token_response")"

printf '\nToken temporário do Grafana (expira em 1 hora):\n%s\n' "$token"
printf 'Service account: %s (ID %s)\n' "$account_name" "$account_id"
printf 'Remova o token do histórico do terminal após copiá-lo.\n'
HELPER

cat >"$temp_dir/wrapper" <<'WRAPPER'
#!/bin/sh
set -eu

if [ "$#" -ne 0 ]; then
  echo "Uso: sudo /usr/local/sbin/codex-grafana-token" >&2
  exit 2
fi

exec /usr/local/libexec/codex-grafana-token
WRAPPER

chmod 0755 "$temp_dir/helper" "$temp_dir/wrapper"
install -o root -g root -m 0755 "$temp_dir/helper" "$helper_path"
install -o root -g root -m 0755 "$temp_dir/wrapper" "$wrapper_path"

printf 'infra ALL=(root) NOPASSWD: %s\n' "$wrapper_path" >"$temp_dir/sudoers"
/usr/sbin/visudo -cf "$temp_dir/sudoers" >/dev/null
install -o root -g root -m 0440 "$temp_dir/sudoers" "$sudoers_path"

echo "Permissão instalada: $wrapper_path"
echo "O usuário infra só pode executar esse comando root, sem argumentos."
