"""Run the five public module entrypoints with isolated state and hard timeouts."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[3]
CANONICAL = ROOT / 'demo' / 'Kardashev-II Omega-Grade-α-AGI Business-3'
PREFIX = 'demo.kardashev_ii_omega_grade_alpha_agi_business_3'


def main():
    with tempfile.TemporaryDirectory(prefix='agi-business-suite-') as directory:
        output = Path(directory)
        environment = {**os.environ, 'PYTHONPATH': str(ROOT)}
        for family in ('foundation', 'business', 'omega', 'supreme', 'ultra'):
            work = output / family
            work.mkdir()
            if family == 'foundation':
                source = ROOT / 'demo/Kardashev-II-Omega-Grade-Alpha-AGI-Business-3/config/default.json'
                data = json.loads(source.read_text())
                data.update(max_cycles=2, cycle_sleep_seconds=0.01, resume_from_checkpoint=False)
                module, args = PREFIX, ['--config', str(work / 'config.json'), '--no-resume']
            elif family == 'business':
                data = json.loads((CANONICAL / 'config/default.json').read_text())
                data.update(max_cycles=2, cycle_sleep_seconds=0.01, resume_from_checkpoint=False)
                module, args = PREFIX + '_demo', ['--config', str(work / 'config.json'), '--cycles', '2', '--no-resume']
            elif family == 'omega':
                data = json.loads((CANONICAL / (PREFIX.split('.')[-1] + '_demo_omega') / 'config/omega_mission.json').read_text())
                data['orchestrator'].update(max_cycles=2, cycle_sleep_seconds=0.01, resume_from_checkpoint=False)
                module, args = PREFIX + '_demo_omega', ['--config', str(work / 'config.json'), '--cycles', '2', '--duration', '0.2']
            elif family == 'supreme':
                data = {}
                module, args = PREFIX + '_demo_supreme', ['--cycles', '2', '--no-resume', '--validator_commit_delay_seconds', '1', '--validator_reveal_delay_seconds', '1', '--simulation_tick_seconds', '1']
            else:
                data = json.loads((CANONICAL / (PREFIX.split('.')[-1] + '_demo_ultra') / 'config/mission.json').read_text())
                data['orchestrator'].update(max_cycles=2, cycle_sleep_seconds=0.01, resume_from_checkpoint=False)
                module, args = PREFIX + '_demo_ultra', ['launch', '--config', str(work / 'config.json'), '--cycles', '2', '--no-sim']
            (work / 'config.json').write_text(json.dumps(data))
            result = subprocess.run([sys.executable, '-m', module, *args], cwd=work, env=environment, text=True, capture_output=True, timeout=30)
            if result.returncode:
                raise RuntimeError(f'{family} failed:\n{result.stdout[-4000:]}\n{result.stderr[-4000:]}')
            artifacts = [p for p in work.rglob('*') if p.is_file() and p.name != 'config.json']
            if not artifacts:
                raise RuntimeError(f'{family} produced no inspectable artifacts')
            print(f'{family}: PASS, {len(artifacts)} artifacts; isolated state; no live provider or chain')
    print('All five bounded simulation entrypoints passed.')


if __name__ == '__main__':
    main()
