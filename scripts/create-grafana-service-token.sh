#!/usr/bin/env bash

set -euo pipefail

grafana_url="${GRAFANA_URL:-http://127.0.0.1:3000}"
account_name="codex-alert-maintenance-$(date +%Y%m%d%H%M%S)"
token_name="${account_name}-token"
netrc_file=""

cleanup() {
  if [[ -n "$netrc_file" ]]; then
    rm -f -- "$netrc_file"
  fi
  unset admin_password
}
trap cleanup EXIT HUP INT TERM

command -v curl >/dev/null || { echo "curl não encontrado" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq não encontrado" >&2; exit 1; }

read -r -p "Usuário administrador do Grafana [admin]: " admin_user
admin_user="${admin_user:-admin}"
read -r -s -p "Senha do Grafana (não será exibida): " admin_password
printf '\n'

umask 077
netrc_file="$(mktemp)"
printf 'machine 127.0.0.1 login %s password %s\n' "$admin_user" "$admin_password" >"$netrc_file"

account_response="$(curl --silent --show-error --fail-with-body \
  --netrc-file "$netrc_file" --user "$admin_user" \
  -H 'Accept: application/json' -H 'Content-Type: application/json' \
  --data "$(jq -cn --arg name "$account_name" '{name: $name, role: "Editor", isDisabled: false}')" \
  "$grafana_url/api/serviceaccounts")"
account_id="$(jq -er '.id' <<<"$account_response")"

token_response="$(curl --silent --show-error --fail-with-body \
  --netrc-file "$netrc_file" --user "$admin_user" \
  -H 'Accept: application/json' -H 'Content-Type: application/json' \
  --data "$(jq -cn --arg name "$token_name" '{name: $name, secondsToLive: 3600}')" \
  "$grafana_url/api/serviceaccounts/$account_id/tokens")"
token="$(jq -er '.key' <<<"$token_response")"

unset admin_password
printf '\nToken temporário criado (expira em 1 hora):\n%s\n' "$token"
printf 'Service account: %s (ID %s)\n' "$account_name" "$account_id"
printf 'Envie somente o token ao agente e remova esta mensagem do histórico do terminal.\n'
