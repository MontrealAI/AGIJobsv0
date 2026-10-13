#!/usr/bin/env python3
"""Reproduce the already-verified Escrow input offline; never submit or transact."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import platform
import re
import stat
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RECIPE = ROOT / 'docs/deployments/evidence/escrow-exact39-v5.json'
SOURCE = 'contracts/v2/implementation/StakeManagerEscrow.sol'
NAME = 'StakeManagerEscrow'
ADDRESS = '0x97A17aAC4F6bD865d9e38d53411526B3291e88ae'
COMMIT = 'b4c5b66ea05a6bb27f1f1cb197f055c179bbd38e'
BUILD_SHA = '5f9fccbca58b1a25275c4de75dc79a38e5b987dfba45212546836cd39045b12d'
SOLC_SHA = 'c42aada7a52057ddbed93ec011235e256c564c440b68dbaac5ae482babbb3d6d'
INPUT_SHA = 'cbc1dc2b32036ae56239cb1caf8c26c2cbd2ebbeb18814203570f3b0d834e046'
ORIGINAL_INPUT_SHAS = {
    '7245c609d82b5661375f942b9ae60fa7caf9478197ef34bcbc32bdc1a79a8813',
    'a37c2e01f348434c6d1cb998c67abd8dbcc9b167fc3769176835633d8517e9bd',
}
CREATION_SHA = '77aed2b43e293cec231cccde4059ed7bab4bfe7049d3c0d5cc024804faef55b1'
RUNTIME_SHA = 'fe5c8ddb363525fefc69025d6b8eef8d0e9531a2a4e4d2271c2ca99e2e3e0dff'
METADATA_SHA = '104bb9f80907388e1fab3cc0c39a8f270e2c8a8978b6641a8d787e31b15f98e8'
OUTPUTS = ['abi', 'metadata', 'evm.bytecode', 'evm.deployedBytecode', 'evm.methodIdentifiers']
PROFILE = {'optimizer': {'enabled': True, 'runs': 200}, 'viaIR': True, 'evmVersion': 'cancun'}
EXTRAS = {'@openzeppelin/contracts/interfaces/IERC1271.sol',
          '@openzeppelin/contracts/interfaces/IERC5267.sol'}
TIMEOUT = 90


def require(ok: bool, message: str) -> None:
    if not ok:
        raise ValueError(message)


def sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def encode(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')


def unique_object(pairs: list) -> dict:
    result = {}
    for key, value in pairs:
        require(key not in result, 'DUPLICATE_JSON_KEY')
        result[key] = value
    return result


def parse(raw: bytes) -> dict:
    result = json.loads(raw, object_pairs_hook=unique_object,
                        parse_constant=lambda _: (_ for _ in ()).throw(ValueError('NONFINITE_JSON')))
    require(isinstance(result, dict), 'JSON_OBJECT_REQUIRED')
    return result


def read_regular(path: Path, limit: int) -> bytes:
    fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        require(stat.S_ISREG(info.st_mode) and 0 < info.st_size <= limit, 'FILE_SIZE_OR_TYPE')
        raw = stream.read(limit + 1)
    require(0 < len(raw) <= limit, 'FILE_SIZE_CHANGED')
    return raw


def pinned(path: Path, allowed: set[str], limit: int) -> bytes:
    raw = read_regular(path, limit)
    require(sha(raw) in allowed, 'INPUT_HASH_MISMATCH:' + path.name)
    return raw


def make_candidate(original: dict, recipe: dict) -> bytes:
    require(type(recipe['chainId']) is int and recipe['chainId'] == 1 and recipe['address'] == ADDRESS and
            recipe['sourceCommit'] == COMMIT and recipe['contractIdentifier'] == SOURCE + ':' + NAME,
            'RECIPE_IDENTITY_MISMATCH')
    require(recipe['sourceCount'] == 39 and recipe['inputBytes'] == 244730 and
            recipe['inputSha256'] == INPUT_SHA and recipe['compilerSha256'] == SOLC_SHA and
            recipe['constructorArguments'] == '' and recipe['productionApproved'] is False,
            'RECIPE_PIN_OR_AUTHORIZATION_MISMATCH')
    require(original.get('language') == 'Solidity' and len(original['sources']) == 267,
            'ORIGINAL_SOURCE_SCOPE')
    require({k: v for k, v in original['settings'].items() if k != 'outputSelection'} == PROFILE,
            'COMPILER_SETTINGS_CHANGED')
    digests = recipe['sourceSha256']
    require(len(digests) == 39 and EXTRAS <= digests.keys() and SOURCE in digests, 'RECIPE_SOURCE_SCOPE')
    sources = {}
    for name in original['sources']:
        if name not in digests:
            continue
        entry = original['sources'][name]
        require(isinstance(entry, dict) and set(entry) == {'content'} and
                isinstance(entry['content'], str), 'LITERAL_SOURCE_REQUIRED')
        require(sha(entry['content'].encode('utf-8')) == digests[name], 'SOURCE_HASH_MISMATCH:' + name)
        sources[name] = copy.deepcopy(entry)
    candidate = {'language': 'Solidity', 'sources': sources,
                 'settings': {**copy.deepcopy(PROFILE), 'outputSelection': {'*': {'*': OUTPUTS}}}}
    raw = encode(candidate)
    require(len(raw) == 244730 and sha(raw) == INPUT_SHA, 'EXACT39_INPUT_MISMATCH')
    return raw


def target(result: dict) -> dict:
    errors = result.get('errors', [])
    require(isinstance(errors, list) and all(isinstance(e, dict) for e in errors), 'COMPILER_ERRORS_FORMAT')
    require(not any(e.get('severity') == 'error' for e in errors), 'SOLIDITY_COMPILER_ERROR')
    obj = result.get('contracts', {}).get(SOURCE, {}).get(NAME)
    require(isinstance(obj, dict), 'TARGET_NOT_COMPILED')
    return obj


def bytecode(obj: dict, section: str) -> bytes:
    value = obj['evm'][section]['object']
    require(isinstance(value, str) and re.fullmatch(r'(?:[0-9a-f]{2})+', value) is not None,
            'EMPTY_OR_MALFORMED_BYTECODE')
    return bytes.fromhex(value)


def immutable_layout(refs: dict, size: int) -> list:
    require(isinstance(refs, dict), 'IMMUTABLE_FORMAT')
    layout = []
    occupied = set()
    for positions in refs.values():
        require(isinstance(positions, list) and len(positions) > 0, 'IMMUTABLE_GROUP')
        group = []
        for entry in positions:
            start, length = entry['start'], entry['length']
            require(type(start) is int and type(length) is int and start >= 0 and length > 0
                    and start + length <= size, 'IMMUTABLE_BOUNDS')
            span = set(range(start, start + length))
            require(not occupied.intersection(span), 'IMMUTABLE_OVERLAP')
            occupied.update(span)
            group.append((start, length))
        layout.append(sorted(group))
    return sorted(layout)


def exact(expected: dict, got: dict) -> None:
    for section, digest in [('bytecode', CREATION_SHA), ('deployedBytecode', RUNTIME_SHA)]:
        a, b = bytecode(expected, section), bytecode(got, section)
        require(sha(a) == digest and a == b, section.upper() + '_DIFFERS')
        links = expected['evm'][section]['linkReferences']
        require(isinstance(links, dict) and links == got['evm'][section]['linkReferences'], 'LINKS_DIFFER')
    require(isinstance(expected['abi'], list) and len(expected['abi']) > 0 and
            expected['abi'] == got['abi'], 'ABI_DIFFERS')
    require(isinstance(expected['metadata'], str) and
            sha(expected['metadata'].encode()) == METADATA_SHA and
            expected['metadata'] == got['metadata'], 'METADATA_DIFFERS')
    methods = expected['evm']['methodIdentifiers']
    require(isinstance(methods, dict) and len(methods) > 0 and
            methods == got['evm']['methodIdentifiers'], 'METHODS_DIFFER')
    size = len(bytecode(expected, 'deployedBytecode'))
    require(immutable_layout(expected['evm']['deployedBytecode'].get('immutableReferences', {}), size) ==
            immutable_layout(got['evm']['deployedBytecode'].get('immutableReferences', {}), size),
            'IMMUTABLE_LAYOUT_DIFFERS')
    meta = parse(expected['metadata'].encode())
    require(meta['settings']['compilationTarget'] == {SOURCE: NAME} and
            len(meta['sources']) == 37 and not (EXTRAS & meta['sources'].keys()), 'METADATA_TARGET_OR_SCOPE')


def compile_one(binary: bytes, raw: bytes, directory: Path, label: str) -> dict:
    require(sha(binary) == SOLC_SHA, 'COMPILER_HASH_MISMATCH')
    (directory / (label + '.input.json')).write_bytes(raw)
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix='agijobsv0-exact39-') as temporary:
        compiler = Path(temporary) / 'solc'
        compiler.write_bytes(binary)
        compiler.chmod(0o500)
        try:
            proc = subprocess.run([str(compiler), '--standard-json', '--no-import-callback'], input=raw,
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=temporary,
                                  env={'PATH': '/usr/bin:/bin', 'HOME': temporary, 'LANG': 'C', 'LC_ALL': 'C'},
                                  timeout=TIMEOUT, check=False)
        except subprocess.TimeoutExpired as error:
            (directory / (label + '.partial-output')).write_bytes(error.stdout or b'')
            (directory / (label + '.stderr.txt')).write_bytes(error.stderr or b'')
            raise ValueError('COMPILER_TIMEOUT_NO_SUCCESS') from None
    (directory / (label + '.output.json')).write_bytes(proc.stdout)
    (directory / (label + '.stderr.txt')).write_bytes(proc.stderr)
    require(proc.returncode == 0 and 0 < len(proc.stdout) < 80000000, 'COMPILER_EXIT_OR_OUTPUT_SIZE')
    print(f'{label}: {time.monotonic() - started:.2f}s', flush=True)
    return target(parse(proc.stdout))


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    inputs = parser.add_mutually_exclusive_group(required=True)
    inputs.add_argument('--build-info', type=Path, help='The SHA-pinned original saved Hardhat build-info file')
    inputs.add_argument('--original-input', type=Path, help='The SHA-pinned original 267-source Standard JSON')
    parser.add_argument('--solc', required=True, type=Path, help='Existing native Linux x86-64 solc 0.8.25 binary')
    parser.add_argument('--output-dir', required=True, type=Path, help='New directory; existing paths are refused')
    args = parser.parse_args(argv)
    require(platform.system() == 'Linux' and platform.machine().lower() in ('x86_64', 'amd64'),
            'LINUX_X86_64_REQUIRED')
    print('OFFLINE REPRODUCTION ONLY. ALREADY VERIFIED; DO NOT RESUBMIT OR UNPAUSE.', flush=True)
    binary = pinned(args.solc, {SOLC_SHA}, 40000000)
    recipe = parse(read_regular(RECIPE, 100000))
    expected = None
    if args.build_info:
        saved = parse(pinned(args.build_info, {BUILD_SHA}, 150000000))
        require(saved['solcVersion'] == '0.8.25' and
                saved['solcLongVersion'] == '0.8.25+commit.b61c2a91', 'BUILD_COMPILER_MISMATCH')
        original, expected = saved['input'], target(saved['output'])
    else:
        original = parse(pinned(args.original_input, ORIGINAL_INPUT_SHAS, 5000000))
    candidate = make_candidate(original, recipe)
    args.output_dir.mkdir(mode=0o700, parents=False, exist_ok=False)
    evidence = args.output_dir / 'evidence'; evidence.mkdir()
    try:
        if expected is None:
            baseline = copy.deepcopy(original)
            baseline['settings']['outputSelection'] = {SOURCE: {NAME: OUTPUTS}}
            expected = compile_one(binary, encode(baseline), evidence, 'original267-target')
        got = compile_one(binary, candidate, evidence, 'exact39-global')
        exact(expected, got)
        proof = {'schema': 'agijobsv0/escrow-offline-replay/1', 'utc': datetime.now(timezone.utc).isoformat(),
                 'chainId': 1, 'address': ADDRESS, 'sourceCommit': COMMIT, 'inputSha256': INPUT_SHA,
                 'inputBytes': len(candidate), 'sourceCount': 39, 'compilerSha256': SOLC_SHA,
                 'comparison': 'original-saved-build' if args.build_info else 'fresh-full267-native-replay',
                 'exactCreationRuntimeAbiMetadataLinksMethodsImmutableLayout': True,
                 'freshExplorerRead': False, 'freshChainRead': False, 'transactions': 0,
                 'sourceSubmissions': 0, 'productionApproved': False}
        (args.output_dir / 'StakeManagerEscrow-39sources-ETHERSCAN-v5.json').write_bytes(candidate)
        temporary_proof = args.output_dir / 'REPLAY_PROOF.json.tmp'
        temporary_proof.write_text(json.dumps(proof, indent=2) + '\n')
        temporary_proof.rename(args.output_dir / 'REPLAY_PROOF.json')
        print('EXACT_OFFLINE_REPLAY_MATCH — archival proof only; no live-service authorization.')
    except (Exception, KeyboardInterrupt):
        (args.output_dir / 'FAILED.txt').write_text('Replay did not complete. Diagnostics only; no verification or commissioning approval.\n')
        raise


if __name__ == '__main__':
    try:
        main()
    except (Exception, KeyboardInterrupt) as exc:
        print('STOP: ' + (str(exc).split('\n', 1)[0] or 'INTERRUPTED'), file=sys.stderr)
        sys.exit(1)
