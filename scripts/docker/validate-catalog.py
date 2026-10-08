#!/usr/bin/env python3
"""Fail when an image or Compose build context falls outside container CI."""
import json
import os
from pathlib import Path
import subprocess
import shutil
import sys
import tempfile

import yaml

ROOT = Path(__file__).resolve().parents[2]
os.chdir(ROOT)
catalog = json.loads(Path('scripts/docker/container-catalog.json').read_text())
entries = catalog['primary'] + catalog['auxiliary']
files = subprocess.check_output(['git', 'ls-files', '-co', '--exclude-standard'], text=True).splitlines()
dockerfiles = {p for p in files if 'Dockerfile' in Path(p).name}
assert {e['file'] for e in entries} == dockerfiles, 'Every Dockerfile needs exactly one catalog entry'
assert len(entries) == len(dockerfiles), 'Duplicate Dockerfile in catalog'
assert len({e['name'] for e in entries}) == len(entries), 'Duplicate image name'
for item in entries:
    assert Path(item['context']).is_dir(), f"Missing context: {item}"
    assert Path(item['file']).is_file(), f"Missing Dockerfile: {item}"
workflow = yaml.safe_load(Path('.github/workflows/containers.yml').read_text())
assert workflow['jobs']['build-native']['strategy']['matrix']['image'] == catalog['primary'], 'Published matrix differs from catalog'
compose = [p for p in files if 'compose' in Path(p).name and Path(p).suffix in {'.yml', '.yaml'}]
for name in compose:
    spec = yaml.safe_load(Path(name).read_text())
    for service, config in spec.get('services', {}).items():
        build = config.get('build')
        if not build:
            continue
        build = {'context': build} if isinstance(build, str) else build
        context = (Path(name).parent / build.get('context', '.')).resolve()
        dockerfile = (context / build.get('dockerfile', 'Dockerfile')).resolve()
        assert context.is_dir(), f'{name}:{service}: missing build context {context}'
        assert dockerfile.is_file(), f'{name}:{service}: missing Dockerfile {dockerfile}'
        rel = str(dockerfile.relative_to(ROOT))
        entry = next(e for e in entries if e['file'] == rel)
        assert (ROOT / entry['context']).resolve() == context, f'{name}:{service}: context differs from tested catalog'
if '--compose' in sys.argv:
    # Only materialise public example values for `config --quiet`; no container
    # is launched and no production credential is requested or written.
    root_env = ROOT / 'deployment-config/oneclick.env'
    created = not root_env.exists()
    try:
        if created:
            shutil.copyfile(ROOT / 'deployment-config/oneclick.env.example', root_env)
        with tempfile.TemporaryDirectory(prefix='agi-compose-') as directory:
            culture_env = Path(directory) / 'culture.env'
            culture_env.write_text('')
            environment = {
                **os.environ,
                'CULTURE_ENV_FILE': str(culture_env),
                'AGENT_REGISTRY_URL': 'http://registry.invalid/agents',
                'AGENT_REGISTRY_OWNER_TOKEN': 'local-config-validation-only',
                'AGENT_HEARTBEAT_SECRET': 'local-config-validation-only',
                'ALPHA_NODE_PRIVATE_KEY': 'local-config-validation-only',
            }
            for name in compose:
                subprocess.run(['docker', 'compose', '--env-file', str(root_env), '-f', name, '--profile', '*', 'config', '--quiet'], env=environment, check=True)
    finally:
        if created:
            root_env.unlink(missing_ok=True)
print(f'Validated {len(entries)} Dockerfiles and {len(compose)} Compose files.')
if os.environ.get('GITHUB_OUTPUT'):
    with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
        output.write('auxiliary=' + json.dumps(catalog['auxiliary'], separators=(',', ':')) + '\n')
