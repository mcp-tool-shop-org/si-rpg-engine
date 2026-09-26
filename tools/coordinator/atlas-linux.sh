#!/bin/bash
# atlas-linux.sh <checkout> [check]: regenerates and checks the Atlas map on Linux, as CI's check
# sees it. A map generated on Windows fails the check in CI, so the map is always made here. Run it
# from Git Bash on Windows through WSL:
#
#   MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash /mnt/<drive>/.../tools/coordinator/atlas-linux.sh /mnt/<drive>/.../<checkout> [check]
#
# LINUX_NODE_BIN may name the bin directory of a Linux node (a checksum-verified download works);
# otherwise the node on the Linux PATH runs it. With `check` it only checks. A git worktree's .git
# file names its gitdir with a Windows path, which Linux git cannot follow, so the pointer is
# translated to its /mnt form for the run and restored afterwards, even when the run fails.
set -e
if [ -n "${LINUX_NODE_BIN:-}" ]; then
  export PATH="$LINUX_NODE_BIN:/usr/local/bin:/usr/bin:/bin"
fi
cd "${1:?usage: atlas-linux.sh <checkout> [check]}"
restore=""
if [ -f .git ]; then
  cp .git ../.git-pointer-backup-$$
  restore="../.git-pointer-backup-$$"
  sed -E 's#gitdir: ([A-Za-z]):/#gitdir: /mnt/\L\1/#' "$restore" > .git
  trap 'cp "$restore" .git && rm -f "$restore"' EXIT
fi
echo "node $(node --version) at $(command -v node); $(git --version); $(git rev-parse --short HEAD)"
if [ "${2:-}" != "check" ]; then
  npx --yes @dogfood-lab/atlas@1.17.0 map
fi
npx --yes @dogfood-lab/atlas@1.17.0 check
