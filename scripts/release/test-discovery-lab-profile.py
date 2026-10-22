"""Adversarial additive source profile checks; this suite never qualifies publication."""
import hashlib
import json
import pathlib
import runpy
import tempfile
import unittest
from unittest.mock import patch
ROOT = pathlib.Path(__file__).resolve().parents[2]
P = runpy.run_path(str(ROOT / 'scripts/release/discovery-lab-profile.py'))
G = P['validate_source'].__globals__
sha = lambda raw: hashlib.sha256(raw).hexdigest()

class DiscoverySourceProfile(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.selection = P['select'](manifest_sha256=sha((ROOT/P['MANIFEST']).read_bytes()),
            verifier_sha256=sha((ROOT/P['VERIFIER']).read_bytes()), scope_verifier_sha256=sha((ROOT/P['SCOPE_VERIFIER']).read_bytes()))
        cls.expected = P['inventory'](ROOT, cls.selection)
    def verify(self, paths=None, selection=None):
        return P['validate_source'](ROOT, selection or self.selection,
            paths=set(self.expected) if paths is None else paths)
    def replaced(self, name, data, callback, repin=False, mode=None):
        original = G['read']
        def changed(root, item):
            m,raw = original(root,item)
            return (mode or m,data) if item==name else (m,raw)
        options = {**self.selection, 'manifestSha256':sha(data)} if repin else self.selection
        with patch.dict(G, {'read':changed}): callback(options)
    def rejection(self, options):
        with self.assertRaises((ValueError, FileNotFoundError)): self.verify(selection=options)
    def changed_manifest(self, change):
        manifest=json.loads((ROOT/P['MANIFEST']).read_bytes()); change(manifest)
        self.replaced(P['MANIFEST'],(json.dumps(manifest)+'\n').encode(),self.rejection,repin=True)
    def test_exact_candidate_preserves_all_unrelated_old_bytes_and_claims_no_release(self):
        with patch('subprocess.check_output',side_effect=AssertionError('Package validation must remain offline')):
            result=self.verify()
        self.assertFalse(result['releaseQualified']);self.assertFalse(result['publicationApproved'])
        self.assertIsNone(result['releaseIdentity']);self.assertFalse(result['executionApproved'])
    def test_baseline_inventory_reconstructs_the_independently_fixed_git_tree(self):
        baseline=json.loads((ROOT/P['BASELINE']).read_bytes())
        self.assertEqual(P['tree_digest'](baseline['entries']),P['BASE_TREE'])
    def test_publication_selection_is_always_refused(self):
        with self.assertRaises(ValueError): P['select'](manifest_sha256=self.selection['manifestSha256'],
            verifier_sha256=self.selection['verifierSha256'],scope_verifier_sha256=self.selection['scopeVerifierSha256'],published=True)
    def test_policy_pins_are_mandatory_and_exact(self):
        for key in ['manifestSha256','verifierSha256','scopeVerifierSha256']:
            self.rejection({**self.selection,key:'a'*64})
        with self.assertRaises(ValueError):P['select'](manifest_sha256=None,verifier_sha256='b'*64,scope_verifier_sha256='c'*64)
    def test_missing_or_unexpected_source_is_refused(self):
        with self.assertRaises(ValueError):self.verify(paths=set(self.expected)-{next(iter(self.expected))})
        with self.assertRaises(ValueError):self.verify(paths=set(self.expected)|{'arbitrary-new-runtime.mjs'})
    def test_rehashed_manifest_cannot_expand_or_shrink_the_reviewed_path_set(self):
        self.changed_manifest(lambda m:m['changes'].update({'arbitrary-new-runtime.mjs':{'before':None,'after':{'mode':'100644','sha256':'a'*64},'reason':'unreviewed'}}))
        self.changed_manifest(lambda m:m['changes'].pop(next(iter(m['changes']))))
    def test_rehashed_manifest_cannot_claim_qualification_or_change_baseline(self):
        self.changed_manifest(lambda m:m['claims'].update({'releaseQualified':True}))
        self.changed_manifest(lambda m:m['claims'].update({'releaseQualified':0}))
        self.changed_manifest(lambda m:m.update({'baseTree':'a'*40}))
        self.changed_manifest(lambda m:m.update({'repository':'other/repository'}))
    def test_altered_baseline_bytes_cannot_be_blessed_by_a_new_outer_hash(self):
        data=json.loads((ROOT/P['BASELINE']).read_bytes());first=next(iter(data['entries']))
        data['entries'][first]['blob']='a'*40
        self.replaced(P['BASELINE'],(json.dumps(data)+'\n').encode(),self.rejection)
    def test_semantically_identical_baseline_bytes_require_the_reviewed_pin(self):
        raw=(ROOT/P['BASELINE']).read_bytes()
        variants=[raw+b' '*100000, (json.dumps(json.loads(raw),indent=1)+'\n').encode()]
        for changed in variants:
            self.assertNotEqual(changed, raw)
            self.assertEqual(json.loads(changed),json.loads(raw))
            def rejected(options):
                with self.assertRaisesRegex(ValueError,'baseline.*byte|Baseline.*byte'):
                    P['inventory'](ROOT,options)
            self.replaced(P['BASELINE'],changed,rejected)
    def test_existing_code_cannot_be_added_as_an_allowed_change(self):
        self.changed_manifest(lambda m:m['changes'].update({'package.json':{'before':None,'after':{'mode':'100644','sha256':'a'*64},'reason':'unreviewed dependency change'}}))
    def test_existing_source_mutation_is_refused_without_a_path_exemption(self):
        self.replaced('package.json',(ROOT/'package.json').read_bytes()+b'\n',self.rejection)
    def test_changed_new_runtime_bytes_and_modes_are_refused(self):
        name=next(name for name in P['ALLOWED'] if name.endswith('/discovery-lab-work-request.mjs'))
        raw=(ROOT/name).read_bytes()
        self.replaced(name,raw+b'\n',self.rejection)
        self.replaced(name,raw,self.rejection,mode='100755')
    def test_unknown_manifest_keys_and_duplicate_json_keys_are_refused(self):
        self.changed_manifest(lambda m:m.update({'skipExistingChecks':True}))
        with self.assertRaises(ValueError):P['strict_json'](b'{"a":1,"a":2}')
    def test_unsafe_source_paths_and_baseline_collisions_are_refused(self):
        for name in ['../outside','/absolute','a/../b','a\\b']:
            with self.assertRaises(ValueError):P['read'](ROOT,name)
        with self.assertRaises(ValueError):P['tree_digest']({'a':{'mode':'100644','blob':'1'*40},'a/b':{'mode':'100644','blob':'2'*40}})

    def test_reviewed_transitions_require_exact_paths_and_original_git_blobs(self):
        self.changed_manifest(lambda m:m['transitions'].clear())
        self.changed_manifest(lambda m:m['transitions'].update({'package.json': next(iter(m['transitions'].values()))}))
        for name in P['TRANSITIONS']:
            self.changed_manifest(lambda m:m['transitions'].pop(name))
            self.changed_manifest(lambda m:m['transitions'][name]['before'].update({'blob':'a'*40}))
            self.changed_manifest(lambda m:m['transitions'][name]['after'].update({'mode':'100755'}))
    def test_reviewed_transition_bytes_remain_bound_to_the_reviewed_manifest(self):
        for name in P['TRANSITIONS']:
            self.replaced(name,(ROOT/name).read_bytes()+b'\n',self.rejection)

    def test_real_staged_directory_enumeration_refuses_a_rogue_file(self):
        with tempfile.TemporaryDirectory(prefix='discovery-inventory-probe-') as folder:
            root=pathlib.Path(folder);(root/'retained.txt').write_bytes(b'retained')
            fixture={'retained.txt':{'mode':'100644','sha256':sha(b'retained')}}
            with patch.dict(G,{'inventory':lambda root,selection:fixture}):
                P['validate_source'](root,self.selection)
                (root/'rogue-runtime.mjs').write_text('unreviewed extra source')
                with self.assertRaisesRegex(ValueError,'unexpected inputs'):
                    P['validate_source'](root,self.selection)

if __name__=='__main__':unittest.main()
