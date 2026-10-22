# SPDX-License-Identifier: MIT
"""Standalone inactive Jobs archive installer; requires only Python's standard library.

Authenticate this installer against independently qualified software provenance before use.
No archive member is executed. Archive and installed-manifest hashes are explicit inputs.
"""
import argparse
import gzip
import hashlib
import io
import json
import os
import pathlib
import re
import shutil
import stat
import tarfile

MAX_FILE = 2_000_000
MAX_TOTAL = 16_000_000
MAX_ARCHIVE = 20_000_000
INSTALLED_MANIFEST = 'INSTALLED_SOURCE.json'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def safe_path(name):
    return isinstance(name, str) and 0 < len(name) <= 4096 and not name.startswith('/') and '\\' not in name and all(
        part and part not in ('.', '..', '.git') for part in name.split('/')) and len(name.split('/')) <= 32 and not any(
        ord(c) < 32 for c in name)


def strict_json(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'Duplicate installed JSON key')
            result[key] = value
        return result
    def constant(value):
        raise ValueError('Nonfinite installed JSON value: '+value)
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=constant)


def bounded_archive(filename):
    fd = os.open(filename, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and before.st_size <= MAX_ARCHIVE, 'Bounded regular archive is required')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            raw = stream.read(before.st_size+1)
        after = os.fstat(fd)
        require(len(raw) == before.st_size and all(getattr(before, key) == getattr(after, key) for key in
                ('st_dev', 'st_ino', 'st_mode', 'st_size', 'st_mtime_ns', 'st_ctime_ns')), 'Archive changed during capture')
        current = filename.lstat()
        require(current.st_dev == before.st_dev and current.st_ino == before.st_ino and current.st_mode == before.st_mode,
                'Archive path changed during capture')
        return raw
    finally:
        os.close(fd)


def install_archive(archive_path, archive_sha256, manifest_sha256, destination):
    archive_path = pathlib.Path(os.path.abspath(archive_path))
    destination = pathlib.Path(os.path.abspath(destination))
    require(archive_path.parent.resolve() == archive_path.parent, 'Archive parent must be a direct directory')
    require(destination.parent.is_dir() and destination.parent.resolve() == destination.parent,
            'Installation parent must be an existing direct directory')
    require(all(isinstance(value, str) and re.fullmatch('[a-f0-9]{64}', value)
                    for value in (archive_sha256, manifest_sha256)), 'Independent archive and manifest hashes are required')
    require(not os.path.lexists(destination), 'Installation destination must be absent')
    archive_raw = bounded_archive(archive_path)
    require(sha(archive_raw) == archive_sha256, 'Installed archive SHA-256 differs')
    captured, modes, total = {}, {}, 0
    with gzip.GzipFile(fileobj=io.BytesIO(archive_raw), mode='rb') as compressed:
        plain = compressed.read(MAX_TOTAL+1_000_001)
    require(len(plain) <= MAX_TOTAL+1_000_000, 'Installed archive decompression exceeds bound')
    with tarfile.open(fileobj=io.BytesIO(plain), mode='r:') as archive:
        for item in archive:
            require(safe_path(item.name) and item.isfile() and item.mode in (0o644, 0o755)
                         and 0 <= item.size <= MAX_FILE and item.name not in captured and item.name != 'INSTALLATION_CUSTODY.json' and len(captured) < 256,
                         'Unsupported, duplicate or unbounded installed archive member')
            total += item.size
            require(total <= MAX_TOTAL, 'Installed archive expands beyond bound')
            raw = archive.extractfile(item).read(MAX_FILE+1)
            require(len(raw) == item.size, 'Installed archive member length differs')
            captured[item.name], modes[item.name] = raw, '100755' if item.mode == 0o755 else '100644'
    raw = captured.get(INSTALLED_MANIFEST, b'')
    require(sha(raw) == manifest_sha256, 'Installed manifest SHA-256 differs')
    manifest = strict_json(raw)
    require(manifest.get('schema') == 'agijobsv0/discovery-installed/v1'
                 and manifest.get('authority') == 'none' and manifest.get('currencyCapBaseUnits') == '0'
                 and manifest.get('externalExecution') == 'unprovisioned'
                 and manifest.get('productionQualified') is False, 'Installed manifest scope differs')
    files = manifest['files']
    require(set(captured) == set(files) | {INSTALLED_MANIFEST}, 'Installed manifest does not cover every member')
    for name, record in files.items():
        require(safe_path(name) and record == {'sha256': sha(captured[name]),
                     'bytes': len(captured[name]), 'mode': modes[name]}, 'Installed member differs from selected manifest')
    custody = {'schema': 'agijobsv0/discovery-installed-extraction/v1', 'archiveSha256': archive_sha256,
               'archiveBytes': len(archive_raw), 'installedManifestSha256': manifest_sha256,
               'authority': 'none', 'state': 'EXTRACTED_INACTIVE_LOCAL_REVIEW_ONLY'}
    destination.mkdir(mode=0o700)
    try:
        for name, raw in captured.items():
            target = destination/name
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            with target.open('xb') as output:
                output.write(raw)
            target.chmod(0o755 if modes[name] == '100755' else 0o644)
        with (destination/'INSTALLATION_CUSTODY.json').open('x') as output:
            output.write(json.dumps(custody, indent=2)+'\n')
    except BaseException:
        shutil.rmtree(destination)
        raise
    return {**custody, 'path': str(destination), 'files': len(captured)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=pathlib.Path, required=True)
    parser.add_argument('--sha256', required=True)
    parser.add_argument('--manifest-sha256', required=True)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    print(json.dumps(install_archive(args.archive, args.sha256, args.manifest_sha256, args.output), sort_keys=True))
