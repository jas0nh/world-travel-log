#!/bin/zsh
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

cd "/Users/jason/Developer/Travel Map"

if [[ ! -f ".next/BUILD_ID" ]]; then
  /opt/homebrew/bin/npm run build
fi

exec /opt/homebrew/bin/npm run start -- -H 0.0.0.0 -p 8378
