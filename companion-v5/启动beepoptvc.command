#!/bin/zsh
cd "${0:A:h}"
if ! command -v node >/dev/null 2>&1; then
  for candidate in "$HOME"/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node; do
    if [[ -x "$candidate" ]]; then export PATH="${candidate:h}:$PATH"; break; fi
  done
fi
if ! command -v node >/dev/null 2>&1; then
  print '请先从 https://nodejs.org/ 安装 Node.js 22+。'
  read '?按回车关闭…'; exit 1
fi
node start.cjs
if [[ $? -ne 0 ]]; then read '?按回车关闭…'; fi
