"""Inert Cosmic CLI regressions. No real compiler, provider or demo is executed."""
from pathlib import Path
import json
import os
import shutil
import subprocess

import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
DEMO = Path('demo/cosmic-omni-sovereign-symphony')
ENTRIES = ['flagship-demo.sh', 'orchestrate.sh']
SAFE_ARGS = [[], ['--dry-run'], ['--ci'], ['--ci', '--dry-run'],
             ['--mode', 'plan'], ['--help'], ['-h']]
INVALID_ARGS = [
    ['--unknown'], ['local-rehearsal'], ['--mode'], ['--mode', ''],
    ['--mode', '--ci'], ['--mode', 'mainnet'], ['--mode=local-rehearsal'],
    ['--ci', '--ci'], ['--dry-run', '--dry-run'], ['--help', '--help'],
    ['--mode', 'plan', '--mode', 'plan'],
    ['--mode', 'local-rehearsal', '--dry-run'],
    ['--dry-run', '--mode', 'offline-fixture'],
    ['--help', '--mode', 'local-rehearsal'], ['--help', '--unknown'],
]


def fixture(tmp_path, entry):
    root = tmp_path / 'repository with spaces'
    bins = root / DEMO / 'bin'
    bins.mkdir(parents=True)
    for script in (ROOT / DEMO / 'bin').glob('*.sh'):
        shutil.copyfile(script, bins / script.name)
    marker = tmp_path / 'unexpected-child'
    poison = tmp_path / 'poison-bin'
    poison.mkdir()
    # Every command used by the old wrappers is a harmless, recording failure.
    for name in ['dirname', 'realpath', 'pwd', 'date', 'mkdir', 'cat', 'tee',
                 'node', 'npm', 'npx', 'python3', 'env', 'bash', 'mmdc', 'forge']:
        command = poison / name
        command.write_text(f'#!/bin/sh\nprintf "%s\\n" "$0" >> "{marker}"\nexit 97\n')
        command.chmod(0o700)
    env_marker = tmp_path / 'dotenv-was-sourced'
    for location in [root, root / DEMO]:
        (location / '.env').write_text(f'printf unsafe > "{env_marker}"\nexit 91\n')
    env = {'PATH': str(poison), 'HOME': str(tmp_path),
           'RPC_URL': 'https://external.invalid', 'MAINNET_PRIVATE_KEY': 'never-use',
           'AGIJOBS_FLAGSHIP_SKIP_ONCHAIN': 'false', 'NODE_OPTIONS': '--require=hostile'}
    return root, bins / entry, env, marker, env_marker


class CosmicModesTest(unittest.TestCase):
    def test_shared_helpers_fail_closed_even_in_conditional_callers(self):
        for failure in ['preflight', 'launch', 'start', 'mktemp']:
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as temp:
                events = Path(temp) / 'events'
                helper = ROOT / 'demo/aurora/bin/local-node.sh'
                script = r'''
set -euo pipefail
source "$1"
ROOT=/inert; DEMO_PORT=18545; DEMO_NODE_ENGINE=hardhat; LOCAL_NODE_STATE=/inert/state
failure="$2"; events="$3"
node() { printf 'preflight\n' >> "$events"; [[ "$failure" != preflight ]] || return 77; }
python3() { printf '%s\n' "$2" >> "$events"; [[ "$failure" != "$2" ]] || return 77; }
mktemp() { printf 'mktemp\n' >> "$events"; return 77; }
status=0
if [[ "$failure" == mktemp ]]; then
  prepare_local_node || status=$?
else
  start_local_node || status=$?
fi
exit "$status"
'''
                result = subprocess.run(['/bin/bash', '-c', script, 'fixture', str(helper), failure, str(events)],
                                        capture_output=True, text=True, timeout=5)
                self.assertEqual(result.returncode, 77, result.stderr)
                self.assertEqual(events.read_text().splitlines(), {
                    'preflight': ['preflight'], 'launch': ['preflight', 'launch'],
                    'start': ['preflight', 'launch', 'start'], 'mktemp': ['preflight', 'mktemp'],
                }[failure])

    def test_planning_is_builtin_only_and_effect_free(self):
        for entry in ENTRIES:
            for args in SAFE_ARGS:
                with self.subTest(entry=entry, args=args), tempfile.TemporaryDirectory() as temp:
                    root, script, env, marker, env_marker = fixture(Path(temp), entry)
                    before = sorted(str(p.relative_to(root)) for p in root.rglob('*'))
                    result = subprocess.run(['/bin/bash', str(script), *args], env=env,
                                            capture_output=True, text=True, timeout=5)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertIn('plan', result.stdout.lower())
                    self.assertFalse(marker.exists(), 'Planning launched an external command')
                    self.assertFalse(env_marker.exists(), 'Planning sourced .env')
                    self.assertEqual(sorted(str(p.relative_to(root)) for p in root.rglob('*')), before)

    def test_invalid_arguments_fail_before_any_effect(self):
        for entry in ENTRIES:
            for args in INVALID_ARGS:
                with self.subTest(entry=entry, args=args), tempfile.TemporaryDirectory() as temp:
                    root, script, env, marker, env_marker = fixture(Path(temp), entry)
                    result = subprocess.run(['/bin/bash', str(script), *args], env=env,
                                            capture_output=True, text=True, timeout=5)
                    self.assertEqual(result.returncode, 2, result.stderr)
                    self.assertFalse(marker.exists())
                    self.assertFalse(env_marker.exists())
                    self.assertFalse((root / DEMO / 'logs').exists())

    def test_explicit_mode_forwarding_has_allowlisted_environment(self):
        for entry in ENTRIES:
            for mode in ['offline-fixture', 'local-rehearsal']:
                with self.subTest(entry=entry, mode=mode), tempfile.TemporaryDirectory() as temp:
                    root, script, env, marker, env_marker = fixture(Path(temp), entry)
                    capture = Path(temp) / 'captured'
                    environ = Path(temp) / 'environment'
                    (script.parent / 'execution.sh').write_text(
                        'cosmic_execute() {\n'
                        f'printf "%s\\n" "$@" > "{capture}"\n'
                        f'/usr/bin/env > "{environ}"\n' + '}\n')
                    env.update(PATH=os.environ['PATH'], RPC_URL='http://127.0.0.1:18545',
                               DEMO_PORT='18545', HARDHAT_CONFIG='/hostile',
                               AGIJOBS_GOV_CONFIG='/hostile', GOVERNANCE_ADDRESS='0xexternal',
                               PYTHONPATH='/hostile', HTTP_PROXY='https://external.invalid',
                               npm_config_registry='https://external.invalid')
                    result = subprocess.run(['/bin/bash', str(script), '--ci', '--mode', mode],
                                            env=env, capture_output=True, text=True, timeout=5)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertEqual(capture.read_text().splitlines(),
                                     [str(root), mode, 'true', entry.removesuffix('.sh')])
                    values = dict(line.split('=', 1) for line in environ.read_text().splitlines())
                    for key in ['MAINNET_PRIVATE_KEY', 'NODE_OPTIONS', 'AGIJOBS_GOV_CONFIG',
                                'GOVERNANCE_ADDRESS', 'PYTHONPATH', 'HTTP_PROXY', 'npm_config_registry']:
                        self.assertNotIn(key, values)
                    self.assertEqual(values['RPC_URL'], 'http://127.0.0.1:18545')
                    self.assertEqual(values['HARDHAT_CONFIG'], str(root / DEMO / 'config/hardhat.local.cjs'))
                    self.assertEqual(values['npm_config_offline'], 'true')
                    self.assertEqual(values['npm_config_userconfig'], '/dev/null')
                    self.assertEqual(values['npm_config_globalconfig'], '/dev/null/cosmic-global.npmrc')
                    self.assertFalse(env_marker.exists())

    @unittest.skipUnless(shutil.which('npm') and shutil.which('node'), 'Installed npm and Node are required')
    def test_explicit_modes_load_npm_config_without_user_or_global_settings(self):
        # Exercise npm's real config loader, which rejects loading /dev/null
        # twice. Config inspection never installs packages or uses the network.
        for entry in ENTRIES:
            for mode in ['offline-fixture', 'local-rehearsal']:
                with self.subTest(entry=entry, mode=mode), tempfile.TemporaryDirectory() as temp:
                    base = Path(temp)
                    root, script, env, _, env_marker = fixture(base, entry)
                    hostile_config = base / 'hostile.npmrc'
                    hostile_config.write_text('registry=https://inherited-config.invalid/\n')
                    (base / '.npmrc').write_text('registry=https://home-config.invalid/\n')
                    (script.parent / 'execution.sh').write_text(
                        'cosmic_execute() {\n'
                        '  cd -- "$1"\n'
                        '  npm --cache "$HOME/npm-cache" --logs-max=0 config list --json\n'
                        '}\n')
                    env.update(PATH=os.environ['PATH'], RPC_URL='http://127.0.0.1:18545',
                               DEMO_PORT='18545', npm_config_userconfig=str(hostile_config),
                               npm_config_globalconfig=str(hostile_config))
                    result = subprocess.run(['/bin/bash', str(script), '--mode', mode],
                                            env=env, capture_output=True, text=True, timeout=10)
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    values = json.loads(result.stdout)
                    self.assertEqual(values['userconfig'], '/dev/null')
                    self.assertEqual(values['globalconfig'], '/dev/null/cosmic-global.npmrc')
                    self.assertTrue(values['offline'])
                    self.assertNotIn('.invalid', values['registry'])
                    self.assertFalse(env_marker.exists())

    def test_external_endpoints_and_invalid_ports_are_rejected_before_children(self):
        for entry in ENTRIES:
            for key, value in [('RPC_URL', 'https://external.invalid'), ('CHAIN_ID', '1'),
                               ('DEMO_NODE_ENGINE', 'anvil'), ('DEMO_PORT', '08545'),
                               ('DEMO_PORT', '8545;touch x'), ('DEMO_PORT', '65536')]:
                with self.subTest(entry=entry, key=key), tempfile.TemporaryDirectory() as temp:
                    root, script, env, marker, _ = fixture(Path(temp), entry)
                    env.pop('RPC_URL')
                    env[key] = value
                    result = subprocess.run(['/bin/bash', str(script), '--mode', 'local-rehearsal'],
                                            env=env, capture_output=True, text=True, timeout=5)
                    self.assertEqual(result.returncode, 2, result.stderr)
                    self.assertFalse(marker.exists())
                    self.assertFalse((root / '.local-demo.lock').exists())

    def test_offline_mode_never_invokes_bootstrap_and_verifier_failure_is_not_success(self):
        import json
        for fail_verify in [False, True]:
            with self.subTest(fail_verify=fail_verify), tempfile.TemporaryDirectory() as temp:
                base = Path(temp)
                root, script, env, _, env_marker = fixture(base, 'flagship-demo.sh')
                aurora = root / 'demo/aurora/bin'
                aurora.mkdir(parents=True)
                for name in ['local-node.sh', 'local-demo-lock.py']:
                    shutil.copyfile(ROOT / 'demo/aurora/bin' / name, aurora / name)
                for name in ['ts-node/dist/bin.js', 'hardhat/internal/cli/cli.js']:
                    target = root / 'node_modules' / name
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_text('inert fixture')
                commands = base / 'commands.jsonl'
                stubs = base / 'stub-tools'
                stubs.mkdir()
                (stubs / 'node').write_text(f'''#!/usr/bin/python3
import json, os, pathlib, sys
args = sys.argv[1:]
with pathlib.Path({str(commands)!r}).open('a') as log:
    log.write(json.dumps({{'args': args, 'skip': os.environ.get('AGIJOBS_FLAGSHIP_SKIP_ONCHAIN')}}) + '\\n')
# The old optional owner matrix reaches prepareDemoOverrides -> bootstrap.
# Treat reaching it (or any direct Hardhat command) as a forbidden deployment.
if any('ownerParameterMatrix' in a or 'hardhat/internal/cli' in a for a in args):
    sys.exit(98)
if any(a.endswith('/verify-flagship-report.mjs') for a in args):
    summary = pathlib.Path({str(root / DEMO / 'logs/flagship-demo/summary.txt')!r})
    assert 'Awaiting Verification' in summary.read_text()
    assert 'Flagship Demo Completed' not in summary.read_text()
    sys.exit(42 if {fail_verify!r} else 0)
''')
                (stubs / 'node').chmod(0o700)
                env.update(PATH=str(stubs) + os.pathsep + os.environ['PATH'],
                           RPC_URL='http://127.0.0.1:18545', DEMO_PORT='18545')
                result = subprocess.run(['/bin/bash', str(script), '--mode', 'offline-fixture'],
                                        env=env, capture_output=True, text=True, timeout=10)
                self.assertEqual(result.returncode, 42 if fail_verify else 0, result.stdout + result.stderr)
                events = [json.loads(line) for line in commands.read_text().splitlines()]
                self.assertEqual(len(events), 2, events)
                self.assertTrue(events[0]['args'][-1].endswith('/agiOperatingSystemDemo.ts'))
                self.assertEqual(events[0]['skip'], 'true')
                self.assertTrue(events[1]['args'][0].endswith('/verify-flagship-report.mjs'))
                summary = (root / DEMO / 'logs/flagship-demo/summary.txt').read_text()
                self.assertEqual('Flagship Demo Completed' in summary, not fail_verify)
                if fail_verify:
                    self.assertIn('verification failed', summary)
                self.assertFalse(env_marker.exists())

    def test_inert_node_batches_lock_configuration_and_cleanup(self):
        import json
        for entry in ENTRIES:
            for failure in ['', 'check', 'start', 'cleanup', 'second-preflight']:
                with self.subTest(entry=entry, failure=failure), tempfile.TemporaryDirectory() as temp:
                    base = Path(temp)
                    root, script, env, _, env_marker = fixture(base, entry)
                    aurora = root / 'demo/aurora/bin'
                    aurora.mkdir(parents=True)
                    for name in ['local-node.sh', 'local-demo-lock.py']:
                        shutil.copyfile(ROOT / 'demo/aurora/bin' / name, aurora / name)
                    for name in ['ts-node/dist/bin.js', 'hardhat/internal/cli/cli.js']:
                        target = root / 'node_modules' / name
                        target.parent.mkdir(parents=True, exist_ok=True)
                        target.write_text('inert fixture')
                    commands = base / 'commands.jsonl'
                    stubs = base / 'stub-tools'
                    stubs.mkdir()
                    shared = f'''#!/usr/bin/python3
import json, os, pathlib, sys
capture = pathlib.Path({str(commands)!r})
args = sys.argv[1:]
with capture.open('a') as log:
    log.write(json.dumps({{'tool': pathlib.Path(sys.argv[0]).name, 'args': args,
                          'config': os.environ.get('HARDHAT_CONFIG'),
                          'network': os.environ.get('HARDHAT_NETWORK'),
                          'secret': os.environ.get('MAINNET_PRIVATE_KEY'),
                          'skip': os.environ.get('AGIJOBS_FLAGSHIP_SKIP_ONCHAIN')}}) + '\\n')
'''
                    (stubs / 'node').write_text(shared + f'''
if {failure!r} == 'second-preflight' and args[0].endswith('local-rpc.cjs'):
    previous = [json.loads(line) for line in capture.read_text().splitlines()]
    if sum(e['args'][0].endswith('local-rpc.cjs') for e in previous) == 2:
        sys.exit(42)
''')
                    (stubs / 'python3').write_text(shared + f'''
if args[0].endswith('local-demo-lock.py'):
    os.execv(sys.executable, [sys.executable, *args])
mode = args[1]
state = pathlib.Path(args[2])
if mode == 'launch':
    (state / 'process.json').write_text('{{}}')
if mode == {failure!r}:
    sys.exit(42)
if mode == 'cleanup':
    (state / 'cleanup.json').write_text('{{"groupClosed":true}}')
''')
                    for stub in stubs.iterdir():
                        stub.chmod(0o700)
                    env.update(PATH=str(stubs) + os.pathsep + os.environ['PATH'],
                               RPC_URL='http://127.0.0.1:18545', DEMO_PORT='18545')
                    result = subprocess.run(['/bin/bash', str(script), '--ci', '--mode', 'local-rehearsal'],
                                            env=env, capture_output=True, text=True, timeout=10)
                    self.assertEqual(result.returncode, 42 if failure else 0, result.stdout + result.stderr)
                    events = [json.loads(line) for line in commands.read_text().splitlines()]
                    self.assertTrue(all(event['secret'] is None for event in events))
                    self.assertTrue((root / '.local-demo.lock').exists())
                    guard = [e for e in events if e['args'][0].endswith('local-node-guard.py')]
                    if failure == 'second-preflight':
                        self.assertEqual(guard, [], events)
                        self.assertFalse(any('--network' in e['args'] and 'localhost' in e['args'] for e in events))
                        self.assertNotEqual(json.loads((root / DEMO / 'logs/run-status.json').read_text())['status'], 'completed')
                        continue
                    self.assertEqual(guard[0]['args'][1], 'launch')
                    self.assertEqual(guard[0]['config'], str(root / DEMO / 'config/hardhat.local.cjs'))
                    self.assertEqual(guard[0]['args'][3:5], ['node', str(root / 'node_modules/hardhat/internal/cli/cli.js')])
                    self.assertEqual(guard[-1]['args'][1], 'cleanup')
                    state = Path(guard[0]['args'][2])
                    if not failure:
                        self.assertEqual([e['args'][1] for e in guard],
                                         ['launch', 'start', 'check', 'check', 'check', 'check', 'cleanup'])
                        batches = [i for i, e in enumerate(events) if
                                   ('--network' in e['args'] and 'localhost' in e['args']) or
                                   any(a.endswith('/export-ledger.ts') for a in e['args'])]
                        self.assertEqual(len(batches), 4)
                        for index in batches:
                            self.assertEqual(events[index - 1]['args'][1], 'check')
                        exports = [events[index] for index in batches if
                                   any(a.endswith('/export-ledger.ts') for a in events[index]['args'])]
                        self.assertEqual(len(exports), 1)
                        self.assertEqual(exports[0]['network'], 'localhost')
                        self.assertEqual(exports[0]['args'], [
                            '-r', str(root / 'node_modules/ts-node/register/transpile-only'),
                            str(root / DEMO / 'scripts/export-ledger.ts'), '--output',
                            str(root / DEMO / 'logs/ledger-latest.json')])
                        if entry == 'flagship-demo.sh':
                            mission = [e for e in events if any(a.endswith('/agiOperatingSystemDemo.ts') for a in e['args'])]
                            self.assertEqual(len(mission), 1)
                            self.assertEqual(mission[0]['skip'], 'true')
                            self.assertTrue(any(any(a.endswith('/verify-flagship-report.mjs') for a in e['args']) for e in events))
                        self.assertEqual(json.loads((root / DEMO / 'logs/run-status.json').read_text())['status'], 'completed')
                    else:
                        self.assertNotEqual(json.loads((root / DEMO / 'logs/run-status.json').read_text())['status'], 'completed')
                        if entry == 'flagship-demo.sh':
                            self.assertNotIn('Flagship Demo Completed', (root / DEMO / 'logs/flagship-demo/summary.txt').read_text())
                    self.assertFalse(env_marker.exists())
                    shutil.rmtree(state)


if __name__ == '__main__':
    unittest.main()
