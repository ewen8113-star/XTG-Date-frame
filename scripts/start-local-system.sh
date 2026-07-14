#!/bin/zsh
set -e

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

cd "/Users/ewen/Desktop/My Project/XTG-Date-frame"
mkdir -p .tmp

is_healthy() {
  /usr/bin/curl -fsS -o /dev/null "http://localhost:5174/" \
    && /usr/bin/curl -fsS -o /dev/null "http://localhost:3131/api/health"
}

while true; do
  if is_healthy; then
    sleep 30
    continue
  fi

  npm run dev
  sleep 5
done
