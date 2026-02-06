#!/usr/bin/env bash
# Kill processes using dev ports so npm run dev can start clean.
# Run: npm run kill-dev

for port in 5173 3001; do
  if command -v fuser &>/dev/null; then
    if fuser -k "$port"/tcp 2>/dev/null; then
      echo "Freed port $port"
    fi
  elif command -v lsof &>/dev/null; then
    pid=$(lsof -t -i ":$port" 2>/dev/null || true)
    if [ -n "$pid" ]; then
      kill -9 $pid 2>/dev/null || true
      echo "Freed port $port (killed PID $pid)"
    fi
  else
    echo "Neither fuser nor lsof found; cannot free port $port"
  fi
done

echo "Done. You can run: npm run dev"
