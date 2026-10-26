#!/usr/bin/env bash
set -euo pipefail
umask 077
version="${1:?Versao por hash}"
[[ "$version" =~ ^[a-f0-9]{12}$ ]] || exit 2
base=/opt/tio-v2/institucional
release="$base/releases/$version"
test -f "$release/server.mjs"
# Documents reuse the existing private Supabase Storage bucket, not a new volume.
# Reuse only the two existing server-side integration keys. Never print values.
python3 - "$base/runtime.env" <<'PY'
import subprocess,json,sys,os,urllib.parse
env=json.loads(subprocess.check_output(['docker','inspect','tio-ai']))[0]['Config']['Env']
values=dict(value.split('=',1) for value in env if '=' in value)
source=urllib.parse.urlparse(values.get('CONSULTA_URL',''))
if source.hostname not in ('supabase-envoy','api-gw','kong','envoy'):
    raise SystemExit('Origem interna do Supabase precisa ser conferida; nenhuma chave foi exibida.')
url=urllib.parse.urlunparse((source.scheme,source.netloc,'','','',''))
key=values.get('TIO_SERVICE_KEY','')
if not key: raise SystemExit('Chave de servidor indisponivel.')
out={'TIO_SUPABASE_URL':url,'TIO_SERVICE_KEY':key,'GOOGLE_MAPS_KEY':values.get('GOOGLE_MAPS_KEY',''),
     'SITE_ORIGINS':'https://chamaotio.com,https://www.chamaotio.com'}
if any('\n' in v or '\r' in v for v in out.values()): raise SystemExit('Configuracao invalida.')
with open(sys.argv[1],'w') as f:
    for k,v in out.items(): f.write(k+'='+v+'\n')
os.chmod(sys.argv[1],0o600)
print('Configuracao privada preparada, sem exibir valores.')
PY
docker build -f "$release/Dockerfile.v2" -t "tio-institucional-v2:$version" "$release"
cp "$release/deploy/compose.yml" "$base/compose.yml"
printf 'SITE_VERSION=%s\n' "$version" > "$base/.env"
cd "$base"
docker compose -p tio-institucional-v2 config --quiet
docker compose -p tio-institucional-v2 up -d --no-deps institucional
for attempt in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:3180/healthz; then echo; break; fi
  sleep 1
done
if curl --fail --silent http://127.0.0.1:3180/readyz > /dev/null; then
  echo 'API do banco pronta.'
else
  echo 'Site preparado; API aguarda aprovacao/aplicacao dos contratos SQL. Nao mudar DNS ainda.'
fi
echo 'Institucional preparado em loopback 3180. DNS e Caddy nao foram alterados.'
