#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
export NODE_OPTIONS=${NODE_OPTIONS:---max-old-space-size=1536}
for service in auth catalog inventory order recommendation ai gate; do
  directory="$root/backend/stoq-$service-service"
  [[ $service != gate ]] || directory="$root/backend/stoq-gate"
  cd "$directory"
  cached=false
  if [[ -n ${STOQ_DEPENDENCY_CACHE:-} ]]; then
    digest=$({ cat package-lock.json; if [[ -f prisma/schema.prisma ]]; then cat prisma/schema.prisma; fi; } | sha256sum | cut -d' ' -f1)
    dependency="$STOQ_DEPENDENCY_CACHE/$(basename "$directory")-$digest"
    if [[ -f "$dependency/ready" ]]; then
      ln -s "$dependency/node_modules" node_modules
      cached=true
    fi
  fi
  if [[ $cached != true ]]; then npm ci --no-audit --no-fund; fi
  if [[ -d prisma && $cached != true ]]; then
    config=prisma.config.ts
    [[ -f $config ]] || config=prisma7.config.ts
    DATABASE_URL=${DATABASE_URL:-postgresql://unused:unused@127.0.0.1:5432/unused} ./node_modules/.bin/prisma generate --config "$config"
  fi
  if [[ -n ${STOQ_DEPENDENCY_CACHE:-} && $cached != true ]]; then
    mkdir -p "$dependency"
    mv node_modules "$dependency/node_modules"
    touch "$dependency/ready"
    ln -s "$dependency/node_modules" node_modules
  fi
  npm run build
done
