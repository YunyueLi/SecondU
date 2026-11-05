#!/usr/bin/env bash
set -euo pipefail
# Only the verified bundled bubblewrap executable in this ephemeral runner needs
# permission to create its own user/network namespace. Keep host defaults intact.
if [[ ${RUNNER_OS:-} != Linux || ${GITHUB_ACTIONS:-} != true ]]; then exit 1; fi
if [[ $(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || true) != 1 ]]; then exit 0; fi
case "$1" in
  .local/ci-codex|.local/codex-candidate/runtime) ;;
  *) exit 2 ;;
esac
binary=$(realpath -e "$1/codex-resources/bwrap")
[[ "$binary" == "$GITHUB_WORKSPACE/$1/codex-resources/bwrap" && -x "$binary" ]]
[[ "$binary" =~ ^/[A-Za-z0-9_./-]+$ ]]
sudo apparmor_parser -r <<PROFILE
abi <abi/4.0>,
include <tunables/global>
profile secondu-ci-bwrap "$binary" flags=(unconfined) {
  userns,
}
PROFILE
"$binary" --unshare-user --unshare-net --ro-bind / / -- /bin/true
