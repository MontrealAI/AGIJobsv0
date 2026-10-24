# SPDX-License-Identifier: MIT
"""Build source-bound installed bytes or an explicitly inert unset-pin preparation."""
import argparse
import gzip
import hashlib
import io
import json
import pathlib
import os
import shutil
import subprocess
import runpy
import tarfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
P = runpy.run_path(str(ROOT / 'scripts/release/discovery-installed-profile.py'))
FILES = ('LICENSE', 'integrations/alpha-agent/discovery-lab-contract.mjs',
         'integrations/alpha-agent/discovery-lab-work-request.mjs',
         'integrations/alpha-agent/discovery-installed-native.mjs',
         'integrations/alpha-agent/discovery-installed-module-graph.mjs',
         'integrations/alpha-agent/discovery-installed-module-graph-runtime.mjs',
         'integrations/alpha-agent/discovery-installed-runtime.mjs',
         'integrations/alpha-agent/discovery-installed-operator.mjs',
         'integrations/alpha-agent/vendor/alpha/LICENSE',
         'integrations/alpha-agent/DISCOVERY_MODULE_BOUNDARY_NOTICE.txt',
         'config/discovery-installed-module-graph-origin-v1.json',
         'config/discovery-installed-alpha-v1.json')


def build_preparation(root, selection, destination):
    root, destination = pathlib.Path(root).resolve(), pathlib.Path(destination).resolve()
    P['require'](not destination.is_relative_to(root), 'Package output must be outside source inputs')
    status = P['readiness'](root, selection)
    P['require'](status['alphaPin'] == 'UNSET', 'Preparation capsule is only for the immutable unset-pin phase')
    expected = P['inventory'](root, selection)
    captured = {}
    for name in FILES:
        mode, raw = P['read'](root, name)
        item = expected[name]
        P['require'](mode == item['mode'] and (P['sha'](raw) if 'sha256' in item else P['blob'](raw))
                     == item.get('sha256', item.get('blob')), 'Package capture differs from selected source: ' + name)
        captured[name] = raw
    manifest = {'schema': 'agijobsv0/discovery-operator-preparation/v1',
                'state': 'NOT_RUN_ALPHA_PIN_UNSET', 'profile': P['PROFILE'],
                'proposedVersion': P['PROPOSED_VERSION'], 'versionReservation': 'UNRESERVED_PROPOSAL',
                'selection': selection, 'sourceStatus': status,
                'files': {name: {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
                          for name, raw in captured.items()},
                'licenses': {'integrations/alpha-agent/discovery-installed-module-graph.mjs': {
                    'spdx': 'Apache-2.0',
                    'licenseText': 'integrations/alpha-agent/vendor/alpha/LICENSE',
                    'notice': 'integrations/alpha-agent/DISCOVERY_MODULE_BOUNDARY_NOTICE.txt',
                    'origin': 'config/discovery-installed-module-graph-origin-v1.json'}},
                'notRunnableWithoutReviewedInstalledManifest': True,
                'nativeQualification': 'NOT_RUN', 'currency': 'AGIALPHA', 'currencyCapBaseUnits': '0',
                'authority': 'none', 'publicationApproved': False, 'executionApproved': False,
                'settlementApproved': False}
    captured['OPERATOR_PREPARATION.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    captured['README.txt'] = (
        'Jobs Discovery operator PREPARATION ONLY. No native acceptance or release approval.\n'
        'Verify this capsule SHA-256 and its manifest against separately selected provenance before using code.\n'
        'This is inert source preparation, without an installed manifest or Alpha runtime.\n'
        'Use the separate build command after the reviewed Alpha pin transition and complete source proof.\n'
        'The status remains NOT_RUN while the final reviewed Alpha pin is unset. No request may select code.\n'
        'Submission, currency transfers, settlement and external execution remain unavailable.\n').encode()
    P['require'](sum(len(raw) for raw in captured.values()) <= 2_000_000, 'Operator preparation exceeds its finite byte cap')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open('xb') as output, gzip.GzipFile(fileobj=output, mode='wb', filename='', mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w') as archive:
            for name, raw in sorted(captured.items()):
                member = tarfile.TarInfo(name)
                member.size, member.mode, member.mtime = len(raw), 0o644, 0
                member.uid = member.gid = 0
                archive.addfile(member, io.BytesIO(raw))
    raw = destination.read_bytes()
    return {'schema': manifest['schema'], 'state': manifest['state'], 'path': str(destination),
            'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
            'members': len(captured), 'holds': status['holds'], 'authority': 'none'}


MAX_FILE = 2_000_000
MAX_TOTAL = 16_000_000
MAX_ARCHIVE = 20_000_000
INSTALLED_MANIFEST = 'INSTALLED_SOURCE.json'
CATALOG = 'docs/successor/capabilities/sources.json'
INSPECTOR = 'examples/successor-capability/discovery-lab-inspector.mjs'
RUNTIME_FILES = tuple(dict.fromkeys((*FILES,
    'integrations/alpha-agent/discovery-installed-runtime.mjs',
    'integrations/alpha-agent/discovery-installed-module-graph-runtime.mjs',
    'config/discovery-installed-alpha-transition-v1.json',
    'scripts/release/install-discovery-installed.py',
    P['MANIFEST'], P['VERIFIER'], P['SCOPE_VERIFIER'], P['BASELINE'], P['PREREQUISITE_MANIFEST'], P['OWNER_REVIEW'])))


def git_environment():
    env = {key: value for key, value in os.environ.items() if not key.startswith('GIT_')}
    env.update(GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_SYSTEM=os.devnull, GIT_CONFIG_GLOBAL=os.devnull,
               GIT_NO_REPLACE_OBJECTS='1', GIT_NO_LAZY_FETCH='1', GIT_OPTIONAL_LOCKS='0',
               GIT_ALLOW_PROTOCOL='', GIT_PROTOCOL_FROM_USER='0', GIT_TERMINAL_PROMPT='0', GIT_ATTR_NOSYSTEM='1')
    return env


def alpha_git(root, *args):
    return subprocess.check_output(['git', '--no-replace-objects', '--no-pager', '-C', str(root),
        '-c', 'protocol.allow=never', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath='+os.devnull,
        '-c', 'core.attributesFile='+os.devnull, *args], env=git_environment(), stderr=subprocess.PIPE, timeout=30)


def validate_alpha_catalog(catalog, pin):
    expected = 53 if all(pin.get(key) == value for key, value in P['ALPHA_141_TARGET'].items()) else 41
    P['require'](set(catalog) == {'schema', 'sourceHash', 'sources'}
                 and catalog['schema'] == 'successor-capability-source/v1'
                 and isinstance(catalog['sources'], dict) and len(catalog['sources']) == expected
                 and catalog['sourceHash'] == pin['sourceHash']
                 and P['sha'](json.dumps(catalog['sources'], sort_keys=True, separators=(',', ':')).encode()) == pin['sourceHash'],
                 'Complete reviewed Alpha catalog identity differs')


def capture_alpha(root, pin, *, helper_source):
    root = P['guard_git_metadata'](pathlib.Path(root).resolve())
    P['require'](pathlib.Path(alpha_git(root, 'rev-parse', '--show-toplevel').decode().strip()).resolve() == root,
                 'Alpha must be an independent actual Git root')
    P['require'](alpha_git(root, 'rev-parse', 'HEAD').decode().strip() == pin['commit']
                 and alpha_git(root, 'rev-parse', 'HEAD^{tree}').decode().strip() == pin['tree'], 'Alpha Git source differs')
    P['require'](not alpha_git(root, 'for-each-ref', '--format=%(refname)', 'refs/replace').strip(), 'Alpha replacements are unsupported')
    P['require'](not (root/'.git/info/grafts').exists(), 'Alpha grafted ancestry is unsupported')
    captured = {}
    bindings = {CATALOG: {'sha256': pin['catalogSha256'], 'mode': pin['catalogMode']},
                **{name: {'sha256': digest, 'mode': pin['fileModes'][name]} for name, digest in pin['files'].items()}}
    for name, item in bindings.items():
        mode, raw = P['read'](root, name)
        P['require'](mode in ('100644', '100755') and len(raw) <= MAX_FILE and mode == item['mode']
                     and P['sha'](raw) == item['sha256'], 'Frozen Alpha source bytes or mode differ: '+name)
        entry = alpha_git(root, 'ls-tree', '-z', 'HEAD', '--', name).decode().rstrip('\0')
        metadata, actual_name = entry.split('\t', 1)
        actual_mode, kind, digest = metadata.split()
        P['require'](actual_name == name and kind == 'blob' and actual_mode == mode and digest == P['blob'](raw),
                     'Frozen Alpha raw blob differs from the actual Git tree: '+name)
        captured[name] = (raw, mode)
    catalog = P['strict_json'](captured[CATALOG][0])
    validate_alpha_catalog(catalog, pin)
    P['require'](set(pin['files']) == set(catalog['sources']) | {INSPECTOR, 'LICENSE'}, 'Frozen Alpha raw closure differs')
    for name, digest in catalog['sources'].items():
        P['require'](pin['files'][name] == digest, 'Frozen Alpha catalog input differs')
    records = [{'name': name, 'source': raw.decode()} for name, (raw, _) in captured.items() if name.endswith('.mjs')]
    node = shutil.which('node')
    P['require'](node is not None, 'An existing Node runtime is required for parse-only closure inspection')
    result = subprocess.run([node, '--no-warnings', '--max-old-space-size=128', '--experimental-vm-modules',
                             '--input-type=module', '--eval', helper_source.decode(), '--', '--parse-module-map'],
        input=json.dumps(records).encode(), capture_output=True, timeout=5,
        env={**os.environ, 'NODE_OPTIONS': '', 'NODE_PATH': ''}, check=True)
    P['require'](len(result.stdout) <= 1_000_000 and len(result.stderr) <= 1_000_000, 'Parser output exceeds bound')
    names = {item['name'] for item in records}
    import posixpath
    for record in P['strict_json'](result.stdout):
        for target in record['requests']:
            P['require'](target.startswith(('./', '../')) and not any(c in target for c in '?%#\\'),
                         'Only captured relative Alpha imports are admitted')
            resolved = posixpath.normpath(posixpath.join(posixpath.dirname(record['name']), target))
            P['require'](resolved in names, 'Static Alpha dependency is absent from the raw captured module map')
    P['require'](sum(len(raw) for raw, _ in captured.values()) <= MAX_TOTAL, 'Alpha captured source exceeds byte cap')
    return captured


def write_archive(destination, captured, manifest):
    destination = pathlib.Path(destination).resolve()
    P['require'](not destination.exists(), 'Archive output must be absent')
    captured = dict(captured)
    manifest_raw = (json.dumps(manifest, sort_keys=True, separators=(',', ':'), ensure_ascii=False)+'\n').encode()
    P['require'](len(manifest_raw) <= MAX_FILE, 'Installed manifest exceeds bound')
    captured[INSTALLED_MANIFEST] = (manifest_raw, '100644')
    P['require'](len(captured) <= 256 and sum(len(raw) for raw, _ in captured.values()) <= MAX_TOTAL,
                 'Installed capsule exceeds its finite bound')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open('xb') as output, gzip.GzipFile(fileobj=output, mode='wb', filename='', mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w') as archive:
            for name, (raw, mode) in sorted(captured.items()):
                P['require'](P['safe_path'](name) and mode in ('100644', '100755') and len(raw) <= MAX_FILE,
                             'Installed archive input differs')
                item = tarfile.TarInfo(name)
                item.size, item.mode, item.mtime = len(raw), 0o755 if mode == '100755' else 0o644, 0
                item.uid = item.gid = 0
                archive.addfile(item, io.BytesIO(raw))
    return {'archiveSha256': P['sha'](destination.read_bytes()), 'archiveBytes': destination.stat().st_size,
            'installedManifestSha256': P['sha'](manifest_raw), 'members': len(captured), 'path': str(destination)}


def build(root, selection, destination, *, alpha_root):
    root, destination, alpha_root = pathlib.Path(root).resolve(), pathlib.Path(destination).resolve(), pathlib.Path(alpha_root).resolve()
    P['require'](not destination.is_relative_to(root) and not destination.is_relative_to(alpha_root),
                 'Archive output must be outside both raw source checkouts')
    source = P['readiness'](root, selection, require_git=True)
    pin = P['alpha_state'](root)
    P['require'](pin['status'] == 'REVIEWED_FINAL_SOURCE', 'Final reviewed Alpha pin is unset; installed archive build is NOT_RUN')
    expected, captured = P['inventory'](root, selection), {}
    for name in RUNTIME_FILES:
        mode, raw = P['read'](root, name)
        item = expected[name]
        P['require'](mode == item['mode'] and (P['sha'](raw) if 'sha256' in item else P['blob'](raw))
                     == item.get('sha256', item.get('blob')), 'Installed Jobs source capture differs: '+name)
        captured[name] = (raw, mode)
    alpha = capture_alpha(alpha_root, pin, helper_source=captured['integrations/alpha-agent/discovery-installed-module-graph.mjs'][0])
    captured.update({'alpha/'+name: item for name, item in alpha.items()})
    P['require'](P['sha'](captured['integrations/alpha-agent/discovery-lab-contract.mjs'][0])
                 == P['sha'](alpha['examples/successor-capability/discovery-lab-contract.mjs'][0]), 'Installed shared contracts differ')
    proof = {'schema': 'agijobsv0/discovery-installed-producer-source/v1', 'source': source, 'selection': selection,
             'scope': 'Complete Jobs source raw-byte/Git/index/ancestry proof before capturing this installed subset; no execution or publication approval.'}
    captured['PRODUCER_SOURCE_PROOF.json'] = ((json.dumps(proof, indent=2)+'\n').encode(), '100644')
    captured['README.txt'] = (('Jobs standalone Discovery local review. Verify the archive SHA-256, byte count and installed manifest SHA-256\n'
        'from independently selected, qualified producer provenance before installing or running code.\n'
        'Install using the separately authenticated install-discovery-installed.py --archive ARCHIVE --sha256 ARCHIVE_SHA\n'
        '  --manifest-sha256 INSTALLED_MANIFEST_SHA --output ABSENT_DIRECTORY\n'
        'Run: node integrations/alpha-agent/discovery-installed-operator.mjs status ABSOLUTE_ROOT INSTALLED_MANIFEST_SHA ARCHIVE_SHA ARCHIVE_BYTES\n'
        'Inspect: node integrations/alpha-agent/discovery-installed-operator.mjs inspect ABSOLUTE_ROOT INSTALLED_MANIFEST_SHA ARCHIVE_SHA ARCHIVE_BYTES\n'
        '  WORKSPACE_JSON REQUEST_TEXT ABSENT_OUTPUT_JSON\n'
        'Select the archive hash and byte count from authenticated original producer provenance, never from extracted INSTALLATION_CUSTODY.json.\n'
        'No source checkout, Git, npm install, network, wallet, money, settlement or external execution is used by installed inspection.\n'
        'The actual local Alpha checker returns a receipt into the original mission and canonical docket.\n').encode(), '100644')
    jobs = {'commit': source['sourceCommit'], 'tree': source['sourceTree'],
            'adapterSha256': P['sha'](captured['integrations/alpha-agent/discovery-lab-work-request.mjs'][0]),
            'contractSha256': P['sha'](captured['integrations/alpha-agent/discovery-lab-contract.mjs'][0])}
    manifest = {'schema': 'agijobsv0/discovery-installed/v1', 'profile': P['PROFILE'], 'version': P['PROPOSED_VERSION'],
                'jobs': jobs, 'alpha': {**pin, 'inspectorSha256': pin['files'][INSPECTOR]},
                'sourceSelection': selection, 'sourceProof': 'PRODUCER_SOURCE_PROOF.json',
                'files': {name: {'sha256': P['sha'](raw), 'bytes': len(raw), 'mode': mode}
                          for name, (raw, mode) in sorted(captured.items())},
                'licenses': {'jobs': 'LICENSE', 'alpha': 'alpha/LICENSE',
                    'moduleBoundary': {'license': 'integrations/alpha-agent/vendor/alpha/LICENSE',
                      'notice': 'integrations/alpha-agent/DISCOVERY_MODULE_BOUNDARY_NOTICE.txt',
                      'origin': 'config/discovery-installed-module-graph-origin-v1.json'}},
                'authority': 'none', 'currencyCapBaseUnits': '0', 'externalExecution': 'unprovisioned',
                'productionQualified': False, 'qualification': 'PENDING_EXTRACTED_NATIVE_AND_HOSTED_GATES'}
    installer_name = 'install-discovery-installed.py'
    installer_path = destination.parent/installer_name
    custody_path = pathlib.Path(str(destination)+'.custody.json')
    P['require'](destination != installer_path and not installer_path.exists() and not custody_path.exists(),
                 'Producer installer and custody outputs must be absent')
    result = write_archive(destination, captured, manifest)
    installer_raw = captured['scripts/release/install-discovery-installed.py'][0]
    with installer_path.open('xb') as output:
        output.write(installer_raw)
    custody = {'schema': 'agijobsv0/discovery-installed-capsule-custody/v1', **result,
               'jobsCommit': jobs['commit'], 'jobsTree': jobs['tree'],
               'alphaCommit': pin['commit'], 'alphaTree': pin['tree'], 'sourceHash': pin['sourceHash'],
               'jobs': jobs, 'alpha': {'commit': pin['commit'], 'tree': pin['tree'], 'sourceHash': pin['sourceHash']},
               'installer': {'path': installer_name, 'sha256': P['sha'](installer_raw), 'bytes': len(installer_raw),
                             'sourcePath': 'scripts/release/install-discovery-installed.py'},
               'authority': 'none', 'productionQualified': False}
    with custody_path.open('x') as output:
        output.write(json.dumps(custody, indent=2)+'\n')
    return custody


# Compatibility entrypoint; publication uses these same standalone installer bytes.
install_archive = runpy.run_path(str(ROOT/'scripts/release/install-discovery-installed.py'))['install_archive']


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    for name in ('prepare', 'build'):
        item = commands.add_parser(name)
        item.add_argument('--root', type=pathlib.Path, default=ROOT)
        item.add_argument('--manifest-sha256', required=True)
        item.add_argument('--verifier-sha256', required=True)
        item.add_argument('--scope-verifier-sha256', required=True)
        item.add_argument('--output', type=pathlib.Path, required=True)
        if name == 'build':
            item.add_argument('--alpha-root', type=pathlib.Path, required=True)
    item = commands.add_parser('install')
    item.add_argument('--archive', type=pathlib.Path, required=True)
    item.add_argument('--sha256', required=True)
    item.add_argument('--manifest-sha256', required=True)
    item.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    if args.command == 'install':
        result = install_archive(args.archive, args.sha256, args.manifest_sha256, args.output)
    else:
        selection = P['select'](manifest_sha256=args.manifest_sha256, verifier_sha256=args.verifier_sha256,
                                 scope_verifier_sha256=args.scope_verifier_sha256)
        if args.command == 'prepare':
            result = build_preparation(args.root, selection, args.output)
        else:
            result = build(args.root, selection, args.output, alpha_root=args.alpha_root)
    print(json.dumps(result, sort_keys=True))
