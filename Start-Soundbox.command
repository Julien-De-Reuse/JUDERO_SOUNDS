#!/bin/bash
cd -- "$(dirname -- "$0")"
if command -v python3 >/dev/null 2>&1; then
  python3 serve.py
else
  echo "Python 3 is needed for this launcher. You can also open index.html directly in Chrome."
  read -r -p "Press Enter to close…"
fi
