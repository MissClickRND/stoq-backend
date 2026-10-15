#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run as root'; exit 1; }
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends postgresql redis-server rabbitmq-server ufw xz-utils curl ca-certificates python3
if [[ ! -x /usr/local/bin/node ]]; then
  version=v22.20.0
  temp=$(mktemp -d)
  curl -fsS "https://nodejs.org/dist/$version/node-$version-linux-x64.tar.xz" -o "$temp/node-$version-linux-x64.tar.xz"
  curl -fsS "https://nodejs.org/dist/$version/SHASUMS256.txt" -o "$temp/SHASUMS256.txt"
  (cd "$temp"; grep " node-$version-linux-x64.tar.xz$" SHASUMS256.txt | sha256sum -c -)
  tar -xJf "$temp/node-$version-linux-x64.tar.xz" -C /usr/local --strip-components=1
fi
id stoq-backend >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/stoq-backend --shell /usr/sbin/nologin stoq-backend
id stoq-backend-deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash stoq-backend-deploy
usermod -p '*' stoq-backend-deploy
install -d -m 755 -o stoq-backend-deploy -g stoq-backend-deploy /opt/stoq-backend /opt/stoq-backend/incoming /opt/stoq-backend/releases /opt/stoq-backend/dependencies
install -d -m 700 -o stoq-backend-deploy -g stoq-backend-deploy /home/stoq-backend-deploy/.ssh
install -d -m 750 -o root -g stoq-backend /etc/stoq
install -m 755 deploy/release.sh /usr/local/bin/stoq-backend-release
install -m 755 deploy/activate.sh /usr/local/bin/stoq-backend-activate
install -m 644 deploy/stoq-backend.service /etc/systemd/system/stoq-backend@.service
install -m 755 deploy/backup.sh /usr/local/bin/stoq-backup
install -m 644 deploy/stoq-backup.service deploy/stoq-backup.timer /etc/systemd/system/
printf '%s\n' 'stoq-backend-deploy ALL=(root) NOPASSWD: /usr/local/bin/stoq-backend-activate *' > /etc/sudoers.d/stoq-backend-deploy
chmod 440 /etc/sudoers.d/stoq-backend-deploy
visudo -cf /etc/sudoers.d/stoq-backend-deploy
# Reuse the repository broker configuration and existing application topology.
install -m 644 docker/rabbitmq/rabbitmq.conf /etc/rabbitmq/rabbitmq.conf
systemctl enable --now postgresql redis-server rabbitmq-server
systemctl restart rabbitmq-server
systemctl daemon-reload
systemctl enable --now stoq-backup.timer
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw default deny incoming
ufw default allow outgoing
ufw --force enable
node --version
redis-cli ping
rabbitmq-diagnostics -q ping
df -h /
