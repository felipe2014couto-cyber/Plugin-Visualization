# Plano de implantação do PIMS Vision

## Objetivo

Reproduzir a implantação do app plugin `pims-vision-app` em uma nova máquina com Grafana, de forma auditável e sem depender de credenciais compartilhadas.

Este documento descreve a implantação do artefato compilado em `dist/`. O plugin não possui backend nesta fase.

## Pré-requisitos da máquina destino

- Grafana instalado e em execução, compatível com `>=9.3.16`.
- Usuário técnico para acesso SSH, por exemplo `infra`.
- Diretório de plugins configurado, normalmente `/var/lib/grafana/plugins`.
- Diretório de provisioning, normalmente `/etc/grafana/provisioning/plugins`.
- Permissão administrativa para instalar arquivos nesses diretórios e reiniciar `grafana-server`.
- Acesso de rede entre a máquina de desenvolvimento e o servidor.
- Espaço livre suficiente para o conteúdo de `dist/` e uma cópia temporária de staging.

Não colocar senhas, chaves privadas ou tokens neste repositório.

## Fases do processo

### 1. Preparar e validar o build

No workspace do projeto:

```bash
npm ci
npm run typecheck
npm run lint
npm run test:ci
npm run build
```

Confirmar que o build contém o manifesto e o módulo principal:

```bash
test -f dist/plugin.json
test -f dist/module.js
```

O manifesto deve conter o ID `pims-vision-app`.

Antes de uma implantação produtiva, avaliar a assinatura do plugin com o fluxo definido pela organização. Enquanto o plugin permanecer unsigned, a máquina Grafana precisará permitir explicitamente esse ID.

### 2. Preparar o acesso remoto

1. Criar uma chave SSH dedicada ao deploy.
2. Instalar somente a chave pública em `~/.ssh/authorized_keys` do usuário técnico.
3. Usar `IdentitiesOnly=yes` e validação de host conhecida.
4. Testar o acesso com `hostname`, `id` e `grafana-server -v`.

O acesso administrativo deve ser limitado a um wrapper root-owned específico do Grafana. Não usar `NOPASSWD: ALL`.

Exemplo de permissão recomendada:

```text
infra ALL=(root) NOPASSWD: /usr/local/sbin/pims-vision-deploy
```

O wrapper deve ser de propriedade `root:root`, modo `0755`, e não aceitar caminhos ou comandos arbitrários como argumentos.

### 3. Transferir para staging

Transferir o conteúdo de `dist/` para uma área gravável pelo usuário técnico, por exemplo:

```text
/home/infra/pims-vision-app-deploy/
```

Também transferir o provisioning versionado no projeto:

```text
provisioning/plugins/apps.yaml
```

No staging, ele pode ser mantido como:

```text
/home/infra/pims-vision-app-deploy/apps.yaml
```

Validar o manifesto no staging antes da instalação.

### 4. Instalar o plugin e o provisioning

O wrapper de deploy deve realizar, nesta ordem:

1. Criar `/var/lib/grafana/plugins/pims-vision-app` com proprietário `grafana:grafana`.
2. Sincronizar o conteúdo do staging para esse diretório.
3. Ajustar o proprietário dos arquivos para `grafana:grafana`.
4. Instalar `apps.yaml` em `/etc/grafana/provisioning/plugins/apps.yaml` com proprietário `root:root` e modo `0644`.
5. Garantir que o provisioning contenha:

   ```yaml
   apiVersion: 1

   apps:
     - type: 'pims-vision-app'
       org_id: 1
       org_name: 'pims'
       disabled: false
       jsonData: {}
   ```

O provisioning é necessário para habilitar o app na organização configurada.

### 5. Permitir plugin unsigned, quando aplicável

Para uma versão unsigned, criar um drop-in persistente do systemd:

```ini
[Service]
Environment="GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=pims-vision-app"
```

Local recomendado:

```text
/etc/systemd/system/grafana-server.service.d/pims-vision.conf
```

Após criar ou alterar o drop-in, sempre executar:

```bash
systemctl daemon-reload
systemctl restart grafana-server
```

Sem `daemon-reload`, o serviço pode continuar sem a variável mesmo que o arquivo exista.

Em produção, preferir assinar o plugin e remover essa exceção de unsigned.

### 6. Validar a implantação

Validar o serviço:

```bash
systemctl is-active grafana-server
```

Validar os arquivos:

```bash
test -f /var/lib/grafana/plugins/pims-vision-app/plugin.json
test -f /var/lib/grafana/plugins/pims-vision-app/module.js
test -f /etc/grafana/provisioning/plugins/apps.yaml
```

Validar os assets pelo HTTP local do Grafana:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  http://127.0.0.1:3000/public/plugins/pims-vision-app/module.js

curl -sS -o /dev/null -w '%{http_code}\n' \
  http://127.0.0.1:3000/public/plugins/pims-vision-app/plugin.json
```

Os dois códigos esperados são `200`.

Verificar rejeições no log:

```bash
journalctl -u grafana-server --no-pager |
  grep -Ei 'pims-vision-app|unsigned|signature|Plugin validation failed'
```

Não deve haver mensagens de `Skipping loading plugin` ou `Plugin validation failed` para `pims-vision-app`.

Por fim, abrir o Grafana e confirmar a página do app em:

```text
/a/pims-vision-app
```

### 7. Rollback

Antes de substituir uma versão existente:

1. Registrar a versão atual e o checksum do `plugin.json`.
2. Fazer backup do diretório atual do plugin.
3. Restaurar o backup em caso de falha.
4. Reiniciar o Grafana.
5. Repetir todas as validações HTTP e de log.

O rollback não deve apagar arquivos sem que o destino exato e o backup estejam confirmados.

## Checklist de aceite

- [ ] `npm run build` concluído.
- [ ] `dist/plugin.json` contém `id: pims-vision-app`.
- [ ] Transferência para staging concluída.
- [ ] Plugin instalado em `/var/lib/grafana/plugins/pims-vision-app`.
- [ ] `apps.yaml` instalado e habilitado.
- [ ] Assinatura válida ou exceção unsigned configurada explicitamente.
- [ ] `systemctl daemon-reload` executado após alteração de drop-in.
- [ ] Serviço Grafana `active`.
- [ ] `module.js` e `plugin.json` retornam HTTP `200`.
- [ ] Não há erro de assinatura ou validação no log.
- [ ] Página `/a/pims-vision-app` abre no Grafana.
- [ ] Chave SSH temporária e staging removidos ou revogados conforme a política do ambiente.

## Pontos de atenção

- Manter a compatibilidade com Grafana 9.3.16; não assumir APIs exclusivas do Grafana 12.
- Não copiar `node_modules`, o workspace completo ou arquivos de credenciais para o servidor.
- Não usar `rsync --delete` sem um backup e uma confirmação explícita do diretório alvo.
- Depois de validar uma implantação unsigned, planejar a assinatura do plugin para reduzir a superfície de risco.
