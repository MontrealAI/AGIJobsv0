"""Run every preserved Python CLI in a disposable copy, never in tracked fixtures."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True, help='New evidence directory')
    args = parser.parse_args()
    destination = args.out.resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.mkdir(mode=0o700)
    records = []
    with tempfile.TemporaryDirectory(prefix='meta-alpha-') as temporary:
        base = Path(temporary) / ROOT.name
        shutil.copytree(ROOT, base, ignore=shutil.ignore_patterns('__pycache__', 'node_modules', 'runtime', 'snapshots.json'))
        env = {key: os.environ[key] for key in ('PATH', 'SYSTEMROOT', 'TMPDIR', 'TEMP', 'TMP') if key in os.environ}
        env.update(PYTHONPATH=str(REPO), PYTEST_DISABLE_PLUGIN_AUTOLOAD='1', ORCHESTRATOR_BRIDGE_MODE='python', ORCHESTRATOR_SYNC_RUNS='1')
        snapshots = {}
        for version in range(1, 12):
            script = 'meta_agentic_demo.py' if version == 1 else f'meta_agentic_demo_v{version}.py'
            result = subprocess.run([sys.executable, str(base / script), '--timeout', '60'], cwd=base, env=env, capture_output=True, text=True, timeout=90)
            (destination / f'v{version}.log').write_text(result.stdout + result.stderr, encoding='utf-8')
            if result.returncode:
                raise RuntimeError(f'V{version} failed; inspect {destination / f"v{version}.log"}')
            if version == 1:
                source = base / 'storage/runtime/latest_run.json'
            elif version == 2:
                source = base / 'storage/latest_run_v2.json'
            elif version in (3, 4):
                name = 'dashboard-data.json' if version == 3 else 'dashboard-data-v4.json'
                source = base / f'storage/ui/v{version}' / name
            else:
                source = base / f'meta_agentic_alpha_v{version}/ui/dashboard-data-v{version}.json'
            payload = json.loads(source.read_text(encoding='utf-8'))
            if version <= 4 and payload.get('state') != 'succeeded':
                raise RuntimeError(f'V{version} did not succeed')
            payload['evidenceBoundary'] = {'class': 'recorded-synthetic-rehearsal', 'productionApproved': False, 'settlementApproved': False, 'providerExecution': 'not assessed'}
            snapshots[f'v{version}'] = payload
            records.append({'variant': f'v{version}', 'exitCode': result.returncode, 'source': str(source.relative_to(base)), 'sha256': hashlib.sha256(source.read_bytes()).hexdigest()})
            if version in (2, 3, 4):
                cli_payload = json.loads(result.stdout)
                report = Path(cli_payload['report'])
                (destination / f'v{version}.md').write_text(report.read_text(encoding='utf-8').replace(str(base), 'RECORDED_FIXTURE_ROOT'), encoding='utf-8')
        prime = base / 'meta_agentic_alpha_prime_demo/run_prime_demo.py'
        result = subprocess.run([sys.executable, str(prime), '--report', str(destination / 'prime.json'), '--dashboard', str(destination / 'prime.html')], cwd=base, env=env, capture_output=True, text=True, timeout=90)
        (destination / 'prime.log').write_text(result.stdout + result.stderr, encoding='utf-8')
        if result.returncode:
            raise RuntimeError('Prime demonstration failed')
        records.append({'variant': 'prime', 'exitCode': 0})
        serialized = json.dumps(snapshots, indent=2, ensure_ascii=False).replace(str(base), 'RECORDED_FIXTURE_ROOT')
        (destination / 'snapshots.json').write_text(serialized + '\n', encoding='utf-8')
    (destination / 'rehearsal.json').write_text(json.dumps({'variants': records, 'productionApproved': False, 'settlementApproved': False}, indent=2) + '\n', encoding='utf-8')
    print(f'All twelve Python CLIs passed. Evidence: {destination}')

if __name__ == '__main__':
    main()
