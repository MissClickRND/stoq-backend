#!/usr/bin/env bash
set -euo pipefail
release=${1:?Usage: stoq-backend-release COMMIT-RUN-ATTEMPT}
[[ $release =~ ^[0-9a-f]{40}-[0-9]+-[0-9]+$ ]] || exit 1
base=/opt/stoq-backend
archive="$base/incoming/$release.tar.gz"
target="$base/releases/$release"
test -f "$archive"
test ! -e "$target"
available=$(df -Pm "$base" | awk 'NR==2 {print $4}')
(( available >= 2000 )) || { echo 'Need at least 2 GB free before building a release'; exit 1; }
exec 8>"$base/build.lock"
flock -x 8
python3 - "$archive" <<'PY'
import sys, tarfile
from pathlib import PurePosixPath
with tarfile.open(sys.argv[1], 'r:gz') as archive:
    for member in archive.getmembers():
        path = PurePosixPath(member.name)
        if path.is_absolute() or '..' in path.parts or not (member.isfile() or member.isdir()):
            raise SystemExit('Unsafe archive member')
PY
mkdir "$target"
tar -xzf "$archive" -C "$target" --no-same-owner --no-same-permissions
STOQ_DEPENDENCY_CACHE="$base/dependencies" bash "$target/deploy/build.sh"
sudo /usr/local/bin/stoq-backend-activate "$release"
rm -f -- "$archive"
