#!/usr/bin/env bash
# Source-only guard for branded first-class callers. Until it returns, use only
# shell builtins: no package manager, configuration read, install or subprocess.
agi_os_fail() { printf 'Error: %s\n' "$*" >&2; exit 2; }

agi_os_usage() {
  printf '%s\n' \
    'AGI OS first-class launcher: plan first' \
    'Usage: launcher [--mode plan|execute] [--network localhost|sepolia]' \
    '                [--yes] [--non-interactive] [--compose|--no-compose] [--skip-deploy]' \
    '--dry-run is an exact, effect-free plan alias; it accepts no value.' \
    '-h, -?, --help must be used alone. Unknown/duplicate/conflicting arguments fail.' \
    'Default/plan/help never install, load configuration, write files or run commands.' \
    'Execute requires explicit --network, --yes and --compose|--no-compose.' \
    '--skip-deploy requires --no-compose and skips only the first-class wizard.' \
    'CI, non-TTY, ASTRAL_OS_AUTO, --non-interactive never provide approval.' \
    'Legacy --auto/--auto-yes and interactive aliases are unsupported.' \
    'Execution can sign transactions, start services and replace reports.' \
    'The Hardhat mission fixture is separate from selected-network deployment evidence.' \
    'No operational or production qualification is implied. Review docs/agi-os-first-class-demo.md.'
  if [[ "$AGI_OS_PROFILE" != first-class ]]; then
    printf '%s\n' \
      'This compound launcher requires localhost and does not support --skip-deploy.' \
      'It also deploys a separate ASI local replay using its shared mission@v2.json fixture.' \
      'Its branded project-plan export applies only to the first-class synthetic fixture.'
  fi
}

agi_os_guard() {
  AGI_OS_PROFILE="$1"; shift
  AGI_OS_MODE=''
  AGI_OS_NETWORK=''
  local yes=false non_interactive=false compose=false no_compose=false skip_deploy=false
  if [[ $# -eq 1 && ( "$1" == --help || "$1" == -h || "$1" == '-?' ) ]]; then
    agi_os_usage
    exit 0
  fi
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --mode)
        [[ -z "$AGI_OS_MODE" ]] || agi_os_fail 'Duplicate or conflicting mode'
        [[ $# -ge 2 && -n "$2" && "$2" != -* ]] || agi_os_fail '--mode requires a value'
        AGI_OS_MODE="$2"; shift 2 ;;
      --dry-run)
        [[ -z "$AGI_OS_MODE" ]] || agi_os_fail 'Duplicate or conflicting mode'
        AGI_OS_MODE=plan; shift ;;
      --network)
        [[ -z "$AGI_OS_NETWORK" ]] || agi_os_fail 'Duplicate --network'
        [[ $# -ge 2 && -n "$2" && "$2" != -* ]] || agi_os_fail '--network requires a value'
        AGI_OS_NETWORK="$2"; shift 2 ;;
      --yes) $yes && agi_os_fail 'Duplicate --yes'; yes=true; shift ;;
      --non-interactive) $non_interactive && agi_os_fail 'Duplicate --non-interactive'; non_interactive=true; shift ;;
      --compose) $compose && agi_os_fail 'Duplicate --compose'; compose=true; shift ;;
      --no-compose) $no_compose && agi_os_fail 'Duplicate --no-compose'; no_compose=true; shift ;;
      --skip-deploy) $skip_deploy && agi_os_fail 'Duplicate --skip-deploy'; skip_deploy=true; shift ;;
      *) agi_os_fail "Unsupported argument: $1 (use --help alone; --dry-run accepts no value)" ;;
    esac
  done
  AGI_OS_MODE="${AGI_OS_MODE:-plan}"
  [[ "$AGI_OS_MODE" == plan || "$AGI_OS_MODE" == execute ]] || agi_os_fail '--mode must be plan or execute'
  [[ -z "$AGI_OS_NETWORK" || "$AGI_OS_NETWORK" == localhost || "$AGI_OS_NETWORK" == sepolia ]] || agi_os_fail '--network must be localhost or sepolia'
  if $compose && $no_compose; then agi_os_fail '--compose conflicts with --no-compose'; fi
  if $compose && $skip_deploy; then agi_os_fail '--compose conflicts with --skip-deploy'; fi
  if [[ "$AGI_OS_PROFILE" != first-class ]]; then
    [[ -z "$AGI_OS_NETWORK" || "$AGI_OS_NETWORK" == localhost ]] || agi_os_fail 'Compound launcher supports only localhost; no external-to-local fallback'
    $skip_deploy && agi_os_fail 'Compound launcher cannot skip the separate local replay deployment; --skip-deploy is unsupported'
  fi
  if [[ "$AGI_OS_MODE" == plan ]]; then
    printf '%s\n' \
      'Read-only plan: no commands executed; no configuration or runtime qualified.' \
      "Selected deployment/owner target: ${AGI_OS_NETWORK:-not selected (required for execute)}." \
      'Explicit execute would run the selected deployment wizard unless --skip-deploy is supplied,' \
      'then a separate in-memory Hardhat mission fixture, selected-target owner checks, and report packaging.' \
      'Hardhat fixture evidence does not verify a localhost/Sepolia deployment.' \
      'Review prerequisites, endpoints, owners and signing authority separately. Nothing is installed automatically.'
    if [[ "$AGI_OS_PROFILE" != first-class ]]; then
      printf '%s\n' 'Additional stage: a separate localhost ASI replay using shared mission@v2.json, not the branded project plan.'
    fi
    if [[ "$AGI_OS_PROFILE" == alpha-meta ]]; then
      printf '%s\n' 'Before that replay: Alpha-Meta dossier/triangulation pipeline (may fail; not qualified by this plan).'
    fi
    exit 0
  fi
  [[ -n "$AGI_OS_NETWORK" ]] || agi_os_fail 'Execute requires an explicit --network'
  if ! $compose && ! $no_compose; then agi_os_fail 'Execute requires --compose or --no-compose'; fi
  $yes || agi_os_fail 'Execute requires explicit --yes approval'
}
