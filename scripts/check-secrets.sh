#!/usr/bin/env bash
# Fails if the working tree contains things that must never be committed. Run locally (`bash scripts/check-secrets.sh`) and in CI.
set -u
cd "$(dirname "$0")/.."
fail=0
excl=(--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=build --exclude-dir=dist --exclude-dir=.gradle --exclude-dir=docs --exclude-dir=tests --exclude=.env.example --exclude=check-secrets.sh --exclude=*.png --exclude=*.zip)
patterns=(
  '-----BEGIN (RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----'
  '"private_key"[[:space:]]*:'
  'AIza[0-9A-Za-z_-]{35}'
  'AKIA[0-9A-Z]{16}'
  'gh[pousr]_[A-Za-z0-9]{36}'
  'xox[baprs]-[A-Za-z0-9-]{10,}'
  'whsec_[A-Za-z0-9+/=]{24,}'
  're_[A-Za-z0-9]{24,}'
  'postgres(ql)?://[^:/[:space:]]+:[^@[:space:]]{6,}@[^[:space:]]+'
)
for p in "${patterns[@]}"; do
  if grep -rEn "${excl[@]}" -- "$p" . 2>/dev/null | grep -v 'YOUR-\|example\.\|user:password@host' ; then echo "^^ matches secret pattern: $p"; fail=1; fi
done
# Files that must never be tracked.
for f in $(find . -type f \( -name '*.jks' -o -name '*.keystore' -o -name 'keystore.properties' -o -name 'google-services.json' -o -name '.env' -o -name '*service-account*.json' \) -not -path '*/node_modules/*' -not -path './.git/*' 2>/dev/null); do
  echo "forbidden file present: $f (must be git-ignored and never committed)"; fail=1
done
if [ "$fail" -eq 0 ]; then echo "secret scan: clean"; fi
exit "$fail"
