#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run as root'; exit 1; }
release=${1:?Usage: stoq-backend-activate COMMIT-RUN-ATTEMPT}
[[ $release =~ ^[0-9a-f]{40}-[0-9]+-[0-9]+$ ]] || exit 1
base=/opt/stoq-backend
target="$base/releases/$release"
test -f "$target/backend/stoq-gate/dist/main.js"
exec 9>"$base/deploy.lock"
flock -x 9
services=(stoq-auth-service stoq-catalog-service stoq-inventory-service stoq-order-service stoq-recommendation-service stoq-ai-service stoq-gate)
previous=$(readlink -f "$base/current" || true)
install -d -m 700 /var/backups/stoq
chown -R root:stoq-backend "$target"
chmod -R g+rX,o-rwx "$target"
for service in "${services[@]}"; do
  directory="$target/backend/$service"
  test -f "$directory/dist/main.js"
  test -f "/etc/stoq/$service.env"
  if [[ -d "$directory/prisma" ]]; then
    database=$(source "/etc/stoq/$service.env"; printf '%s' "${DATABASE_URL##*/}")
    [[ $database =~ ^[a-z_]+$ ]] || exit 1
    runuser -u postgres -- pg_dump -Fc "$database" > "/var/backups/stoq/$database-$release.dump"
    config=prisma.config.ts
    [[ -f "$directory/$config" ]] || config=prisma7.config.ts
    (set -a; source "/etc/stoq/$service.env"; set +a; cd "$directory"; runuser -u stoq-backend --preserve-environment -- ./node_modules/.bin/prisma migrate deploy --config "$config")
  fi
done
ln -s "$target" "$base/.current-$release"
mv -Tf "$base/.current-$release" "$base/current"
units=()
for service in "${services[@]}"; do units+=("stoq-backend@$service.service"); done
systemctl restart "${units[@]}"
healthy=false
for attempt in $(seq 1 45); do
  if curl -fsS --max-time 4 http://127.0.0.1:3000/api-json >/dev/null && (set -a; source /etc/stoq/stoq-gate.env; set +a; runuser -u stoq-backend --preserve-environment -- /usr/local/bin/node "$target/deploy/health.cjs"); then
    healthy=true; break
  fi
  sleep 2
done
if [[ $healthy != true ]]; then
  if [[ -n $previous && -d $previous && $previous != "$target" ]]; then
    ln -s "$previous" "$base/.rollback-$release"
    mv -Tf "$base/.rollback-$release" "$base/current"
    systemctl restart "${units[@]}"
  fi
  echo 'Backend health check failed; previous application restored when available. Database backups retained.' >&2
  exit 1
fi
printf '%s\n' "${release%%-*}" > "$base/deploy-version.txt"
systemctl enable "${units[@]}"
echo "Backend release active: $release"
