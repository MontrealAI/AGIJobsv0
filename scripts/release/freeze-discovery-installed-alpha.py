# SPDX-License-Identifier: MIT
"""Prepare a separately reviewable immutable Alpha pin transition; never edit or publish source."""
import argparse
import json
import pathlib
import runpy
import stat

ROOT = pathlib.Path(__file__).resolve().parents[2]
P = runpy.run_path(str(ROOT/'scripts/release/discovery-installed-profile.py'))
B = runpy.run_path(str(ROOT/'scripts/release/discovery-installed-package.py'))


def proposal(root, selection, alpha_root, review_path, review_sha256, output):
    root, alpha_root, review_path, output = map(lambda value: pathlib.Path(value).resolve(),
                                               (root, alpha_root, review_path, output))
    P['require'](not output.exists() and not output.is_relative_to(root) and not output.is_relative_to(alpha_root),
                 'Pin proposal output must be absent and outside both source checkouts')
    source = P['readiness'](root, selection, require_git=True)
    P['require'](P['alpha_state'](root)['status'] == 'UNSET_PENDING_FINAL_REVIEWED_MAIN',
                 'Only the immutable unset predecessor can produce this transition')
    info = review_path.lstat()
    P['require'](stat.S_ISREG(info.st_mode) and info.st_size <= 1_000_000, 'A bounded reviewed record is required')
    raw = review_path.read_bytes()
    P['require'](P['sha'](raw) == review_sha256, 'Review bytes differ from the independently selected SHA-256')
    review = P['strict_json'](raw)
    P['require'](review.get('schema') == 'agijobsv0/discovery-alpha-source-review/v1'
                 and review.get('repository') == 'MontrealAI/AGI-Alpha-Agent-v0'
                 and review.get('decision') == 'ACCEPTED_FOR_INSTALLED_SOURCE'
                 and isinstance(review.get('evidence'), list) and review['evidence']
                 and all(isinstance(item, str) and item.startswith('https://github.com/MontrealAI/AGI-Alpha-Agent-v0/')
                         for item in review['evidence']), 'An exact case-specific Alpha source review is required')
    mode, catalog_raw = P['read'](alpha_root, B['CATALOG'])
    catalog = P['strict_json'](catalog_raw)
    P['require'](P['sha'](catalog_raw) == review['catalogSha256'] and catalog['sourceHash'] == review['sourceHash'],
                 'Reviewed catalog bytes differ')
    names = set(catalog['sources']) | {B['INSPECTOR'], 'LICENSE'}
    files, modes = {}, {}
    for name in sorted(names):
        file_mode, file_raw = P['read'](alpha_root, name)
        files[name], modes[name] = P['sha'](file_raw), file_mode
    pin = {'schema': 'agijobsv0/discovery-installed-alpha/v1', 'status': 'REVIEWED_FINAL_SOURCE',
           'repository': review['repository'], 'commit': review['commit'], 'tree': review['tree'],
           'sourceHash': review['sourceHash'], 'catalogPath': B['CATALOG'], 'catalogSha256': review['catalogSha256'],
           'catalogMode': mode, 'files': files, 'fileModes': modes,
           'qualification': 'PENDING_FINAL_SOURCE_NATIVE_COMPATIBILITY', 'reviewSha256': review_sha256}
    B['capture_alpha'](alpha_root, pin,
        helper_source=P['read'](root, 'integrations/alpha-agent/discovery-installed-module-graph.mjs')[1])
    pin_raw = (json.dumps(pin, indent=2)+'\n').encode()
    transition = {'schema': 'agijobsv0/discovery-alpha-pin-transition/v1', 'status': 'REVIEWED_PIN_PROPOSAL',
                  'fromPinSha256': P['UNSET_ALPHA_SHA256'], 'toPinSha256': P['sha'](pin_raw),
                  'reviewSha256': review_sha256, 'reviewRaw': raw.decode(),
                  'fromSource': {'tree': source['sourceTree'], 'manifestSha256': selection['manifestSha256'],
                                 'verifierSha256': selection['verifierSha256'],
                                 'scopeVerifierSha256': selection['scopeVerifierSha256']}}
    output.mkdir(mode=0o700, parents=True)
    (output/'discovery-installed-alpha-v1.json').write_bytes(pin_raw)
    (output/'discovery-installed-alpha-transition-v1.json').write_text(json.dumps(transition, indent=2)+'\n')
    result = {'schema': 'agijobsv0/discovery-alpha-pin-proposal/v1', 'state': 'SOURCE_REVIEW_PROPOSAL_NOT_INSTALLED',
              'fromSource': transition['fromSource'], 'alpha': {'commit': pin['commit'], 'tree': pin['tree'], 'sourceHash': pin['sourceHash']},
              'pinSha256': transition['toPinSha256'], 'reviewSha256': review_sha256,
              'requiredNextStep': 'Review and install both proposal files as an additive source commit, refreeze the exact finite source delta and external policy pins, then run original final-source producer/consumers and publication gates.',
              'authority': 'none', 'publicationApproved': False, 'externalExecution': 'unprovisioned'}
    (output/'proposal.json').write_text(json.dumps(result, indent=2)+'\n')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=pathlib.Path, default=ROOT)
    parser.add_argument('--alpha-root', type=pathlib.Path, required=True)
    parser.add_argument('--manifest-sha256', required=True)
    parser.add_argument('--verifier-sha256', required=True)
    parser.add_argument('--scope-verifier-sha256', required=True)
    parser.add_argument('--review', type=pathlib.Path, required=True)
    parser.add_argument('--review-sha256', required=True)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    print(json.dumps(proposal(args.root, P['select'](manifest_sha256=args.manifest_sha256,
        verifier_sha256=args.verifier_sha256, scope_verifier_sha256=args.scope_verifier_sha256), args.alpha_root, args.review, args.review_sha256, args.output), sort_keys=True))
