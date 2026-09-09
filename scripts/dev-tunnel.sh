#!/usr/bin/env bash
# Starts the Astro dev server (if not already running) and exposes it to the
# internet via localtunnel. Prints the public URL once the tunnel is up.
set -euo pipefail

HOST="0.0.0.0"
PORT="4321"

usage() {
  cat <<EOF
Usage: $(basename "$0") [-h|--help]

Starts the Astro dev server in the background (if it isn't already running
on port ${PORT}) and exposes it to the internet via localtunnel, printing a
public URL once the tunnel is up.

The dev server keeps running in the background after you stop the tunnel
(Ctrl+C). Stop it separately with 'npx astro dev stop'.

Options:
  -h, --help   Show this help message and exit
EOF
}

case "${1:-}" in
  -h|--help)
    usage
    exit 0
    ;;
  "")
    ;;
  *)
    echo "Unknown argument: $1" >&2
    usage >&2
    exit 1
    ;;
esac

if curl -sf -o /dev/null "http://localhost:${PORT}"; then
  echo "Dev server already running on port ${PORT}, reusing it."
else
  echo "Starting dev server on ${HOST}:${PORT}..."
  npx astro dev --background --host "${HOST}" --port "${PORT}"

  echo "Waiting for dev server to come up..."
  for _ in $(seq 1 30); do
    if curl -sf -o /dev/null "http://localhost:${PORT}"; then
      break
    fi
    sleep 1
  done

  if ! curl -sf -o /dev/null "http://localhost:${PORT}"; then
    echo "Dev server did not come up in time. Check 'npx astro dev logs'." >&2
    exit 1
  fi
fi

echo "Starting localtunnel on port ${PORT}..."
echo "(Ctrl+C stops the tunnel; the dev server keeps running in the background — stop it with 'npx astro dev stop'.)"
exec npx localtunnel --port "${PORT}"
