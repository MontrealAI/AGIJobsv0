# SPDX-License-Identifier: MIT
"""Inert archive and pin framing tests; no supplied module is evaluated."""
import gzip
import hashlib
import io
import json
import pathlib
import runpy
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[2]
B = runpy.run_path(str(ROOT/'scripts/release/discovery-installed-package.py'))
P = runpy.run_path(str(ROOT/'scripts/release/discovery-installed-profile.py'))


class StandaloneArchive(unittest.TestCase):
    def manifest(self, captured):
        return {'schema': 'agijobsv0/discovery-installed/v1', 'profile': 'jobs-discovery-installed-v1',
                'scope': 'INERT_TEST_DATA_NOT_A_NATIVE_OR_QUALIFIED_PACKAGE',
                'files': {name: {'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw), 'mode': mode}
                          for name, (raw, mode) in captured.items()},
                'authority': 'none', 'currencyCapBaseUnits': '0', 'externalExecution': 'unprovisioned',
                'productionQualified': False}

    def test_same_saved_archive_installs_without_a_source_checkout(self):
        captured = {'inert.txt': (b'Ordinary package framing fixture.\n', '100644')}
        with tempfile.TemporaryDirectory(prefix='jobs-inert-archive-', dir='/dev/shm') as folder:
            root = pathlib.Path(folder)
            one = B['write_archive'](root/'one.tar.gz', captured, self.manifest(captured))
            two = B['write_archive'](root/'two.tar.gz', captured, self.manifest(captured))
            self.assertEqual(one['archiveSha256'], two['archiveSha256'])
            result = B['install_archive'](root/'one.tar.gz', one['archiveSha256'], one['installedManifestSha256'], root/'installed')
            self.assertEqual((root/'installed/inert.txt').read_bytes(), captured['inert.txt'][0])
            self.assertEqual(result['state'], 'EXTRACTED_INACTIVE_LOCAL_REVIEW_ONLY')
            self.assertEqual(result['authority'], 'none')
            self.assertEqual(json.loads((root/'installed/INSTALLATION_CUSTODY.json').read_bytes())['archiveSha256'],
                             one['archiveSha256'])

    def test_independent_outer_and_manifest_hashes_are_both_required(self):
        captured = {'inert.txt': (b'inert\n', '100644')}
        with tempfile.TemporaryDirectory(prefix='jobs-inert-hashes-', dir='/dev/shm') as folder:
            root = pathlib.Path(folder)
            one = B['write_archive'](root/'one.tar.gz', captured, self.manifest(captured))
            for outer, inner in [('a'*64, one['installedManifestSha256']), (one['archiveSha256'], 'a'*64)]:
                with self.assertRaises(ValueError):
                    B['install_archive'](root/'one.tar.gz', outer, inner, root/'never-created')
                self.assertFalse((root/'never-created').exists())

    def test_saved_standalone_installer_runs_without_any_source_checkout(self):
        captured = {'inert.txt': (b'Ordinary standalone bootstrap fixture.\n', '100644')}
        with tempfile.TemporaryDirectory(prefix='jobs-inert-bootstrap-', dir='/dev/shm') as folder:
            root = pathlib.Path(folder)
            one = B['write_archive'](root/'one.tar.gz', captured, self.manifest(captured))
            installer = root/'install-discovery-installed.py'
            installer.write_bytes((ROOT/'scripts/release/install-discovery-installed.py').read_bytes())
            raw = subprocess.check_output([sys.executable, '-I', str(installer), '--archive', str(root/'one.tar.gz'),
                '--sha256', one['archiveSha256'], '--manifest-sha256', one['installedManifestSha256'],
                '--output', str(root/'installed')], cwd=root, timeout=10)
            self.assertEqual(json.loads(raw)['state'], 'EXTRACTED_INACTIVE_LOCAL_REVIEW_ONLY')
            self.assertEqual((root/'installed/inert.txt').read_bytes(), captured['inert.txt'][0])

    def test_indirect_archive_and_occupied_output_paths_are_refused(self):
        captured = {'inert.txt': (b'inert\n', '100644')}
        with tempfile.TemporaryDirectory(prefix='jobs-inert-paths-', dir='/dev/shm') as folder:
            root = pathlib.Path(folder)
            one = B['write_archive'](root/'one.tar.gz', captured, self.manifest(captured))
            (root/'indirect.tar.gz').symlink_to(root/'one.tar.gz')
            with self.assertRaises(OSError):
                B['install_archive'](root/'indirect.tar.gz', one['archiveSha256'], one['installedManifestSha256'], root/'absent')
            (root/'occupied').symlink_to(root/'absent')
            with self.assertRaisesRegex(ValueError, 'must be absent'):
                B['install_archive'](root/'one.tar.gz', one['archiveSha256'], one['installedManifestSha256'], root/'occupied')
            self.assertFalse((root/'absent').exists())

    def test_every_member_must_match_the_fixed_raw_manifest(self):
        captured = {'inert.txt': (b'inert\n', '100644')}
        for mutation in ('omit', 'digest', 'mode', 'authority'):
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory(prefix='jobs-inert-map-', dir='/dev/shm') as folder:
                root = pathlib.Path(folder)
                manifest = self.manifest(captured)
                if mutation == 'omit': manifest['files'] = {}
                if mutation == 'digest': manifest['files']['inert.txt']['sha256'] = 'a'*64
                if mutation == 'mode': manifest['files']['inert.txt']['mode'] = '100755'
                if mutation == 'authority': manifest['authority'] = 'operator'
                one = B['write_archive'](root/'one.tar.gz', captured, manifest)
                with self.assertRaises(ValueError):
                    B['install_archive'](root/'one.tar.gz', one['archiveSha256'], one['installedManifestSha256'], root/'never-created')
                self.assertFalse((root/'never-created').exists())

    def test_inert_duplicate_or_unsafe_member_names_are_refused_before_writes(self):
        for names in [('inert.txt', 'inert.txt'), ('../inert.txt',)]:
            with self.subTest(names=names), tempfile.TemporaryDirectory(prefix='jobs-inert-members-', dir='/dev/shm') as folder:
                root = pathlib.Path(folder)
                raw = io.BytesIO()
                with tarfile.open(fileobj=raw, mode='w') as archive:
                    for name in names:
                        item = tarfile.TarInfo(name)
                        item.mode, item.size = 0o644, 5
                        archive.addfile(item, io.BytesIO(b'inert'))
                archive_raw = gzip.compress(raw.getvalue(), mtime=0)
                (root/'inert.tar.gz').write_bytes(archive_raw)
                with self.assertRaises(ValueError):
                    B['install_archive'](root/'inert.tar.gz', hashlib.sha256(archive_raw).hexdigest(), 'a'*64, root/'never-created')
                self.assertFalse((root/'never-created').exists())

    def test_total_member_budget_is_checked_before_any_output_is_written(self):
        captured = {'inert.txt': (b'ordinary fixture\n', '100644')}
        with tempfile.TemporaryDirectory(prefix='jobs-inert-budget-', dir='/dev/shm') as folder:
            root = pathlib.Path(folder)
            one = B['write_archive'](root/'one.tar.gz', captured, self.manifest(captured))
            with patch.dict(B['install_archive'].__globals__, {'MAX_TOTAL': 4}):
                with self.assertRaisesRegex(ValueError, 'expands beyond bound'):
                    B['install_archive'](root/'one.tar.gz', one['archiveSha256'], one['installedManifestSha256'], root/'never-created')
            self.assertFalse((root/'never-created').exists())

    def test_unset_pin_cannot_accept_a_cosmetic_transition_label(self):
        raw = (json.dumps({'schema':'agijobsv0/discovery-installed-alpha/v1',
            'status':'UNSET_PENDING_FINAL_REVIEWED_MAIN','repository':'MontrealAI/AGI-Alpha-Agent-v0',
            'commit':None,'tree':None,'sourceHash':None,'catalogPath':'docs/successor/capabilities/sources.json',
            'catalogSha256':None,'files':{},'qualification':'NOT_RUN'},indent=2)+'\n').encode()
        # Exercise the original unset-pin transition, independently of a later
        # edition's reviewed live source selection.
        transition_raw = (ROOT/'scripts/release/fixtures/alpha615-reviewed-transition.json').read_bytes()
        self.assertEqual(hashlib.sha256(transition_raw).hexdigest(),
                         '0deb6eb67ee8e10d54d17ba6e3146b581c13909eb44bc9f801328adae7e9e47a')
        transition = json.loads(transition_raw)
        transition['status'] = 'REVIEWED_PIN_PROPOSAL'
        original = P['alpha_state'].__globals__['read']
        def read(root, name):
            if name == P['ALPHA_PIN']: return '100644', raw
            if name == P['ALPHA_TRANSITION']: return '100644', json.dumps(transition).encode()
            return original(root, name)
        with patch.dict(P['alpha_state'].__globals__, {'read': read}):
            with self.assertRaisesRegex(ValueError, 'Unset transition'):
                P['alpha_state'](ROOT)


if __name__ == '__main__':
    unittest.main()
