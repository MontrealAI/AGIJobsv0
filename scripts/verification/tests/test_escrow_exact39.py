"""Offline regression fixtures, separate from real native-replay evidence."""
import ast
import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock

SCRIPT = Path(__file__).resolve().parents[1] / 'escrow_exact39.py'
spec = importlib.util.spec_from_file_location('escrow_exact39', SCRIPT)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class RegressionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name)
        self.recipe = m.parse(m.RECIPE.read_bytes())
        meta = {'sources': {f'fixture/{i}.sol': {} for i in range(37)},
                'settings': {'compilationTarget': {m.SOURCE: m.NAME}}}
        self.expected = {'abi': [{'type': 'function', 'name': 'fixture'}], 'metadata': json.dumps(meta),
                         'evm': {'bytecode': {'object': '6000', 'linkReferences': {}},
                                 'deployedBytecode': {'object': '6001', 'linkReferences': {},
                                                     'immutableReferences': {}},
                                 'methodIdentifiers': {'fixture()': '12345678'}}}
        self.patch = mock.patch.multiple(m, CREATION_SHA=m.sha(bytes.fromhex('6000')),
                                        RUNTIME_SHA=m.sha(bytes.fromhex('6001')),
                                        METADATA_SHA=m.sha(self.expected['metadata'].encode()))
        self.patch.start(); self.addCleanup(self.patch.stop)

    def test_recipe_identity(self):
        self.assertEqual((self.recipe['chainId'], self.recipe['address'], self.recipe['sourceCommit']),
                         (1, m.ADDRESS, m.COMMIT))

    def test_recipe_input_pin(self):
        self.assertEqual(self.recipe['inputSha256'], m.INPUT_SHA)
        self.assertEqual(self.recipe['inputBytes'], 244730)

    def test_recipe_scope(self):
        self.assertEqual(len(self.recipe['sourceSha256']), 39)
        self.assertTrue(m.EXTRAS <= self.recipe['sourceSha256'].keys())
        self.assertEqual(set(self.recipe['retainedOriginalExtraSources']), m.EXTRAS)

    def test_recipe_no_activation(self):
        self.assertIs(self.recipe['productionApproved'], False)
        self.assertEqual(self.recipe['constructorArguments'], '')
        self.assertEqual(self.recipe['sourceContentsChanged'], 0)
        self.assertFalse(self.recipe['codeGenerationSettingsChanged'])

    def test_exact_fixture(self):
        m.exact(self.expected, copy.deepcopy(self.expected))

    def test_bad_creation(self):
        got = copy.deepcopy(self.expected); got['evm']['bytecode']['object'] = '6002'
        with self.assertRaisesRegex(ValueError, 'BYTECODE_DIFFERS'): m.exact(self.expected, got)

    def test_bad_runtime(self):
        got = copy.deepcopy(self.expected); got['evm']['deployedBytecode']['object'] = '6002'
        with self.assertRaisesRegex(ValueError, 'DEPLOYEDBYTECODE_DIFFERS'): m.exact(self.expected, got)

    def test_empty_bytecode(self):
        for value in ['', '0x', '60', '600', '60 00', '0x6000', '__$unlinked$__', 'GG']:
            got = copy.deepcopy(self.expected); got['evm']['bytecode']['object'] = value
            with self.subTest(value=value), self.assertRaises(ValueError): m.exact(self.expected, got)

    def test_wrong_reference_cannot_validate_itself(self):
        wrong = copy.deepcopy(self.expected); wrong['evm']['bytecode']['object'] = '6002'
        with self.assertRaises(ValueError): m.exact(wrong, copy.deepcopy(wrong))

    def test_missing_reference_field(self):
        wrong = copy.deepcopy(self.expected); del wrong['evm']['bytecode']['linkReferences']
        with self.assertRaises((ValueError, KeyError)): m.exact(wrong, copy.deepcopy(wrong))

    def test_abi_changed(self):
        got = copy.deepcopy(self.expected); got['abi'] = []
        with self.assertRaisesRegex(ValueError, 'ABI_DIFFERS'): m.exact(self.expected, got)

    def test_metadata_changed(self):
        got = copy.deepcopy(self.expected); got['metadata'] += ' '
        with self.assertRaisesRegex(ValueError, 'METADATA_DIFFERS'): m.exact(self.expected, got)

    def test_links_changed(self):
        got = copy.deepcopy(self.expected); got['evm']['bytecode']['linkReferences'] = {'other': {}}
        with self.assertRaisesRegex(ValueError, 'LINKS_DIFFER'): m.exact(self.expected, got)

    def test_methods_changed(self):
        got = copy.deepcopy(self.expected); got['evm']['methodIdentifiers'] = {}
        with self.assertRaisesRegex(ValueError, 'METHODS_DIFFER'): m.exact(self.expected, got)

    def test_immutable_ids_not_positions(self):
        a = {'101': [{'start': 0, 'length': 1}]}; b = {'999': [{'start': 0, 'length': 1}]}
        self.assertEqual(m.immutable_layout(a, 2), m.immutable_layout(b, 2))

    def test_immutable_move_rejected(self):
        a = copy.deepcopy(self.expected); b = copy.deepcopy(self.expected)
        a['evm']['deployedBytecode']['immutableReferences'] = {'1': [{'start': 0, 'length': 1}]}
        b['evm']['deployedBytecode']['immutableReferences'] = {'2': [{'start': 1, 'length': 1}]}
        with self.assertRaisesRegex(ValueError, 'IMMUTABLE_LAYOUT_DIFFERS'): m.exact(a, b)

    def test_immutable_invalid_bounds(self):
        for start, length in [(-1, 1), (0, 0), (0, 3), (True, 1), (0, False)]:
            with self.subTest(start=start, length=length), self.assertRaises(ValueError):
                m.immutable_layout({'a': [{'start': start, 'length': length}]}, 2)

    def test_immutable_overlap(self):
        with self.assertRaisesRegex(ValueError, 'IMMUTABLE_OVERLAP'):
            m.immutable_layout({'a': [{'start': 0, 'length': 1}], 'b': [{'start': 0, 'length': 1}]}, 2)

    def test_target_missing(self):
        with self.assertRaisesRegex(ValueError, 'TARGET_NOT_COMPILED'): m.target({'contracts': {}})

    def test_compiler_error(self):
        with self.assertRaisesRegex(ValueError, 'SOLIDITY_COMPILER_ERROR'):
            m.target({'errors': [{'severity': 'error'}], 'contracts': {m.SOURCE: {m.NAME: self.expected}}})

    def test_warning_not_error(self):
        self.assertEqual(m.target({'errors': [{'severity': 'warning'}],
                                   'contracts': {m.SOURCE: {m.NAME: self.expected}}}), self.expected)

    def test_errors_wrong_type(self):
        with self.assertRaises(ValueError): m.target({'errors': {'severity': 'warning'}})

    def test_json_duplicate(self):
        with self.assertRaisesRegex(ValueError, 'DUPLICATE_JSON_KEY'): m.parse(b'{"a":1,"a":2}')

    def test_json_nonfinite(self):
        for value in ['NaN', 'Infinity', '-Infinity']:
            with self.subTest(value=value), self.assertRaises(ValueError): m.parse(('{"a":'+value+'}').encode())

    def test_json_object_only(self):
        for value in [b'[]', b'null', b'1', b'"a"']:
            with self.subTest(value=value), self.assertRaises(ValueError): m.parse(value)

    def test_read_pin(self):
        p = self.path / 'fixture'; p.write_bytes(b'fixture')
        self.assertEqual(m.pinned(p, {m.sha(b'fixture')}, 20), b'fixture')

    def test_read_wrong_pin(self):
        p = self.path / 'fixture'; p.write_bytes(b'fixture')
        with self.assertRaisesRegex(ValueError, 'INPUT_HASH_MISMATCH'): m.pinned(p, {'wrong'}, 20)

    def test_read_empty_or_too_large(self):
        p = self.path / 'fixture'
        for value in [b'', b'longer than limit']:
            p.write_bytes(value)
            with self.assertRaises(ValueError): m.read_regular(p, 3)

    def test_read_symlink(self):
        p = self.path / 'fixture'; p.write_bytes(b'ok')
        link = self.path / 'link'; link.symlink_to(p)
        with self.assertRaises(OSError): m.read_regular(link, 20)

    def test_no_network_import_or_wallet_commands(self):
        imports = [n for n in ast.walk(ast.parse(SCRIPT.read_text())) if isinstance(n, (ast.Import, ast.ImportFrom))]
        names = [a.name.split('.')[0] for n in imports if isinstance(n, ast.Import) for a in n.names]
        self.assertFalse({'requests', 'urllib', 'socket', 'web3'} & set(names))
        for text in ['eth_sendRawTransaction', 'eth_sendTransaction', 'personal_sign', 'getpass', 'curl', 'npm install']:
            self.assertNotIn(text, SCRIPT.read_text())

    def test_compiler_pin_before_execution(self):
        with mock.patch.object(m.subprocess, 'run') as run:
            with self.assertRaisesRegex(ValueError, 'COMPILER_HASH_MISMATCH'):
                m.compile_one(b'not-solc', b'{}', self.path, 'fixture')
            run.assert_not_called()

    def test_timeout_preserves_diagnostics(self):
        error = subprocess.TimeoutExpired('fixture', 90, output=b'partial', stderr=b'error')
        with mock.patch.object(m, 'SOLC_SHA', m.sha(b'fixture')), mock.patch.object(m.subprocess, 'run', side_effect=error):
            with self.assertRaisesRegex(ValueError, 'COMPILER_TIMEOUT_NO_SUCCESS'):
                m.compile_one(b'fixture', b'{}', self.path, 'fixture')
        self.assertEqual((self.path/'fixture.partial-output').read_bytes(), b'partial')
        self.assertEqual((self.path/'fixture.stderr.txt').read_bytes(), b'error')

    def test_exit_failure_not_success(self):
        proc = subprocess.CompletedProcess([], 1, stdout=b'{}', stderr=b'failure')
        with mock.patch.object(m, 'SOLC_SHA', m.sha(b'fixture')), mock.patch.object(m.subprocess, 'run', return_value=proc):
            with self.assertRaisesRegex(ValueError, 'COMPILER_EXIT_OR_OUTPUT_SIZE'):
                m.compile_one(b'fixture', b'{}', self.path, 'fixture')

    def test_successful_fixture_compile_is_isolated(self):
        proc = subprocess.CompletedProcess([], 0, stdout=m.encode({'contracts': {m.SOURCE: {m.NAME: self.expected}}}), stderr=b'')
        with mock.patch.object(m, 'SOLC_SHA', m.sha(b'fixture')), mock.patch.object(m.subprocess, 'run', return_value=proc) as run:
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(m.compile_one(b'fixture', b'{}', self.path, 'fixture'), self.expected)
            self.assertEqual(run.call_args.kwargs['timeout'], 90)
            self.assertIn('--no-import-callback', run.call_args.args[0])
            self.assertEqual(set(run.call_args.kwargs['env']), {'PATH', 'HOME', 'LANG', 'LC_ALL'})

    def test_candidate_wrong_settings(self):
        original = {'language': 'Solidity', 'sources': {str(i): {} for i in range(267)}, 'settings': {**m.PROFILE, 'evmVersion': 'paris'}}
        with self.assertRaisesRegex(ValueError, 'COMPILER_SETTINGS_CHANGED'): m.make_candidate(original, self.recipe)

    def test_candidate_wrong_chain(self):
        wrong = copy.deepcopy(self.recipe); wrong['chainId'] = 2
        with self.assertRaisesRegex(ValueError, 'RECIPE_IDENTITY_MISMATCH'): m.make_candidate({}, wrong)

    def test_candidate_wrong_source_count(self):
        with self.assertRaisesRegex(ValueError, 'ORIGINAL_SOURCE_SCOPE'):
            m.make_candidate({'language': 'Solidity', 'sources': {}}, self.recipe)


    def fixture_input(self):
        recipe = copy.deepcopy(self.recipe)
        names = list(reversed(list(recipe['sourceSha256'])))
        sources = {name: {'content': 'fixture'} for name in names}
        candidate = {'language': 'Solidity', 'sources': sources,
                     'settings': {**copy.deepcopy(m.PROFILE), 'outputSelection': {'*': {'*': m.OUTPUTS}}}}
        sources[names[0]]['content'] += 'x' * (244730 - len(m.encode(candidate)))
        recipe['sourceSha256'] = {key: m.sha(value['content'].encode()) for key, value in sources.items()}
        raw = m.encode(candidate)
        recipe['inputSha256'] = m.sha(raw)
        original = copy.deepcopy(candidate)
        original['sources'].update({f'unused/{i}.sol': {'content': 'unused'} for i in range(228)})
        return original, recipe, raw

    def test_candidate_preserves_order_and_contents(self):
        original, recipe, raw = self.fixture_input()
        before = copy.deepcopy(original)
        with mock.patch.object(m, 'INPUT_SHA', m.sha(raw)):
            self.assertEqual(m.make_candidate(original, recipe), raw)
        self.assertEqual(original, before)

    def test_candidate_tampered_source(self):
        original, recipe, raw = self.fixture_input()
        original['sources'][m.SOURCE]['content'] += 'changed'
        with mock.patch.object(m, 'INPUT_SHA', m.sha(raw)):
            with self.assertRaisesRegex(ValueError, 'SOURCE_HASH_MISMATCH'): m.make_candidate(original, recipe)

    def test_candidate_url_rejected(self):
        original, recipe, raw = self.fixture_input()
        original['sources'][m.SOURCE] = {'urls': ['https://example.invalid/source']}
        with mock.patch.object(m, 'INPUT_SHA', m.sha(raw)):
            with self.assertRaisesRegex(ValueError, 'LITERAL_SOURCE_REQUIRED'): m.make_candidate(original, recipe)

    def test_candidate_two_extra_sources_required(self):
        original, recipe, raw = self.fixture_input()
        del recipe['sourceSha256'][next(iter(m.EXTRAS))]
        with mock.patch.object(m, 'INPUT_SHA', m.sha(raw)):
            with self.assertRaisesRegex(ValueError, 'RECIPE_SOURCE_SCOPE'): m.make_candidate(original, recipe)

    def test_candidate_does_not_enable_production(self):
        original, recipe, raw = self.fixture_input()
        recipe['productionApproved'] = True
        with mock.patch.object(m, 'INPUT_SHA', m.sha(raw)):
            with self.assertRaisesRegex(ValueError, 'AUTHORIZATION_MISMATCH'): m.make_candidate(original, recipe)

    def test_candidate_constructor_must_be_empty(self):
        original, recipe, raw = self.fixture_input()
        recipe['constructorArguments'] = '0x'
        with mock.patch.object(m, 'INPUT_SHA', m.sha(raw)):
            with self.assertRaisesRegex(ValueError, 'AUTHORIZATION_MISMATCH'): m.make_candidate(original, recipe)

    def test_candidate_wrong_final_hash_rejected(self):
        original, recipe, raw = self.fixture_input()
        recipe['inputSha256'] = m.INPUT_SHA
        with self.assertRaisesRegex(ValueError, 'EXACT39_INPUT_MISMATCH'): m.make_candidate(original, recipe)

    def test_boolean_chain_rejected(self):
        wrong = copy.deepcopy(self.recipe); wrong['chainId'] = True
        with self.assertRaisesRegex(ValueError, 'RECIPE_IDENTITY_MISMATCH'): m.make_candidate({}, wrong)

    def test_existing_output_preserved(self):
        source = self.path/'original.json'; source.write_bytes(b'{}')
        solc = self.path/'solc'; solc.write_bytes(b'fixture')
        output = self.path/'existing'; output.mkdir(); (output/'keep').write_text('keep')
        with mock.patch.object(m, 'SOLC_SHA', m.sha(b'fixture')), \
             mock.patch.object(m, 'ORIGINAL_INPUT_SHAS', {m.sha(b'{}')}), \
             mock.patch.object(m, 'make_candidate', return_value=b'candidate'), \
             mock.patch.object(m, 'compile_one') as compiler:
            with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(FileExistsError):
                m.main(['--original-input', str(source), '--solc', str(solc), '--output-dir', str(output)])
            compiler.assert_not_called()
        self.assertEqual((output/'keep').read_text(), 'keep')


if __name__ == '__main__':
    unittest.main()
