"""Explicit finite Discovery Lab source/package candidate; never a publication profile."""
import argparse
import hashlib
import json
import os
import pathlib
import re
import stat

ROOT = pathlib.Path(__file__).resolve().parents[2]
REPOSITORY = 'MontrealAI/AGIJobsv0'
BASE_COMMIT = '83065adf18a6ee987f8fa479a496a052d35db682'
BASE_TREE = '77ded62b991e8cca28bfd849593153f61ac72d86'
PROFILE = 'discovery-lab-source-candidate-v1'
MANIFEST = 'config/discovery-lab-source-candidate-v1.json'
BASELINE = 'config/discovery-lab-source-baseline-v1.json'
VERIFIER = 'scripts/release/discovery-lab-profile.py'
ALLOWED = {'integrations/alpha-agent/discovery-lab-work-request.test.mjs', 'integrations/alpha-agent/discovery-lab-native-test.mjs', 'integrations/alpha-agent/discovery-lab-work-request.mjs', '.github/workflows/discovery-lab-receiver.yml', 'docs/successor/DISCOVERY_LAB.md', 'scripts/release/test-discovery-lab-profile.py', 'integrations/alpha-agent/fixtures/discovery-lab-request.json', 'integrations/alpha-agent/discovery-lab-contract.mjs', 'config/discovery-lab-alpha-source.json'}
CLAIMS = {'sourcePackageOnly': True, 'releaseQualified': False,
          'releaseIdentity': None, 'publicationApproved': False, 'executionApproved': False}
sha = lambda raw: hashlib.sha256(raw).hexdigest()
same = lambda a,b: json.dumps(a,sort_keys=True,separators=(',',':'),allow_nan=False) == json.dumps(b,sort_keys=True,separators=(',',':'),allow_nan=False)
def require(ok, message):
    if not ok: raise ValueError(message)
def strict_json(raw):
    def pairs(items):
        out = {}
        for key, value in items:
            require(key not in out, 'Duplicate JSON key'); out[key] = value
        return out
    return json.loads(raw, object_pairs_hook=pairs)
def read(root, name):
    require(isinstance(name, str) and name and not name.startswith('/') and
            all(part and part not in ('.', '..') for part in name.split('/')) and '\\' not in name,
            'Unsafe source path')
    path = pathlib.Path(root) / name
    parent = path.parent
    while parent != pathlib.Path(root):
        require(not parent.is_symlink(), 'Symlink source ancestor'); parent = parent.parent
    mode = path.lstat().st_mode
    if stat.S_ISLNK(mode): return '120000', os.readlink(path).encode()
    require(stat.S_ISREG(mode), 'Source must be a regular file or retained symlink')
    return ('100755' if mode & 0o111 else '100644'), path.read_bytes()
def tree_digest(entries):
    root = {}
    for path, item in entries.items():
        require(isinstance(path, str) and path and not path.startswith('/') and '\\' not in path
                and all(part and part not in ('.', '..') for part in path.split('/')), 'Invalid baseline path')
        require(isinstance(item, dict) and set(item) == {'mode', 'blob'}
                and item['mode'] in ('100644', '100755', '120000')
                and isinstance(item['blob'], str) and re.fullmatch('[0-9a-f]{40}', item['blob']), 'Invalid baseline Git entry')
        node = root
        parts = path.split('/')
        for part in parts[:-1]:
            node = node.setdefault(part, {})
            require(isinstance(node, dict) and 'blob' not in node, 'Baseline path collision')
        require(parts[-1] not in node, 'Baseline path collision'); node[parts[-1]] = item
    def encode(node):
        result = b''
        ordered = sorted(node, key=lambda name: name.encode('utf8') + (b'/' if 'blob' not in node[name] else b''))
        for name in ordered:
            item = node[name]; leaf = 'blob' in item
            mode, digest = (item['mode'], item['blob']) if leaf else ('40000', encode(item))
            result += mode.encode() + b' ' + name.encode('utf8') + b'\0' + bytes.fromhex(digest)
        return hashlib.sha1(b'tree ' + str(len(result)).encode() + b'\0' + result).hexdigest()
    return encode(root)
def select(*, manifest_sha256, verifier_sha256, published=False):
    require(not published, 'Discovery Lab candidate cannot qualify publication')
    require(all(isinstance(value, str) and re.fullmatch('[0-9a-f]{64}', value)
                for value in (manifest_sha256, verifier_sha256)), 'Externally reviewed policy pins are required')
    return {'profile': PROFILE, 'manifestSha256': manifest_sha256, 'verifierSha256': verifier_sha256, **CLAIMS}
def inventory(root, selection):
    require(same(selection, select(manifest_sha256=selection.get('manifestSha256'),
            verifier_sha256=selection.get('verifierSha256'))), 'Candidate selection or claims differ')
    require(sha(read(root, VERIFIER)[1]) == selection['verifierSha256'], 'Candidate verifier pin differs')
    manifest_raw = read(root, MANIFEST)[1]
    require(sha(manifest_raw) == selection['manifestSha256'], 'Candidate manifest pin differs')
    manifest = strict_json(manifest_raw)
    require(set(manifest) == {'schema', 'repository', 'profile', 'baseCommit', 'baseTree', 'claims', 'changes'}, 'Candidate fields differ')
    require(manifest['schema'] == 'successor/discovery-lab-source-candidate/v1'
            and manifest['repository'] == REPOSITORY and manifest['profile'] == PROFILE
            and manifest['baseCommit'] == BASE_COMMIT and manifest['baseTree'] == BASE_TREE
            and same(manifest['claims'], CLAIMS), 'Candidate baseline or claims differ')
    baseline = strict_json(read(root, BASELINE)[1])
    require(set(baseline) == {'repository', 'commit', 'tree', 'entries'} and baseline['repository'] == REPOSITORY
            and baseline['commit'] == BASE_COMMIT and baseline['tree'] == BASE_TREE
            and tree_digest(baseline['entries']) == BASE_TREE, 'Immutable baseline inventory differs')
    changes = manifest['changes']
    require(isinstance(changes, dict) and set(changes) == ALLOWED, 'Candidate differs from explicit reviewed paths')
    expected = {name: dict(item) for name, item in baseline['entries'].items()}
    for name, item in changes.items():
        require(name not in expected and isinstance(item, dict) and set(item) == {'before', 'after', 'reason'}
                and item['before'] is None and isinstance(item['reason'], str) and item['reason'].strip(), 'Only attributed additive source is admitted')
        after = item['after']
        require(isinstance(after, dict) and set(after) == {'mode', 'sha256'} and after['mode'] == '100644'
                and isinstance(after['sha256'], str) and re.fullmatch('[0-9a-f]{64}', after['sha256']), 'Candidate added input identity differs')
        expected[name] = dict(after)
    expected[MANIFEST] = {'mode': '100644', 'sha256': selection['manifestSha256']}
    expected[VERIFIER] = {'mode': '100644', 'sha256': selection['verifierSha256']}
    expected[BASELINE] = {'mode': '100644', 'sha256': sha(read(root, BASELINE)[1])}
    return expected
def validate_source(root, selection, paths=None):
    root = pathlib.Path(root).resolve(); expected = inventory(root, selection)
    actual = set(paths) if paths is not None else {p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file() or p.is_symlink()}
    require(actual == set(expected), 'Source inventory has missing or unexpected inputs')
    for name, item in expected.items():
        mode, raw = read(root, name)
        require(mode == item['mode'], 'Source mode differs: ' + name)
        digest = sha(raw) if 'sha256' in item else hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
        require(digest == item.get('sha256', item.get('blob')), 'Source bytes differ: ' + name)
    return {'profile': PROFILE, 'repository': REPOSITORY, 'baseCommit': BASE_COMMIT,
            'baseTree': BASE_TREE, 'inputCount': len(expected), **CLAIMS}
if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=pathlib.Path, default=ROOT)
    parser.add_argument('--manifest-sha256', required=True)
    parser.add_argument('--verifier-sha256', required=True)
    args = parser.parse_args()
    print(json.dumps(validate_source(args.root, select(manifest_sha256=args.manifest_sha256,
            verifier_sha256=args.verifier_sha256))))
