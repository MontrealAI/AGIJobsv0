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

ALPHA_615_PIN_SHA256 = '7b6ac047905dc27da219cb2608a92b590380bb2781d155afe15734af1173b0f3'
ALPHA_141_TARGET = {'commit': '031bdb5d055c8bad896daa076baea2b5e17b242c', 'tree': '330e0e58268ed32990f04278fc543c71db45fd46', 'sourceHash': '54769dbfde99ae13708a33292866f0ca7e6b8b7792a7a944f76bf2fbf1de1358', 'catalogSha256': 'd1c3cb9a5c3eb96e9e5eb111b83a713786ec18ed1213a407cd77bbaf018c5adb'}
ALPHA_615_TRANSITION_SHA256 = '0deb6eb67ee8e10d54d17ba6e3146b581c13909eb44bc9f801328adae7e9e47a'

def alpha141_successor_basis(pin_raw, transition_raw, review):
    P['require'](isinstance(pin_raw, bytes) and P['sha'](pin_raw) == ALPHA_615_PIN_SHA256,
                 'Alpha141 successor requires the exact reviewed615 predecessor pin')
    P['require'](isinstance(transition_raw, bytes)
                 and P['sha'](transition_raw) == ALPHA_615_TRANSITION_SHA256,
                 'Alpha141 successor requires the exact reviewed615 predecessor transition')
    P['require'](isinstance(review, dict)
                 and all(review.get(key) == value for key, value in ALPHA_141_TARGET.items())
                 and review.get('schema') == 'agijobsv0/discovery-alpha-source-review/v1'
                 and review.get('repository') == 'MontrealAI/AGI-Alpha-Agent-v0'
                 and review.get('decision') == 'ACCEPTED_FOR_INSTALLED_SOURCE'
                 and review.get('publicationApproved') is False
                 and review.get('installedCompatibilityAccepted') is False
                 and review.get('externalExecution') == 'unprovisioned',
                 'Alpha141 successor requires its exact source review without publication or installed acceptance')
    return ALPHA_615_PIN_SHA256


def proposal(root, selection, alpha_root, review_path, review_sha256, output, *, successor_alpha141=False):
    root, alpha_root, review_path, output = map(lambda value: pathlib.Path(value).resolve(),
                                               (root, alpha_root, review_path, output))
    P['require'](not output.exists() and not output.is_relative_to(root) and not output.is_relative_to(alpha_root),
                 'Pin proposal output must be absent and outside both source checkouts')
    source = P['readiness'](root, selection, require_git=True)
    predecessor = P['alpha_state'](root)
    P['require'](predecessor['status'] == ('REVIEWED_FINAL_SOURCE' if successor_alpha141
                                          else 'UNSET_PENDING_FINAL_REVIEWED_MAIN'),
                 'Select the original unset transition or the explicit reviewed615-to-Alpha141 successor')
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
    from_pin_sha256 = (alpha141_successor_basis(P['read'](root, P['ALPHA_PIN'])[1],
                       P['read'](root, P['ALPHA_TRANSITION'])[1], review)
                       if successor_alpha141 else P['UNSET_ALPHA_SHA256'])
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
                  'fromPinSha256': from_pin_sha256, 'toPinSha256': P['sha'](pin_raw),
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
    parser.add_argument('--successor-alpha141', action='store_true',
                        help='Prepare only the finite reviewed615-to-reviewed031b successor edition')
    args = parser.parse_args()
    print(json.dumps(proposal(args.root, P['select'](manifest_sha256=args.manifest_sha256,
        verifier_sha256=args.verifier_sha256, scope_verifier_sha256=args.scope_verifier_sha256), args.alpha_root, args.review, args.review_sha256, args.output,
        successor_alpha141=args.successor_alpha141), sort_keys=True))
