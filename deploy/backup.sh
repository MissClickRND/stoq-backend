#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || exit 1
umask 077
target="/var/backups/stoq/daily/$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m700 "$target"
for database in auth_db catalog_db inventory_db orders_db recommendations_db telegram_db; do
  runuser -u postgres -- pg_dump -Fc "$database" > "$target/$database.dump"
done
cp -a /etc/stoq "$target/environment"
definitions=$(mktemp /var/lib/rabbitmq/stoq-definitions-XXXXXX)
chown rabbitmq:rabbitmq "$definitions"
rabbitmqctl export_definitions "$definitions"
install -m600 "$definitions" "$target/rabbitmq-definitions.json"
rm -f -- "$definitions"
redis-cli SAVE >/dev/null
cp /var/lib/redis/dump.rdb "$target/redis.rdb"
echo "Backup complete: $target"
df -h /
