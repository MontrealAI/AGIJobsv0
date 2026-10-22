# SPDX-License-Identifier: MIT
"""Ordinary finite source/preparation checks; no Alpha code or service is run."""
import hashlib
import json
import pathlib
import os
import runpy
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[2]
P = runpy.run_path(str(ROOT / 'scripts/release/discovery-installed-profile.py'))
G = P['inventory'].__globals__


class InstalledPreparation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.selection = P['select'](manifest_sha256=P['sha']((ROOT/P['MANIFEST']).read_bytes()),
                                   verifier_sha256=P['sha']((ROOT/P['VERIFIER']).read_bytes()),
                                   scope_verifier_sha256=P['sha']((ROOT/P['SCOPE_VERIFIER']).read_bytes()))

    def changed(self, name, raw, callback, repin=False):
        original = G['read']
        def read(root, item):
            mode, current = original(root, item)
            return (mode, raw) if item == name else (mode, current)
        options = {**self.selection, 'manifestSha256': P['sha'](raw)} if repin else self.selection
        with patch.dict(G, {'read': read}):
            callback(options)

    def refused(self, selection):
        with self.assertRaises((ValueError, FileNotFoundError)):
            P['readiness'](ROOT, selection)

    def changed_manifest(self, change):
        value = json.loads((ROOT/P['MANIFEST']).read_bytes())
        change(value)
        self.changed(P['MANIFEST'], (json.dumps(value)+'\n').encode(), self.refused, repin=True)

    def test_actual_whole_source_preserves_every_denial(self):
        value = P['readiness'](ROOT, self.selection)
        self.assertEqual(value['nativeAcceptance'], 'NOT_RUN')
        self.assertEqual(value['alphaPin'], 'UNSET' if P['alpha_state'](ROOT)['status'].startswith('UNSET')
                         else 'REVIEWED_FINAL_SOURCE')
        self.assertEqual(value['versionReservation'], 'UNRESERVED_PROPOSAL')
        self.assertEqual(len(value['holds']), 6)
        for key in P['DENIALS']:
            self.assertIs(value[key], False)

    def test_prerequisite_projection_reconstructs_the_complete_actual_owner_tree(self):
        entries = P['prerequisite_inventory'](ROOT)
        self.assertEqual(len(entries), 5190)
        self.assertEqual(P['tree_digest'](entries), P['PREREQUISITE_TREE'])

    def test_old_profiles_accepted_slots_queries_and_deployment_source_are_unchanged(self):
        inherited = P['prerequisite_inventory'](ROOT)
        paths = ['scripts/release/source-profile-rc16.cjs', 'scripts/release/source-profile-rc16.json',
                 'scripts/release/source-profile-rc17.json', 'scripts/release/source-scanner-review-bindings-rc16.cjs',
                 'docs/security/remediation-2026-10-19/findings.json', '.github/codeql/config.yml',
                 'config/solidity-compiler.json', 'docs/production/CURRENT_MAINNET_DEPLOYMENT.md',
                 'scripts/release/discovery-lab-profile.py', 'tools/security/discovery-protected-scope.mjs']
        for name in paths[:8]:
            self.assertNotIn(name, P['CHANGES'])
            mode, raw = P['read'](ROOT, name)
            self.assertEqual({'mode':mode,'blob':P['blob'](raw)}, inherited[name])
        # The old Discovery policy is a retained addition, never edited for this profile.
        for name in paths[8:]:
            self.assertEqual(P['CHANGES'][name]['after']['sha256'], P['sha']((ROOT/name).read_bytes()))

    def test_rehashed_manifest_cannot_expand_or_rewrite_the_fixed_delta(self):
        self.changed_manifest(lambda value: value['changes'].update({'arbitrary-extra.txt':next(iter(value['changes'].values()))}))
        self.changed_manifest(lambda value: value['changes'].pop(next(iter(value['changes']))))
        self.changed_manifest(lambda value: value['changes']['hardhat.config.js']['after'].update({'sha256':'a'*64}))

    def test_preparation_decisions_cannot_be_imported_as_approval(self):
        self.changed_manifest(lambda value: value['decisions'].update({'publicationApproval':{'status':'approved'}}))
        self.changed_manifest(lambda value: value['denials'].update({'releaseQualified':True}))
        self.changed_manifest(lambda value: value['denials'].update({'releaseQualified':0}))
        self.changed_manifest(lambda value: value.update({'state':'RELEASED'}))

    def test_verifier_baseline_and_prerequisite_pins_are_not_self_selected(self):
        for name in [P['VERIFIER'], P['SCOPE_VERIFIER'], P['BASELINE'], P['PREREQUISITE_MANIFEST']]:
            self.changed(name, (ROOT/name).read_bytes()+b'\n', self.refused)
        for values in [(None, 'a'*64, 'a'*64), ('a'*64, 'a'*64, None)]:
            with self.assertRaises(ValueError):
                P['select'](manifest_sha256=values[0], verifier_sha256=values[1], scope_verifier_sha256=values[2])

    def test_existing_native_runtime_dependency_and_mode_changes_are_refused(self):
        for name in ['package.json', 'integrations/alpha-agent/discovery-lab-work-request.mjs',
                     'integrations/alpha-agent/discovery-installed-native.mjs', P['ALPHA_PIN']]:
            self.changed(name, (ROOT/name).read_bytes()+b'\n', self.refused)

    def test_an_actual_extra_file_cannot_be_hidden_by_a_supplied_path_list(self):
        expected = set(P['inventory'](ROOT, self.selection))
        with tempfile.NamedTemporaryFile(prefix='source-inventory-extra-', suffix='.txt', dir=ROOT) as handle:
            handle.write(b'ordinary unexpected source fixture'); handle.flush()
            with self.assertRaisesRegex(ValueError, 'missing or unexpected'):
                P['validate_source'](ROOT, self.selection)
            with self.assertRaisesRegex(ValueError, 'cannot hide|missing or unexpected'):
                P['validate_source'](ROOT, self.selection, paths=expected)

    def test_strict_json_and_source_paths_refuse_unsupported_input(self):
        for raw in [b'{"x":1,"x":2}', b'{"x":NaN}']:
            with self.assertRaises(ValueError):P['strict_json'](raw)
        for name in ['../outside', '/absolute', 'a/../b', '.git/config', 'a\\b']:
            with self.assertRaises(ValueError):P['read'](ROOT, name)

    def test_inert_special_source_node_is_rejected_without_opening_it(self):
        special = ROOT/'source-inventory-inert-special.fifo'
        self.assertFalse(os.path.lexists(special))
        os.mkfifo(special, 0o600)
        try:
            with self.assertRaisesRegex(ValueError, 'Nonregular|missing or unexpected'):
                P['validate_source'](ROOT, self.selection)
        finally:
            special.unlink()

    def test_inert_git_configuration_is_checked_before_any_git_object_read(self):
        with tempfile.TemporaryDirectory(prefix='jobs-inert-git-config-') as folder:
            root = pathlib.Path(folder)
            metadata = root / '.git'
            metadata.mkdir()
            config = metadata / 'config'
            ordinary = '[core]\n repositoryformatversion = 0\n bare = false\n'
            config.write_text(ordinary)
            self.assertEqual(P['guard_git_metadata'](root), root)
            for fixture in ['[include]\n path = inert.conf\n', '[protocol "file"]\n allow = always\n',
                            '[remote "origin"]\n promisor = true\n', '[remote "origin"]\n uploadpack = inert-value\n']:
                config.write_text(ordinary + fixture)
                with self.assertRaises(ValueError): P['guard_git_metadata'](root)
            config.write_text(ordinary)
            (metadata/'config.worktree').write_text('[core]\n bare = false\n')
            self.assertEqual(P['guard_git_metadata'](root), root)
            for setting in ['false', 'no', 'off', '0']:
                config.write_text(ordinary+'[extensions]\n worktreeConfig = '+setting+'\n')
                self.assertEqual(P['guard_git_metadata'](root), root)
            for setting in ['true', 'yes', 'on', '1', 'unknown', '\"false\"', 'fal'+'\\'+'\nse']:
                config.write_text(ordinary+'[extensions]\n worktreeConfig = '+setting+'\n')
                with self.assertRaises(ValueError): P['guard_git_metadata'](root)
            for bare in ['worktreeConfig', 'worktreeConfig# ignored comment', 'worktreeConfig; ignored comment']:
                config.write_text(ordinary+'[extensions]\n '+bare+'\n')
                with self.assertRaises(ValueError): P['guard_git_metadata'](root)
            config.write_text(ordinary+'[extensions] worktreeConfig = true\n')
            with self.assertRaises(ValueError): P['guard_git_metadata'](root)
            config.write_text(ordinary)
            (metadata/'config.worktree').unlink()
            (metadata/'config.worktree').mkdir()
            with self.assertRaises((ValueError, IsADirectoryError)): P['guard_git_metadata'](root)
            (metadata/'config.worktree').rmdir()
            (metadata/'objects/pack').mkdir(parents=True)
            (metadata/'objects/pack/inert.promisor').write_bytes(b'')
            with self.assertRaises(ValueError): P['guard_git_metadata'](root)
            with self.assertRaises(ValueError): P['guard_git_metadata'](root/'ordinary-subdirectory')

    def test_inert_official_checkout_gc_metadata_has_only_literal_disabled_auto(self):
        with tempfile.TemporaryDirectory(prefix='jobs-gc-config-', dir='/dev/shm') as folder:
            root = pathlib.Path(folder)
            (root/'.git').mkdir()
            config = root/'.git/config'
            config.write_text('[core]\nrepositoryformatversion=0\n[gc]\nauto = 0\n')
            self.assertEqual(P['guard_git_metadata'](root), root)
            env = {key: value for key, value in os.environ.items() if not key.startswith('GIT_')}
            env.update(GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_SYSTEM=os.devnull)
            self.assertEqual(subprocess.check_output(['git', '--no-pager', 'config', '--no-includes',
                '--file', str(config), '--get', 'gc.auto'], env=env, timeout=5), b'0\n')
            for section in ['[gc]\nauto', '[gc]\nauto = 1', '[gc]\nauto = "0"', '[gc]\nauto = 00',
                            '[gc]\nauto = 0\nauto = 1', '[gc]\nauto = 0\nauto = 0',
                            '[gc "checkout"]\nauto = 0', '[gc]\nother = 0', '[gc]\n']:
                with self.subTest(section=section):
                    config.write_text('[core]\nrepositoryformatversion=0\n'+section+'\n')
                    with self.assertRaises(ValueError):
                        P['guard_git_metadata'](root)
            config.write_text('[core]\nrepositoryformatversion=0\n[gc]\nauto=0\n')
            for name in ('commondir', 'gitdir'):
                (root/'.git'/name).write_text('ordinary inert administrative metadata\n')
                with self.assertRaisesRegex(ValueError, 'Shared or redirected'):
                    P['guard_git_metadata'](root)
                (root/'.git'/name).unlink()

    def test_operator_capture_is_rechecked_against_the_selected_source(self):
        builder = runpy.run_path(str(ROOT/'scripts/release/discovery-installed-package.py'))
        shared = builder['build_preparation'].__globals__['P']
        original_read = shared['read']
        status = P['readiness'](ROOT, self.selection)
        def changed(root, name):
            mode, raw = original_read(root, name)
            return mode, raw + b'\n' if name.endswith('discovery-installed-native.mjs') else raw
        if status['alphaPin'] != 'UNSET':
            with self.assertRaisesRegex(ValueError, 'unset-pin phase'):
                builder['build_preparation'](ROOT, self.selection, pathlib.Path('/dev/shm/unused-preparation.tar.gz'))
            return
        with tempfile.TemporaryDirectory(prefix='jobs-operator-capture-', dir='/dev/shm') as folder:
            with patch.dict(shared, {'readiness': lambda *_: status, 'read': changed}):
                with self.assertRaisesRegex(ValueError, 'Package capture differs'):
                    builder['build_preparation'](ROOT, self.selection, pathlib.Path(folder)/'capsule.tar.gz')

    def test_actual_operator_capsule_is_deterministic_and_inert(self):
        builder = runpy.run_path(str(ROOT/'scripts/release/discovery-installed-package.py'))
        if P['alpha_state'](ROOT)['status'] != 'UNSET_PENDING_FINAL_REVIEWED_MAIN':
            with self.assertRaisesRegex(ValueError, 'unset-pin phase'):
                builder['build_preparation'](ROOT, self.selection, pathlib.Path('/dev/shm/unused-preparation.tar.gz'))
            return
        with tempfile.TemporaryDirectory(prefix='jobs-operator-preparation-', dir='/dev/shm') as folder:
            first = builder['build_preparation'](ROOT, self.selection, pathlib.Path(folder)/'first.tar.gz')
            second = builder['build_preparation'](ROOT, self.selection, pathlib.Path(folder)/'second.tar.gz')
            self.assertEqual(first['sha256'], second['sha256'])
            with tarfile.open(first['path'], 'r:gz') as archive:
                members = archive.getmembers()
                self.assertTrue(all(item.isfile() and not item.name.startswith('/') and '..' not in item.name.split('/') for item in members))
                record = json.loads(archive.extractfile('OPERATOR_PREPARATION.json').read())
                binding = record['licenses']['integrations/alpha-agent/discovery-installed-module-graph.mjs']
                self.assertEqual(binding['spdx'], 'Apache-2.0')
                license_text = archive.extractfile(binding['licenseText']).read()
                self.assertEqual(P['sha'](license_text),
                                 'c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4')
                origin = json.loads(archive.extractfile(binding['origin']).read())
                self.assertEqual(origin['licenseText']['sha256'], P['sha'](license_text))
                self.assertEqual(origin['noticePath'], binding['notice'])
                self.assertEqual(origin['sourceSha256'], P['sha'](archive.extractfile(
                    'integrations/alpha-agent/discovery-installed-module-graph.mjs').read()))
                self.assertIn(origin['sourceSha256'], archive.extractfile(binding['notice']).read().decode())
                self.assertEqual(archive.extractfile('LICENSE').read(), (ROOT/'LICENSE').read_bytes())
            self.assertEqual(record['nativeQualification'], 'NOT_RUN')
            self.assertEqual(record['currencyCapBaseUnits'], '0')
            self.assertEqual(record['authority'], 'none')
            self.assertIs(record['publicationApproved'], False)
            self.assertIs(record['settlementApproved'], False)


if __name__ == '__main__':
    unittest.main()
