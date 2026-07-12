#!/bin/zsh
set -e

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

cd "/Users/ewen/Desktop/My Project/XTG-Date-frame"
mkdir -p .tmp

exec npm run dev
