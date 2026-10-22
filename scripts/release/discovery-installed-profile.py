# SPDX-License-Identifier: MIT
"""Finite Jobs Discovery installed-profile preparation; never release approval."""
import argparse
import hashlib
import json
import os
import pathlib
import re
import stat
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[2]
REPOSITORY = 'MontrealAI/AGIJobsv0'
PROFILE = 'jobs-discovery-installed-v1'
PROPOSED_VERSION = '2.1.0-rc.18'
BASE_COMMIT = '83065adf18a6ee987f8fa479a496a052d35db682'
BASE_TREE = '77ded62b991e8cca28bfd849593153f61ac72d86'
PREREQUISITE = '792687d133863783d02972f543f1eaca257b9e9c'
PREREQUISITE_TREE = '16c29d934e8bb4d36d286fae7fbf3f9b9d506a85'
FEATURE = '5b85af62078d415c9ced2dd7aa959a0783c19d27'
RECONCILED_COMMIT = '75d38869ac281f764aa52ff3a45a12ba6faf31e9'
RECONCILED_TREE = 'fac37bef7c11f57a90fc49d2481a06167ccdc8aa'
BASELINE = 'config/discovery-lab-source-baseline-v1.json'
BASELINE_SHA256 = 'd7225ecab094653482593057be4b018e0c61dfb7c1c592baa134dc668fa81a65'
PREREQUISITE_MANIFEST = 'config/discovery-installed-prerequisite-v1.json'
PREREQUISITE_SHA256 = '9baa5157a1a8e972811a6e7f3108079743774794f732abdb782468d3a363a364'
MANIFEST = 'config/discovery-installed-candidate-v1.json'
VERIFIER = 'scripts/release/discovery-installed-profile.py'
SCOPE_VERIFIER = 'tools/security/discovery-installed-protected-scope.mjs'
ALPHA_PIN = 'config/discovery-installed-alpha-v1.json'
ALPHA_TRANSITION = 'config/discovery-installed-alpha-transition-v1.json'
UNSET_ALPHA_SHA256 = '01e32d5283b6858c977659701ab32c24a846b502adf1d1363c9f066d633e9207'
OWNER_REVIEW = 'config/discovery-installed-review-request-v1.json'
# Filled only after all finite preparation inputs have been inspected.
# BEGIN FIXED DISCOVERY INSTALLED DELTA
CHANGES = {'.github/codeql/config-discovery-installed-python.yml': {'after': {'mode': '100644',
                                                                    'sha256': '0e5134b9601637ddb78d7ddbc9457bacb69bf20ed0035a06de5f9827dcfadf76'},
                                                          'before': None,
                                                          'reason': 'Implement separately gated source-bound '
                                                                    'installed archive, immutable Alpha '
                                                                    'transition, operator, retained mission '
                                                                    'evidence and release qualification'},
 '.github/workflows/discovery-installed-preparation.yml': {'after': {'mode': '100644',
                                                                     'sha256': 'ce0ea5a82c09ef62a516ea1ff5d4c33b2405f5f949811ead7d7266ef9195ffa8'},
                                                           'before': None,
                                                           'reason': 'Implement separately gated '
                                                                     'source-bound installed archive, '
                                                                     'immutable Alpha transition, operator, '
                                                                     'retained mission evidence and release '
                                                                     'qualification'},
 '.github/workflows/discovery-installed-python-analysis.yml': {'after': {'mode': '100644',
                                                                         'sha256': '84f8c3dbc2ae03c26fc85d8d8f531e94fcec89e2cc4cf67f3df0010fd054b695'},
                                                               'before': None,
                                                               'reason': 'Implement separately gated '
                                                                         'source-bound installed archive, '
                                                                         'immutable Alpha transition, '
                                                                         'operator, retained mission '
                                                                         'evidence and release '
                                                                         'qualification'},
 '.github/workflows/discovery-installed-release.yml': {'after': {'mode': '100644', 'sha256': '53f2cbbf5bf319ffdcc30a59ba61e8c02f545de37f8aa1b5a00dbd253d7e825c'},
                                                       'before': None,
                                                       'reason': 'Retain the new source-selected producer, independently saved installer, two-runtime extracted consumers and separately reviewed publication route; pass the exact independently selected archive hash, bounded byte count and installed-manifest hash from original producer custody to both extracted operator and native commands, without deriving selection from extracted custody'},
 '.github/workflows/discovery-lab-receiver.yml': {'after': {'mode': '100644', 'sha256': 'ddbeb096fe08d61ecc321e2da90079d8432668b29af4f5340326bfc3daf6ea70'},
                                                  'before': None,
                                                  'reason': 'Preserve full-history checkout, actual installed source applicability and both original suites in order; append only exact owner2425 dependency-coherence and historical-ledger-prefix suites as ordinary changed-source qualification, retaining failures and all existing gates'},
 '.github/workflows/source-release-rc16.yml': {'after': {'mode': '100644',
                                                         'sha256': '803f353c14ce9b38db2acf7dd9750bdd37ae7b8ffa5066ab1da03d896cb51bec'},
                                               'before': {'blob': 'c718ae0e9d5297dade30711c3cafdbb2c29358ea',
                                                          'mode': '100644'},
                                               'reason': 'Dispatch rc18 to additional installed checks while '
                                                         'preserving the original rc17 suite and publisher'},
 'config/discovery-installed-alpha-transition-v1.json': {'after': {'mode': '100644', 'sha256': '0deb6eb67ee8e10d54d17ba6e3146b581c13909eb44bc9f801328adae7e9e47a'},
                                                         'before': None,
                                                         'reason': 'Install the unchanged separately generated Alpha61532 transition from immutable UNSET pin01e32 and exact predecessor Jobs treeb082 with its original M/V/scope identities; retain raw case-specific source review and no publication or installed-compatibility approval'},
 'config/discovery-installed-alpha-v1.json': {'after': {'mode': '100644', 'sha256': '7b6ac047905dc27da219cb2608a92b590380bb2781d155afe15734af1173b0f3'},
                                              'before': None,
                                              'reason': 'Install the separately reviewed exact Alpha61532 source pin and all43 captured source identities under review cd3966b4c547e890b1e2a7a2b1d9201ee89265f66595f98ead959cc952fabeee; retain pending original producer/native compatibility and false publication/execution authority'},
 'config/discovery-installed-browser-input-v1.json': {'after': {'mode': '100644', 'sha256': '3d1729b76bede5f93d4c8c7fdcdf7d5bfb8855dc7881a92606866cb55c885a26'},
                                                      'before': None,
                                                      'reason': 'Select only the successful exact Alpha61532 original browser packet and all11 raw member identities from common17 transport e31e74d1a5144973e6a22006dbe29ea628a80386, with exact custody/artifact metadata; retain same-mission native and fresh public qualification requirements without rebuilding originals'},
 'config/discovery-installed-module-graph-origin-v1.json': {'after': {'mode': '100644',
                                                                      'sha256': 'e3c62ccb5e8cb591a09d9857bbc5892edd530b7bada50b9d90bc234d5c88dd23'},
                                                            'before': None,
                                                            'reason': 'Implement separately gated '
                                                                      'source-bound installed archive, '
                                                                      'immutable Alpha transition, operator, '
                                                                      'retained mission evidence and release '
                                                                      'qualification'},
 'config/discovery-installed-prerequisite-v1.json': {'after': {'mode': '100644',
                                                               'sha256': '9baa5157a1a8e972811a6e7f3108079743774794f732abdb782468d3a363a364'},
                                                     'before': None,
                                                     'reason': 'Implement separately gated source-bound '
                                                               'installed archive, immutable Alpha '
                                                               'transition, operator, retained mission '
                                                               'evidence and release qualification'},
 'config/discovery-installed-publication-review-template-v1.json': {'after': {'mode': '100644',
                                                                              'sha256': 'cff78ea1f379e71a5f96be2ce5df1c03c4f58358dc074107936170564ee17e3a'},
                                                                    'before': None,
                                                                    'reason': 'Implement separately gated '
                                                                              'source-bound installed '
                                                                              'archive, immutable Alpha '
                                                                              'transition, operator, '
                                                                              'retained mission evidence and '
                                                                              'release qualification'},
 'config/discovery-installed-review-request-v1.json': {'after': {'mode': '100644',
                                                                 'sha256': 'a6a75cdcd8b41ed3ec85079fc74c798f24a4d3ad2e280ddf719df519b283551c'},
                                                       'before': None,
                                                       'reason': 'Implement separately gated source-bound '
                                                                 'installed archive, immutable Alpha '
                                                                 'transition, operator, retained mission '
                                                                 'evidence and release qualification'},
 'config/discovery-lab-alpha-source.json': {'after': {'mode': '100644',
                                                      'sha256': 'a463a01423d1b64fa9c5dc793716279890d02e1d4a004202fa3f63ac427dbbe9'},
                                            'before': None,
                                            'reason': 'Preserve exact Discovery receiver and finite '
                                                      'source-only controls through the prerequisite merge'},
 'config/discovery-lab-source-baseline-v1.json': {'after': {'mode': '100644',
                                                            'sha256': 'd7225ecab094653482593057be4b018e0c61dfb7c1c592baa134dc668fa81a65'},
                                                  'before': None,
                                                  'reason': 'Preserve exact Discovery receiver and finite '
                                                            'source-only controls through the prerequisite '
                                                            'merge'},
 'config/discovery-lab-source-candidate-v1.json': {'after': {'mode': '100644',
                                                             'sha256': 'ebee1b8c2bbdf2d7084d433296d6a4e1fe7bf54b9809e24b75947980e0b7550d'},
                                                   'before': None,
                                                   'reason': 'Preserve exact Discovery receiver and finite '
                                                             'source-only controls through the prerequisite '
                                                             'merge'},
 'docs/successor/DISCOVERY_INSTALLED_RELEASE.md': {'after': {'mode': '100644', 'sha256': '783d00ccc0e1d2137b853f3dcb57ab117da88ee123526b34d8e3728be7b6303d'},
                                                   'before': None,
                                                   'reason': 'Document the bounded installed local-review receiver, reviewed615 source and browser-input selection, independent archive hash/size/manifest runtime contract, machine-enforced Alpha public-asset acceptance and remaining exact-main/native/scanner/publication gates; preserve zero authority, incomplete-cost and deployment-observation limits and historical publisher evidence'},
 'docs/successor/DISCOVERY_LAB.md': {'after': {'mode': '100644',
                                               'sha256': '55e75ea1f35de29b2486d819c56e04ac042c6397225a3fbccb74f5435186dc4b'},
                                     'before': None,
                                     'reason': 'Preserve exact Discovery receiver and finite source-only '
                                               'controls through the prerequisite merge'},
 'hardhat.config.js': {'after': {'mode': '100644',
                                 'sha256': '738518441596cb1e6a9c691fa2c2ca68fc158a96f8856ab71f0ebc70ad0590b6'},
                       'before': {'blob': '8d201a5f8af39ccefa4970e6839584abcc1720ba', 'mode': '100644'},
                       'reason': 'Preserve exact Discovery receiver and finite source-only controls through '
                                 'the prerequisite merge'},
 'integrations/alpha-agent/DISCOVERY_MODULE_BOUNDARY_NOTICE.txt': {'after': {'mode': '100644',
                                                                             'sha256': '50c256613d65de0674a2d2a33052a224408d8f02fb6aaf090ac5661b31a12671'},
                                                                   'before': None,
                                                                   'reason': 'Include applicable license and '
                                                                             'pinned attribution for copied '
                                                                             'Apache module'},
 'integrations/alpha-agent/discovery-installed-module-graph-runtime.mjs': {'after': {'mode': '100644',
                                                                                     'sha256': 'ce8d370d494e347926838ee8d061ea303334b1b1b2e47b486985bd2306dc5feb'},
                                                                           'before': None,
                                                                           'reason': 'Implement separately '
                                                                                     'gated source-bound '
                                                                                     'installed archive, '
                                                                                     'immutable Alpha '
                                                                                     'transition, operator, '
                                                                                     'retained mission '
                                                                                     'evidence and release '
                                                                                     'qualification'},
 'integrations/alpha-agent/discovery-installed-module-graph.mjs': {'after': {'mode': '100644',
                                                                             'sha256': '8d3575ece582c158c30f3cc1c5f438b9b32ad2a31f190d6867acf9712beedad5'},
                                                                   'before': None,
                                                                   'reason': 'Implement separately gated '
                                                                             'source-bound installed '
                                                                             'archive, immutable Alpha '
                                                                             'transition, operator, retained '
                                                                             'mission evidence and release '
                                                                             'qualification'},
 'integrations/alpha-agent/discovery-installed-module-graph.test.mjs': {'after': {'mode': '100644',
                                                                                  'sha256': 'cf45166b92e7dd6cc618476bb78f340fce5a96ad66954cc1c1efa707b60c40cc'},
                                                                        'before': None,
                                                                        'reason': 'Implement separately '
                                                                                  'gated source-bound '
                                                                                  'installed archive, '
                                                                                  'immutable Alpha '
                                                                                  'transition, operator, '
                                                                                  'retained mission evidence '
                                                                                  'and release '
                                                                                  'qualification'},
 'integrations/alpha-agent/discovery-installed-native.mjs': {'after': {'mode': '100644', 'sha256': '22e3b32d639a114e83360a390a745a8e942169cc9e1367030f37cd784dda4343'},
                                                             'before': None,
                                                             'reason': 'Retain original exported primary mission plus separately constructed regression, exact raw inputs/receipts/dockets/costs and refusal evidence; require canonical CLI archive selection and thread the same independent hash/size/manifest tuple through both mission opens and every operator return, without replacing primary input or granting publication approval'},
 'integrations/alpha-agent/discovery-installed-native.test.mjs': {'after': {'mode': '100644', 'sha256': '99bba5301c9f30f6ada89ba9a1ee027ac949a2d975b3a282743825461d4acc32'},
                                                                  'before': None,
                                                                  'reason': 'Retain ordinary input/no-fallback/failure-retention controls; test mandatory canonical archive CLI hash/size selection and the actual workflow inline command with inert fs/process stand-ins to prove both callers use only saved original producer custody and original input aliases'},
 'integrations/alpha-agent/discovery-installed-operator.mjs': {'after': {'mode': '100644', 'sha256': 'bba31e025dbfc56187d61fdab6cefbe3cf826ebbeeb6de7bb2353530c1ddaf3e'},
                                                               'before': None,
                                                               'reason': 'Retain source-bound zero-cap status and same-history original-request receipt/docket return; require the same inert independently selected archive hash/size/manifest tuple in both API and CLI routes and thread it to installed capture without reading expected values from custody'},
 'integrations/alpha-agent/discovery-installed-runtime.mjs': {'after': {'mode': '100644', 'sha256': '98996a4bf688966e1554ddec2186286a30c4f5861ad0d2c6468c93c2f24276d9'},
                                                              'before': None,
                                                              'reason': 'Capture the complete bounded installed input set and imported module bytes; require inert independently selected archive hash, positive bounded safe-integer byte count and manifest hash; compare exact extraction custody schema/authority/state/tuple before returning frozen selected capsule provenance, with no manifest-only fallback or new execution authority'},
 'integrations/alpha-agent/discovery-installed-runtime.test.mjs': {'after': {'mode': '100644', 'sha256': 'd6b01a9db97f852fdae58ed7e1f686efd96a015f1e26f843447177a12e0af4ce'},
                                                                   'before': None,
                                                                   'reason': 'Retain bounded inventory and ordinary trusted receiver controls; add inert exact extraction provenance cases rejecting hash/size/schema/authority/state/field drift, omitted or coerced external selection and accessors/proxies before installed capture; no native or release approval'},
 'integrations/alpha-agent/discovery-lab-contract.mjs': {'after': {'mode': '100644',
                                                                   'sha256': '98c8de8ce2774b7650bf4ee11eeedfb0a69b75fa6d1b080ef823637d77d0ab47'},
                                                         'before': None,
                                                         'reason': 'Preserve exact Discovery receiver and '
                                                                   'finite source-only controls through the '
                                                                   'prerequisite merge'},
 'integrations/alpha-agent/discovery-lab-native-test.mjs': {'after': {'mode': '100644',
                                                                      'sha256': '21265da0be01079dbc5d83572fae716d4dd4cdcfb39b876c96ff01cb793216ee'},
                                                            'before': None,
                                                            'reason': 'Preserve exact Discovery receiver and '
                                                                      'finite source-only controls through '
                                                                      'the prerequisite merge'},
 'integrations/alpha-agent/discovery-lab-work-request.mjs': {'after': {'mode': '100644',
                                                                       'sha256': '337fabca02ece2a25b8cc50e56fea5bf5338f2b6f18343eb4a3353a634aefec4'},
                                                             'before': None,
                                                             'reason': 'Preserve exact Discovery receiver '
                                                                       'and finite source-only controls '
                                                                       'through the prerequisite merge'},
 'integrations/alpha-agent/discovery-lab-work-request.test.mjs': {'after': {'mode': '100644',
                                                                            'sha256': '799ab68c0077ffb7849133ee53d228928ef8d0e20000c813bb3cec30cff4a30d'},
                                                                  'before': None,
                                                                  'reason': 'Preserve exact Discovery '
                                                                            'receiver and finite source-only '
                                                                            'controls through the '
                                                                            'prerequisite merge'},
 'integrations/alpha-agent/fixtures/discovery-lab-request.json': {'after': {'mode': '100644',
                                                                            'sha256': '891e11f3fed142db55e36934b4f1b5869200973216bfdd9257789fd66fb0a82f'},
                                                                  'before': None,
                                                                  'reason': 'Preserve exact Discovery '
                                                                            'receiver and finite source-only '
                                                                            'controls through the '
                                                                            'prerequisite merge'},
 'package-lock.json': {'after': {'mode': '100644',
                                 'sha256': '7eb338f7e47973481f49f8e677beb02ec8513ad4ae6e5ef7f35edf3e6ba34f52'},
                       'before': {'blob': '49676e6284cfb6aee1e953338e702b55fc01b3be', 'mode': '100644'},
                       'reason': 'Preserve proposed rc18 metadata and the Next15.5.28 fixes for GHSA-2464-fhr4-w9xw and GHSA-p3m5-59mp-jv5r; patch only direct DOMPurify3.3.0 and nested3.4.16 to3.4.17 for GHSA-cg2g-xh64-v4q7 and GHSA-mrv2-3pqr-j5jr, deduplicating the compatible root node while preserving all seven protected contract/compiler dependency identities'},
 'package.json': {'after': {'mode': '100644',
                            'sha256': '2593efa7bd90eb75ab52eb9f935e7a62cbf614cee87d190eea84411d9618f856'},
                  'before': {'blob': 'd69a25b422673d9cb130be61fb45a9f4977317c9', 'mode': '100644'},
                  'reason': 'Preserve proposed rc18 metadata and the Next15.5.28 fixes for GHSA-2464-fhr4-w9xw and GHSA-p3m5-59mp-jv5r; patch only direct DOMPurify3.3.0 and nested3.4.16 to3.4.17 for GHSA-cg2g-xh64-v4q7 and GHSA-mrv2-3pqr-j5jr, deduplicating the compatible root node while preserving all seven protected contract/compiler dependency identities'},
 'scripts/release/capture-discovery-browser-input.cjs': {'after': {'mode': '100644',
                                                                   'sha256': '170ef450c718e6a54719a970939d68a3b46b443adb017eadf15e35ab6c7adcfe'},
                                                         'before': None,
                                                         'reason': 'Implement separately gated source-bound '
                                                                   'installed archive, immutable Alpha '
                                                                   'transition, operator, retained mission '
                                                                   'evidence and release qualification'},
 'scripts/release/capture-discovery-browser-input.test.cjs': {'after': {'mode': '100644',
                                                                        'sha256': 'bcb2c40c4fb14380cd95639fdea2a140ff27fb13d7bcb9ef1802f57077d9f897'},
                                                              'before': None,
                                                              'reason': 'Implement separately gated '
                                                                        'source-bound installed archive, '
                                                                        'immutable Alpha transition, '
                                                                        'operator, retained mission evidence '
                                                                        'and release qualification'},
 'scripts/release/discovery-browser-packet-fixtures.cjs': {'after': {'mode': '100644',
                                                                     'sha256': '362a7308a78abf086c047dd5e0be3a522f0c28675f4e50eba76d5c14ec37b2dd'},
                                                           'before': None,
                                                           'reason': 'Add inert shared packet metadata '
                                                                     'fixtures without browser or native '
                                                                     'qualification claims'},
 'scripts/release/discovery-installed-package.py': {'after': {'mode': '100644', 'sha256': 'deb3a9631eddcbb8588c1f9532e17393c434c5f185c10e43604a4f76ac4a3d24'},
                                                    'before': None,
                                                    'reason': 'Retain the deterministic installed archive builder, complete source/Alpha capture, manifest and standalone installer provenance; update only generated README instructions to require the authenticated original archive hash and byte count alongside installed-manifest hash'},
 'scripts/release/discovery-installed-qualification.cjs': {'after': {'mode': '100644', 'sha256': 'd6c5ac4e79280e8aa10a3444b6335c1ca4b0c153f015262a460eb30913fafbd3'},
                                                           'before': None,
                                                           'reason': 'Retain original actual-main producer, two-runtime native/raw/browser/source/scanner/review qualification and fresh leased publication checks; require all97 fixed reviewed Alpha615 version1.38.0 outputs plus every declared distribution/validation pack and source/attempt/main-branch-bound successful package/pages/publish jobs before and after anonymous public-byte acceptance, retaining checksum/manifest/provenance and operator catalog/source-body bridge without authenticated-artifact substitution'},
 'scripts/release/discovery-installed-release-dispatch.cjs': {'after': {'mode': '100644',
                                                                        'sha256': 'b28b8c29c54abadbe41a22a2ba6e9647a99d70892d61c730497e4fa722bac3bb'},
                                                              'before': None,
                                                              'reason': 'Implement separately gated '
                                                                        'source-bound installed archive, '
                                                                        'immutable Alpha transition, '
                                                                        'operator, retained mission evidence '
                                                                        'and release qualification'},
 'scripts/release/discovery-installed-release.test.cjs': {'after': {'mode': '100644', 'sha256': '563acaa36d0acc56da446fc4c4f399e10f68c625e1b662ba5b7e761a52cb8f22'},
                                                          'before': None,
                                                          'reason': 'Retain all33 existing inert release test bodies; add24 ordinary source-specific Alpha615 asset, selected-attempt main-branch job and whole-publication cases, including independent literal97-name equality, paginated inert payloads and consistent omission/refusal controls, without claiming executed tests or actual public downloads'},
 'scripts/release/discovery-lab-profile.py': {'after': {'mode': '100644',
                                                        'sha256': '4da6958cd88f4e596aaa5947f398d2367009bb9bfe487fcfa1d0bf17b4cd348b'},
                                              'before': None,
                                              'reason': 'Preserve exact Discovery receiver and finite '
                                                        'source-only controls through the prerequisite '
                                                        'merge'},
 'scripts/release/freeze-discovery-installed-alpha.py': {'after': {'mode': '100644',
                                                                   'sha256': '29eca508788d58a09afdfa1b4874676dbb688a4529b75e1a6d65fad15b909613'},
                                                         'before': None,
                                                         'reason': 'Implement separately gated source-bound '
                                                                   'installed archive, immutable Alpha '
                                                                   'transition, operator, retained mission '
                                                                   'evidence and release qualification'},
 'scripts/release/install-discovery-installed.py': {'after': {'mode': '100644',
                                                              'sha256': '0e5c5fd49530a55f1e6f14531ede72e143bd1d5b29029ae8c9adc610b48337c2'},
                                                    'before': None,
                                                    'reason': 'Implement separately gated installed runtime '
                                                              'and independently authenticated standalone '
                                                              'bootstrap'},
 'scripts/release/publish-discovery-installed.cjs': {'after': {'mode': '100644',
                                                               'sha256': '49b5fdb589e4498a5fa12bb5e1ffc4b0ed265acff9f6e34f8244934beebd4ce5'},
                                                     'before': None,
                                                     'reason': 'Implement separately gated source-bound '
                                                               'installed archive, immutable Alpha '
                                                               'transition, operator, retained mission '
                                                               'evidence and release qualification'},
 'scripts/release/test-discovery-installed-archive.py': {'after': {'mode': '100644',
                                                                   'sha256': '41800950cd4d7f4ed9e7d89ead7fb3112b54d138ee4dc4b79790188e2dce85cd'},
                                                         'before': None,
                                                         'reason': 'Implement separately gated source-bound '
                                                                   'installed archive, immutable Alpha '
                                                                   'transition, operator, retained mission '
                                                                   'evidence and release qualification'},
 'scripts/release/test-discovery-installed-profile.py': {'after': {'mode': '100644',
                                                                   'sha256': '00788d5c5ee27570ac6e95b7f2805493e9f8c642b402285380f01703203e8177'},
                                                         'before': None,
                                                         'reason': 'Implement separately gated source-bound '
                                                                   'installed archive, immutable Alpha '
                                                                   'transition, operator, retained mission '
                                                                   'evidence and release qualification'},
 'scripts/release/test-discovery-lab-profile.py': {'after': {'mode': '100644',
                                                             'sha256': '2e85aff37de2a4952b3b2daa38f93aaf8534403d55bd476a7486fe8f52481e43'},
                                                   'before': None,
                                                   'reason': 'Preserve the ordinary Discovery source-profile negative cases while removing an unused copy import and using assertNotEqual for the existing byte-inequality assertion; resolve true Python quality findings without changing legacy profile, publisher, qualifier, query or accepted-record bodies'},
 'test/scripts/hardhat-test-discovery.test.cjs': {'after': {'mode': '100644',
                                                            'sha256': 'dead1e8aed0c87c0664261d1ed7956fa5bff0c9949bafc7eedcb638cf28114d7'},
                                                  'before': {'blob': '491f41a628672b817995f4ef5e4a0959c80db940',
                                                             'mode': '100644'},
                                                  'reason': 'Preserve exact Discovery receiver and finite '
                                                            'source-only controls through the prerequisite '
                                                            'merge'},
 'test/security/discovery-protected-scope.test.mjs': {'after': {'mode': '100644',
                                                                'sha256': '725d0fd5683e491aff69d34e64dda4392924aefb9bac7889cba830f834b86927'},
                                                      'before': None,
                                                      'reason': 'Preserve exact Discovery receiver and '
                                                                'finite source-only controls through the '
                                                                'prerequisite merge'},
 'tools/security/discovery-installed-protected-scope.test.mjs': {'after': {'mode': '100644',
                                                                           'sha256': 'd3c8d813e5f51d7d3d340ae2e5745d4f877f5bcf07fc0d01189df8938a7d5af5'},
                                                                 'before': None,
                                                                 'reason': 'Add separate complete '
                                                                           'committed-source scanner scope '
                                                                           'for the installed edition '
                                                                           'without weakening historical '
                                                                           'scope'},
 'tools/security/discovery-protected-scope.mjs': {'after': {'mode': '100644',
                                                            'sha256': 'f27bea8586e5d6d11047cb2daa832b618cd186b115525d96da38e9aa4d90d765'},
                                                  'before': None,
                                                  'reason': 'Preserve exact Discovery receiver and finite '
                                                            'source-only controls through the prerequisite '
                                                            'merge'},
 'tools/security/validate-codeql-remediation.mjs': {'after': {'mode': '100644', 'sha256': '882377fba4d0370da65d7150bdbb58d3a2152493b6eb290f81c33580524e0cd5'},
                                                    'before': {'blob': '9657ecd2c072276276079e55fde51c5b66b8b37c',
                                                               'mode': '100644'},
                                                    'reason': 'Compose exact owner2425 immutable committed ledger edition/source selection and explicit original historical prefix helper/closure while preserving the historical query/archive/disposition/deployed assertion block and protected predicate; keep all source/native/release/publication approvals false'},
 'scripts/security/check-dependency-preservation.cjs': {'after': {'mode': '100644', 'sha256': 'a62bd276f37d6cd9177f5098ae5fae2ae80b5a6322ecb56d886117937c43059d'},
                                                        'before': {'blob': 'e697e1504a9649dfabfd8746a188bf66725f654b',
                                                                   'mode': '100644'},
                                                        'reason': 'Retain owner2425 committed edition/source/control selection, offline authenticated Git object capture, exact original ba67 generator and all transport refusals; prove exclusive ownership and unchanged link/ordinary dependency-target identity plus baseline HEAD/index before removing only the provisioning symlink created by this invocation before the unfiltered complete generated-source comparison; recheck all seven protected lock identity triplets and retain final source/index/byte/mode proofs'},
 'apps/enterprise-portal/package-lock.json': {'after': {'mode': '100644',
                                                        'sha256': 'f8f6cfa0094d4581a628019f6eb4011519243a370031d8e7bc37eb02e40aea29'},
                                              'before': {'blob': '85295a87f758c5c22a39fa7a77e499be71b06a5d',
                                                         'mode': '100644'},
                                              'reason': 'Patch the exact Next15.5.28 dependency '
                                                        'graph for GHSA-2464-fhr4-w9xw and '
                                                        'GHSA-p3m5-59mp-jv5r while preserving '
                                                        'contract/compiler dependencies'},
 'apps/enterprise-portal/package.json': {'after': {'mode': '100644',
                                                   'sha256': '83b3c0c65b527ff2b1f97f9ec20bb8fbe8a5f10a29f0fe338cc74dead921a476'},
                                         'before': {'blob': '2629eb35c1a52eb90ccd0f7ade18c4705f079c31',
                                                    'mode': '100644'},
                                         'reason': 'Patch the exact Next15.5.28 dependency graph '
                                                   'for GHSA-2464-fhr4-w9xw and '
                                                   'GHSA-p3m5-59mp-jv5r while preserving '
                                                   'contract/compiler dependencies'},
 'apps/onebox/package-lock.json': {'after': {'mode': '100644',
                                             'sha256': '676115c8943454ff3a9843cc4b3abd383a2bbd981708a3edcacdd71e18956907'},
                                   'before': {'blob': '0fbb3e3406f94cbc4a61721db924685bc8824644',
                                              'mode': '100644'},
                                   'reason': 'Preserve the exact Next15.5.28 fixes for GHSA-2464-fhr4-w9xw and GHSA-p3m5-59mp-jv5r; patch only transitive DOMPurify3.4.16 to3.4.17 for GHSA-cg2g-xh64-v4q7 and GHSA-mrv2-3pqr-j5jr while preserving contract/compiler dependencies'},
 'apps/onebox/package.json': {'after': {'mode': '100644',
                                        'sha256': 'd3700df816d22e593a0ab53ae10b043c6aaa822f4ac8987ab81966c294d52a4f'},
                              'before': {'blob': '97930338ea29bb0e273d4721d99d2c6b92f992c1',
                                         'mode': '100644'},
                              'reason': 'Patch the exact Next15.5.28 dependency graph for '
                                        'GHSA-2464-fhr4-w9xw and GHSA-p3m5-59mp-jv5r while '
                                        'preserving contract/compiler dependencies'},
 'apps/validator-ui/package-lock.json': {'after': {'mode': '100644',
                                                   'sha256': '4a24b40c41f884a98c863fc908b5ee1f9f22301994f29652cf5d45cab6c58363'},
                                         'before': {'blob': 'a9226f713f46772dbd2ad8e83dba17c657dc50f3',
                                                    'mode': '100644'},
                                         'reason': 'Patch the exact Next15.5.28 dependency graph '
                                                   'for GHSA-2464-fhr4-w9xw and '
                                                   'GHSA-p3m5-59mp-jv5r while preserving '
                                                   'contract/compiler dependencies'},
 'apps/validator-ui/package.json': {'after': {'mode': '100644',
                                              'sha256': 'bde0a9c7113c0c85a731fca975eb610353da82f8eb3dbac4a093ea9402d50a11'},
                                    'before': {'blob': '25389692413880af3d964ef79dc1994628c8f044',
                                               'mode': '100644'},
                                    'reason': 'Patch the exact Next15.5.28 dependency graph for '
                                              'GHSA-2464-fhr4-w9xw and GHSA-p3m5-59mp-jv5r while '
                                              'preserving contract/compiler dependencies'},
 'scripts/security/test/dependency-preservation.test.cjs': {'after': {'mode': '100644',
                                                                      'sha256': '1fd3d3bc825a3f1532504b65a660283bcf1a850cf8422a6a0cdc1d5a78015b02'},
                                                            'before': {'blob': '3d0fd583d31bbb9c39c061326f845e1520346c43',
                                                                       'mode': '100644'},
                                                            'reason': 'Prove exact committed '
                                                                      'source separately from '
                                                                      'reproduced generated '
                                                                      'outputs and reject '
                                                                      'unrelated tracked drift'},
 'demo/CULTURE-v0/indexers/culture-graph-indexer/package.json': {'after': {'mode': '100644',
           'sha256': 'cfd61d853a17190b4a10513a396b5c6dfebff444b95eb09f32bc19a95ef02886'},
 'before': {'blob': 'c91b3f2d6f11ad0a0b0bde788ddfcb33a773db97', 'mode': '100644'},
 'reason': 'Patch only the CULTURE indexer Fastify5.12.5 to5.12.6 for GHSA-389g-gv7q-r4x8 and '
           'transitive ip-address10.7.3 to10.7.4 for GHSA-rxp7-6hxx-x8q5, with matching npm/pnpm '
           'lock records; preserve existing strict high/critical and failed-command audit checks, '
           'protected contract/compiler identities and legacy release bodies'},
 'demo/CULTURE-v0/indexers/culture-graph-indexer/package-lock.json': {'after': {'mode': '100644',
           'sha256': '3a7cdbcb2c27a33d69f6692ba7752437ed00e76a551a8e328bfab8e23c4dd04a'},
 'before': {'blob': '60ba190dbb77b0396d2691390b24eb5484386293', 'mode': '100644'},
 'reason': 'Patch only the CULTURE indexer Fastify5.12.5 to5.12.6 for GHSA-389g-gv7q-r4x8 and '
           'transitive ip-address10.7.3 to10.7.4 for GHSA-rxp7-6hxx-x8q5, with matching npm/pnpm '
           'lock records; preserve existing strict high/critical and failed-command audit checks, '
           'protected contract/compiler identities and legacy release bodies'},
 'demo/CULTURE-v0/pnpm-lock.yaml': {'after': {'mode': '100644',
           'sha256': '7b53e70de7fcd06328d0c4deeaf7c3270c67ddc6a3447ef6a72102ad3c1f3e1c'},
 'before': {'blob': '6023dfd3e6f38c274d268cc5a04db53c9acfdaef', 'mode': '100644'},
 'reason': 'Patch only the CULTURE indexer Fastify5.12.5 to5.12.6 for GHSA-389g-gv7q-r4x8 and '
           'transitive ip-address10.7.3 to10.7.4 for GHSA-rxp7-6hxx-x8q5, with matching npm/pnpm '
           'lock records; preserve existing strict high/critical and failed-command audit checks, '
           'protected contract/compiler identities and legacy release bodies'},
 'apps/console/Dockerfile': {'before': {'blob': '1b8750888b261d5ab8091f95c601ab3d4bfb200a', 'mode': '100644'},
 'after': {'mode': '100644',
           'sha256': 'b3e3025fa3c0b177be45c1a837d7295fbae2d4b3b0ab6098ac5001a6dd27d48c'},
 'reason': 'Patch only the console nginx runner to official1.30.6-alpine3.24 '
           'digest47928bf67eb62a1863cb08d9ecb52d3e704304ba614eaee17884204677702951 and require '
           'nginx>=1.30.6-r0 for CVE-2026-15176/CVE-2026-93479/CVE-2026-97205; preserve libx11 '
           'minimum and strict OS scan while checking nginx configuration and built static index'},
 '.github/workflows/dependency-repair.yml': {'before': {'blob': '1107d44e44ea9ab1b9467eb42eacb7c7e515bbb8', 'mode': '100644'},
 'after': {'mode': '100644',
           'sha256': '7f52b2cfa962332fdf532e00a0e103be1c7ea25c9a22a26fabfd2a505fd7c48c'},
 'reason': 'Retain exact-head all22 production audit, CULTURE path triggers, compatibility surfaces, thresholds and failed-command retention; write only workflow harness evidence to owned runner scratch, read both audit JSON outputs there and stage original artifact-relative report/SBOM/screenshot paths outside authenticated source; execute existing audit regression file in the library surface without filtering generated-source or weakening any guard'},
 'test/scripts/dependency-audit.test.cjs': {'before': {'blob': '90f14f656ca7b6d0e47e182601cfc7c8c0bcb40f', 'mode': '100644'},
 'after': {'mode': '100644',
           'sha256': '4f892ed1a5b519bf72b6bd0e71dda79052bcb5c355809790559d4ba27f337a7a'},
 'reason': 'Retain all7 strict audit and CULTURE workflow test bodies; add two ordinary inert harness/reader cases proving scratch-only output, positive and failed log retention, unchanged logical artifact paths, mandatory source/generated commands and severity/error refusal, without claiming local execution or release approval'},
 'test/scripts/discovery-installed-dependency-preservation.test.cjs': {'before': None,
 'after': {'mode': '100644', 'sha256': '65e762d17116c38ea619ec88cedfec1d542788b98fdeef28ed8edfecf3057090'},
 'reason': 'Retain all26 prior owned dependency/source/capture fixture bodies; add three ordinary owned cases reproducing Git directory-ignore versus provisioning-symlink inventory, exact owned-link cleanup with generated output retained, changed link/target/index refusal and arbitrary node_modules source refusal; no product/native/release approval or executed-test claim'},
 'tools/security/discovery-installed-ledger-prefix.mjs': {'before': None,
 'after': {'mode': '100644',
           'sha256': '7803b4eef32c4ad7bcd6552b7ee652ba7ba5c94c18e1b7b864ec3b5cfc30bee3'},
 'reason': 'Compose exact owner2425 separate historical ledger proof: immutable '
           'original6a181/83065 set/mode/blob prefix, exactly288 protected originals, '
           'independently derived regular additions, exact typed source scope and HEAD/index '
           'closure; retain unchanged ledger/query/archive/disposition/deployment bodies'},
 'tools/security/discovery-installed-ledger-prefix.test.mjs': {'before': None,
 'after': {'mode': '100644',
           'sha256': '652f16ba1eb1b1d6cb8d2945604d56614799388c95474838bc5355085e4174fd'},
 'reason': 'Retain exact owner2425 injected-reader ledger-prefix controls for complete historical '
           'identities, strict current source/admission metadata, regular additions and immutable '
           'closure, without external process/network or owner/release qualification claims'}}
# END FIXED DISCOVERY INSTALLED DELTA
DENIALS = {'releaseQualified': False, 'publicationApproved': False,
           'executionApproved': False, 'settlementApproved': False}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def blob(raw):
    return hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()


def exact(value, keys):
    return isinstance(value, dict) and set(value) == set(keys)


def same(left, right):
    return json.dumps(left, sort_keys=True, separators=(',', ':'), allow_nan=False) == json.dumps(
        right, sort_keys=True, separators=(',', ':'), allow_nan=False)


def strict_json(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'Duplicate installed-profile JSON key')
            result[key] = value
        return result
    def constant(value):
        raise ValueError('Nonfinite installed-profile number: ' + value)
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=constant)


def safe_path(name):
    return isinstance(name, str) and name and not name.startswith('/') and '\\' not in name and all(
        part and part not in ('.', '..', '.git') for part in name.split('/')) and not any(ord(c) < 32 for c in name)


def read(root, name):
    require(safe_path(name), 'Unsafe installed source path')
    root = pathlib.Path(root)
    target = root / name
    parent = target.parent
    while parent != root:
        require(not parent.is_symlink(), 'Indirect source ancestor')
        parent = parent.parent
    if target.is_symlink():
        return '120000', os.readlink(target).encode()
    fd = os.open(target, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and before.st_size <= 32_000_000, 'Unbounded or nonregular source')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            raw = stream.read(before.st_size + 1)
        after = os.fstat(fd)
        require(len(raw) == before.st_size and all(getattr(before, key) == getattr(after, key) for key in
                ('st_dev', 'st_ino', 'st_mode', 'st_size', 'st_mtime_ns', 'st_ctime_ns')), 'Source changed during capture')
        current = target.stat(follow_symlinks=False)
        require(current.st_dev == before.st_dev and current.st_ino == before.st_ino and current.st_mode == before.st_mode,
                'Source identity changed during capture')
        return ('100755' if before.st_mode & 0o111 else '100644'), raw
    finally:
        os.close(fd)


def tree_digest(entries):
    tree = {}
    for name, item in entries.items():
        require(safe_path(name) and exact(item, ('mode', 'blob')) and item['mode'] in ('100644', '100755', '120000')
                and re.fullmatch('[0-9a-f]{40}', item['blob']), 'Invalid baseline Git entry')
        node = tree
        parts = name.split('/')
        for part in parts[:-1]:
            node = node.setdefault(part, {})
            require('blob' not in node, 'Baseline path collision')
        require(parts[-1] not in node, 'Baseline path collision')
        node[parts[-1]] = item
    def encode(node):
        raw = b''
        for name in sorted(node, key=lambda key: key.encode() + (b'/' if 'blob' not in node[key] else b'')):
            item = node[name]
            mode, digest = (item['mode'], item['blob']) if 'blob' in item else ('40000', encode(item))
            raw += mode.encode() + b' ' + name.encode() + b'\0' + bytes.fromhex(digest)
        return hashlib.sha1(b'tree ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
    return encode(tree)


def prerequisite_inventory(root):
    raw = read(root, BASELINE)[1]
    require(sha(raw) == BASELINE_SHA256, 'Original Discovery baseline bytes changed')
    base = strict_json(raw)
    require(base['repository'] == REPOSITORY and base['commit'] == BASE_COMMIT and base['tree'] == BASE_TREE
            and tree_digest(base['entries']) == BASE_TREE, 'Original main baseline identity differs')
    raw = read(root, PREREQUISITE_MANIFEST)[1]
    require(sha(raw) == PREREQUISITE_SHA256, 'Fixed prerequisite projection differs')
    record = strict_json(raw)
    require(exact(record, ('schema', 'repository', 'baseCommit', 'baseTree', 'commit', 'tree', 'ownerHeads', 'qualification', 'changes'))
            and record['schema'] == 'agijobsv0/discovery-prerequisite-projection/v1'
            and record['repository'] == REPOSITORY and record['baseCommit'] == BASE_COMMIT and record['baseTree'] == BASE_TREE
            and record['commit'] == PREREQUISITE and record['tree'] == PREREQUISITE_TREE
            and record['ownerHeads'] == ['d27d752cf552bc7f45108c962b6501d912d1e715', PREREQUISITE]
            and record['qualification'] == 'OWNER_STACK_NOT_YET_MAIN_RELEASE_QUALIFIED', 'Prerequisite source identity differs')
    expected = {name: dict(item) for name, item in base['entries'].items()}
    for name, change in record['changes'].items():
        require(safe_path(name) and exact(change, ('before', 'after')) and expected.get(name) == change['before'],
                'Prerequisite original Git entry differs')
        if change['after'] is None:
            del expected[name]
        else:
            expected[name] = change['after']
    require(tree_digest(expected) == PREREQUISITE_TREE, 'Prerequisite projection does not reconstruct the complete owner tree')
    return expected


def select(*, manifest_sha256, verifier_sha256, scope_verifier_sha256, profile=PROFILE):
    require(profile == PROFILE and all(isinstance(value, str) and re.fullmatch('[0-9a-f]{64}', value)
            for value in (manifest_sha256, verifier_sha256, scope_verifier_sha256)), 'Explicit externally reviewed installed-profile pins are required')
    return {'profile': PROFILE, 'manifestSha256': manifest_sha256, 'verifierSha256': verifier_sha256,
            'scopeVerifierSha256': scope_verifier_sha256}


def inventory(root, selection):
    require(selection == select(manifest_sha256=selection.get('manifestSha256'), verifier_sha256=selection.get('verifierSha256'),
                                            scope_verifier_sha256=selection.get('scopeVerifierSha256')),
            'Installed-profile selection fields differ')
    require(sha(read(root, VERIFIER)[1]) == selection['verifierSha256'], 'Installed-profile verifier differs')
    require(sha(read(root, SCOPE_VERIFIER)[1]) == selection['scopeVerifierSha256'], 'Installed scope policy differs')
    raw = read(root, MANIFEST)[1]
    require(sha(raw) == selection['manifestSha256'], 'Installed-profile manifest differs')
    manifest = strict_json(raw)
    require(exact(manifest, ('schema', 'repository', 'profile', 'proposedVersion', 'versionReservation', 'state',
                            'prerequisite', 'feature', 'reconciledTree', 'changes', 'decisions', 'denials'))
            and manifest['schema'] == 'agijobsv0/discovery-installed-profile/v1' and manifest['repository'] == REPOSITORY
            and manifest['profile'] == PROFILE and manifest['proposedVersion'] == PROPOSED_VERSION
            and manifest['versionReservation'] == 'UNRESERVED_PROPOSAL'
            and manifest['state'] == 'LOCAL_PREPARATION_NOT_APPROVED'
            and manifest['prerequisite'] == PREREQUISITE and manifest['feature'] == FEATURE
            and manifest['reconciledTree'] == RECONCILED_TREE and same(manifest['denials'], DENIALS),
            'Installed-profile identity, preparation scope or authority differs')
    require(manifest['decisions'] == {'qualifiedPrerequisiteMain': None, 'finalAlphaPinReview': None,
            'currentScannerAcceptance': None, 'qualityOwnerDisposition': None, 'exactSourceHostedQualification': None,
            'publicationApproval': None}, 'Unreviewed decision cannot be installed by preparation metadata')
    require(manifest['changes'] == CHANGES and CHANGES, 'Exact fixed installed-source delta differs')
    expected = prerequisite_inventory(root)
    for name, change in CHANGES.items():
        require(safe_path(name) and exact(change, ('before', 'after', 'reason'))
                and expected.get(name) == change['before'] and isinstance(change['reason'], str) and change['reason'].strip(),
                'Installed-source before entry or attribution differs')
        require(exact(change['after'], ('mode', 'sha256')) and change['after']['mode'] in ('100644', '100755')
                and re.fullmatch('[0-9a-f]{64}', change['after']['sha256']), 'Installed-source after identity differs')
        expected[name] = change['after']
    expected[MANIFEST] = {'mode': '100644', 'sha256': selection['manifestSha256']}
    expected[VERIFIER] = {'mode': '100644', 'sha256': selection['verifierSha256']}
    expected[SCOPE_VERIFIER] = {'mode': '100644', 'sha256': selection['scopeVerifierSha256']}
    return expected


def validate_source(root, selection, paths=None):
    root = pathlib.Path(root).resolve()
    expected = inventory(root, selection)
    directories = {parent.as_posix() for name in expected for parent in pathlib.PurePosixPath(name).parents
                   if parent.as_posix() != '.'}
    observed, pending, visited = set(), [(root, '')], 0
    while pending:
        directory, prefix = pending.pop()
        with os.scandir(directory) as entries:
            for entry in entries:
                if not prefix and entry.name == '.git':
                    continue
                visited += 1
                require(visited <= len(expected) + len(directories), 'Installed-source inventory has missing or unexpected inputs')
                name = prefix + entry.name
                require(safe_path(name), 'Unsafe installed source path')
                info = entry.stat(follow_symlinks=False)
                if stat.S_ISDIR(info.st_mode):
                    require(name in directories, 'Installed-source inventory has missing or unexpected directories')
                    pending.append((root/name, name+'/'))
                else:
                    require(stat.S_ISREG(info.st_mode), 'Nonregular installed source input is unsupported: '+name)
                    observed.add(name)
    require(paths is None or set(paths) == observed, 'Supplied paths cannot hide installed source')
    actual = observed
    require(actual == set(expected), 'Installed-source inventory has missing or unexpected inputs')
    observed_entries = {}
    source_bytes = 0
    for name, item in expected.items():
        mode, raw = read(root, name)
        require(mode == item['mode'] and (sha(raw) if 'sha256' in item else blob(raw)) == item.get('sha256', item.get('blob')),
                'Installed-source bytes or mode differ: ' + name)
        observed_entries[name] = {'mode': mode, 'blob': blob(raw)}
        source_bytes += len(raw)
    return {'profile': PROFILE, 'proposedVersion': PROPOSED_VERSION, 'inputCount': len(expected),
            'prerequisiteSource': PREREQUISITE, 'reconciledTree': RECONCILED_TREE,
            'sourceTree': tree_digest(observed_entries),
            'sourceBytes': source_bytes,
            'sourceCostSemantics': 'Unique authenticated input bytes; repeated metadata reads and Python/Git resources are not fully calibrated.',
            'state': 'LOCAL_SOURCE_VALIDATED_RELEASE_NOT_QUALIFIED', **DENIALS}


def validate_tracked_source(root, selection):
    """Scanner-only complete committed source proof; generated outputs are outside its scope."""
    root = guard_git_metadata(pathlib.Path(root).resolve())
    expected = inventory(root, selection)
    env = {key: value for key, value in os.environ.items() if not key.startswith('GIT_')}
    env.update(GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_SYSTEM=os.devnull, GIT_CONFIG_GLOBAL=os.devnull,
               GIT_NO_REPLACE_OBJECTS='1', GIT_NO_LAZY_FETCH='1', GIT_OPTIONAL_LOCKS='0', GIT_ALLOW_PROTOCOL='',
               GIT_PROTOCOL_FROM_USER='0', GIT_TERMINAL_PROMPT='0', GIT_ATTR_NOSYSTEM='1')
    actual = subprocess.check_output(['git', '--no-replace-objects', '--no-pager', '-C', str(root),
        '-c', 'protocol.allow=never', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath='+os.devnull,
        '-c', 'core.attributesFile='+os.devnull, 'ls-files', '--cached', '-z'], env=env, timeout=30).decode().rstrip('\0').split('\0')
    require(len(actual) == len(set(actual)) and set(actual) == set(expected),
            'Actual complete tracked source differs from installed finite profile')
    entries, source_bytes = {}, 0
    for name, item in expected.items():
        mode, raw = read(root, name)
        require(mode == item['mode'] and (sha(raw) if 'sha256' in item else blob(raw)) == item.get('sha256', item.get('blob')),
                'Tracked installed source bytes or mode differ: '+name)
        entries[name] = {'mode': mode, 'blob': blob(raw)}
        source_bytes += len(raw)
    source = {'profile': PROFILE, 'proposedVersion': PROPOSED_VERSION, 'inputCount': len(expected),
              'prerequisiteSource': PREREQUISITE, 'reconciledTree': RECONCILED_TREE, 'sourceTree': tree_digest(entries),
              'sourceBytes': source_bytes, 'state': 'TRACKED_SCANNER_SCOPE_ONLY',
              'generatedFilesOutOfScope': True, 'packageSourceProofRequiredSeparately': True, **DENIALS}
    return validate_git_source(root, source)


def guard_git_metadata(root):
    """Inspect inert local metadata before Git can read an object or refresh an index."""
    root = pathlib.Path(root).resolve()
    metadata = root / '.git'
    require(not metadata.is_symlink() and metadata.is_dir(), 'An independent ordinary Git checkout is required')
    require(not any(os.path.lexists(metadata/name) for name in ('commondir', 'gitdir')),
            'Shared or redirected Git administrative roots are outside the source profile')
    config = metadata / 'config'
    fd = os.open(config, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_size <= 128_000, 'Bounded regular Git configuration is required')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            raw = stream.read(info.st_size + 1)
        after = os.fstat(fd)
        current = config.stat(follow_symlinks=False)
        require(len(raw) == info.st_size and all(getattr(info, key) == getattr(after, key) for key in
                ('st_dev', 'st_ino', 'st_mode', 'st_size', 'st_mtime_ns', 'st_ctime_ns'))
                and current.st_dev == info.st_dev and current.st_ino == info.st_ino and current.st_mode == info.st_mode,
                'Git configuration changed during capture')
    finally:
        os.close(fd)
    config = raw.decode('utf8')
    require('\0' not in config, 'Unsupported Git configuration encoding')
    # Git 2.55 checkout can leave an ignored regular file after explicitly
    # unsetting extensions.worktreeConfig. Never activate or override that mode.
    require(not re.search(r'\\[ \t]*(?:\r?\n|$)', config), 'Multiline Git configuration is outside this source profile')
    for line in config.splitlines():
        if line.lstrip().startswith('['):
            require(re.fullmatch(r'\s*\[[^\]\r\n]+\]\s*(?:[;#].*)?', line) is not None,
                    'Inline or unsupported Git section framing is refused')
        match = re.match(r'^\s*worktreeconfig(?=\s|=|[;#]|$)', line, re.IGNORECASE)
        if match:
            tail = line.lstrip()[len('worktreeconfig'):].strip()
            require(tail.startswith('='), 'Bare worktreeConfig activates unsupported configuration')
            value = re.split(r'[;#]', tail[1:], maxsplit=1)[0].strip().lower()
            require(value in ('false', 'no', 'off', '0'), 'Active or unknown worktreeConfig is unsupported')
    # Official checkout writes this inert setting. Permit only its literal
    # disabled form, never a general gc section or an active duplicate.
    gc_sections, gc_values, in_gc = 0, 0, False
    for line in config.splitlines():
        section = re.match(r'^\s*\[\s*([\w.-]+)', line)
        if section:
            in_gc = section[1].lower() == 'gc'
            if in_gc:
                gc_sections += 1
                require(gc_sections == 1 and re.fullmatch(r'\s*\[\s*gc\s*\]\s*(?:[;#].*)?', line, re.IGNORECASE),
                        'Only one unsubsectioned checkout gc section is supported')
        elif in_gc and line.strip() and not line.lstrip().startswith(('#', ';')):
            gc_values += 1
            require(gc_values == 1 and re.fullmatch(r'\s*auto\s*=\s*0\s*(?:[;#].*)?', line, re.IGNORECASE),
                    'Checkout gc metadata must contain only one literal auto=0')
    require(gc_sections == gc_values, 'Checkout gc section requires explicit literal auto=0')
    ignored = metadata / 'config.worktree'
    if os.path.lexists(ignored):
        ignored_fd = os.open(ignored, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        try:
            before = os.fstat(ignored_fd)
            require(stat.S_ISREG(before.st_mode) and before.st_size <= 128_000,
                    'Ignored worktree metadata must remain a bounded regular file')
            with os.fdopen(ignored_fd, 'rb', closefd=False) as stream:
                ignored_raw = stream.read(before.st_size + 1)
            after = os.fstat(ignored_fd)
            require(len(ignored_raw) == before.st_size and all(getattr(before, key) == getattr(after, key)
                    for key in ('st_dev', 'st_ino', 'st_mode', 'st_size', 'st_mtime_ns', 'st_ctime_ns')),
                    'Ignored worktree metadata changed during capture')
        finally:
            os.close(ignored_fd)
    for section in re.findall(r'^\s*\[\s*([\w.-]+)', config, re.MULTILINE):
        require(section.lower() in ('core', 'remote', 'branch', 'extensions', 'http', 'gc'), 'Unsupported local Git configuration section')
    require(not re.search(r'^\s*(?:fsmonitor|worktree|hookspath|attributesfile|uploadpack|receivepack|promisor|'
                          r'partialclone|alternaterefscommand|sshcommand|gitproxy|vcs)\s*=', config, re.IGNORECASE | re.MULTILINE),
            'Executable, redirected or lazy-fetch Git metadata is unsupported')
    packs = metadata / 'objects/pack'
    require(not packs.exists() or not any(item.name.endswith('.promisor') for item in packs.iterdir()),
            'Promisor object packs are outside the offline source profile')
    require(not (metadata / 'objects/info/alternates').exists(), 'Indirect object stores are outside the source profile')
    return root


def validate_git_source(root, source):
    root = guard_git_metadata(root)
    env = {key: value for key, value in os.environ.items() if not key.startswith('GIT_')}
    env.update({'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_SYSTEM': os.devnull, 'GIT_CONFIG_GLOBAL': os.devnull,
                'GIT_NO_REPLACE_OBJECTS': '1', 'GIT_OPTIONAL_LOCKS': '0', 'GIT_NO_LAZY_FETCH': '1',
                'GIT_ALLOW_PROTOCOL': '', 'GIT_PROTOCOL_FROM_USER': '0', 'GIT_TERMINAL_PROMPT': '0',
                'GIT_ATTR_NOSYSTEM': '1'})
    def git(*args):
        return subprocess.run(['git', '--no-replace-objects', '--no-pager', '-C', str(root),
            '-c', 'protocol.allow=never', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath='+os.devnull,
            '-c', 'core.attributesFile='+os.devnull, *args], env=env, check=True,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30).stdout.decode().strip()
    require(pathlib.Path(git('rev-parse', '--show-toplevel')).resolve() == root, 'Installed Git root differs')
    require(not git('for-each-ref', '--format=%(refname)', 'refs/replace'), 'Replaced source history is unsupported')
    graft = pathlib.Path(git('rev-parse', '--git-path', 'info/grafts'))
    require(not (graft if graft.is_absolute() else root/graft).exists(), 'Grafted source history is unsupported')
    head = git('rev-parse', 'HEAD')
    require(re.fullmatch('[0-9a-f]{40}', head) and git('rev-parse', 'HEAD^{tree}') == source['sourceTree'],
            'Installed Git tree differs from complete captured source')
    head_entries = {}
    for line in git('ls-tree', '-rz', 'HEAD').rstrip('\0').split('\0'):
        metadata, name = line.split('\t', 1)
        mode, kind, digest = metadata.split()
        require(kind == 'blob', 'Unsupported installed Git object')
        head_entries[name] = {'mode': mode, 'blob': digest}
    index = {}
    for line in git('ls-files', '--stage', '-z').rstrip('\0').split('\0'):
        metadata, name = line.split('\t', 1)
        mode, digest, stage = metadata.split()
        require(stage == '0' and name not in index, 'Conflicted installed index')
        index[name] = {'mode': mode, 'blob': digest}
    require(index == head_entries, 'Installed index differs from captured HEAD')
    # Public owner commits, not an unpublished local merge's metadata SHA,
    # are the ancestry obligations. The full reconciled bytes are separately frozen.
    for ancestor in (BASE_COMMIT, PREREQUISITE, FEATURE):
        require(git('merge-base', ancestor, head) == ancestor, 'Required owner source ancestry is absent')
    return {**source, 'sourceCommit': head, 'gitAndIndexVerified': True}


def alpha_state(root):
    raw = read(root, ALPHA_PIN)[1]
    pin = strict_json(raw)
    transition = strict_json(read(root, ALPHA_TRANSITION)[1])
    require(exact(transition, ('schema', 'status', 'fromPinSha256', 'toPinSha256', 'reviewSha256', 'reviewRaw', 'fromSource'))
            and transition['schema'] == 'agijobsv0/discovery-alpha-pin-transition/v1'
            and transition['fromPinSha256'] == UNSET_ALPHA_SHA256, 'Alpha transition framing differs')
    if pin.get('status') == 'UNSET_PENDING_FINAL_REVIEWED_MAIN':
        require(sha(raw) == UNSET_ALPHA_SHA256, 'Unset predecessor Alpha pin differs')
        require(transition == {'schema': 'agijobsv0/discovery-alpha-pin-transition/v1', 'status': 'UNSET_PENDING_REVIEW',
                'fromPinSha256': UNSET_ALPHA_SHA256, 'toPinSha256': None, 'reviewSha256': None,
                'reviewRaw': None, 'fromSource': None}, 'Unset transition cannot claim a completed source review')
        return pin
    require(exact(pin, ('schema', 'status', 'repository', 'commit', 'tree', 'sourceHash', 'catalogPath',
                       'catalogSha256', 'catalogMode', 'files', 'fileModes', 'qualification', 'reviewSha256'))
            and pin['schema'] == 'agijobsv0/discovery-installed-alpha/v1'
            and pin['repository'] == 'MontrealAI/AGI-Alpha-Agent-v0'
            and pin['status'] == 'REVIEWED_FINAL_SOURCE'
            and pin['qualification'] == 'PENDING_FINAL_SOURCE_NATIVE_COMPATIBILITY'
            and pin['catalogPath'] == 'docs/successor/capabilities/sources.json', 'Frozen Alpha pin fields differ')
    require(all(isinstance(pin[key], str) and re.fullmatch('[0-9a-f]{40}', pin[key]) for key in ('commit', 'tree'))
            and all(isinstance(pin[key], str) and re.fullmatch('[0-9a-f]{64}', pin[key])
                    for key in ('sourceHash', 'catalogSha256', 'reviewSha256'))
            and pin['catalogMode'] in ('100644', '100755'), 'Frozen Alpha identity differs')
    require(isinstance(pin['files'], dict) and 41 <= len(pin['files']) <= 64
            and set(pin['files']) == set(pin['fileModes'])
            and all(safe_path(name) and isinstance(digest, str) and re.fullmatch('[0-9a-f]{64}', digest)
                    and pin['fileModes'][name] in ('100644', '100755') for name, digest in pin['files'].items()),
            'Frozen Alpha captured input map differs')
    require(transition['status'] == 'REVIEWED_PIN_PROPOSAL' and transition['toPinSha256'] == sha(raw)
            and transition['reviewSha256'] == pin['reviewSha256']
            and isinstance(transition['reviewRaw'], str) and sha(transition['reviewRaw'].encode()) == pin['reviewSha256'],
            'Frozen pin does not match its separately selected review and immutable predecessor')
    review = strict_json(transition['reviewRaw'])
    require(review.get('schema') == 'agijobsv0/discovery-alpha-source-review/v1'
            and review.get('decision') == 'ACCEPTED_FOR_INSTALLED_SOURCE'
            and review.get('repository') == pin['repository']
            and all(review.get(key) == pin[key] for key in ('commit', 'tree', 'sourceHash', 'catalogSha256'))
            and isinstance(review.get('evidence'), list) and review['evidence']
            and all(isinstance(item, str) and item.startswith('https://github.com/MontrealAI/AGI-Alpha-Agent-v0/')
                    for item in review['evidence']), 'Case-specific frozen Alpha review differs')
    source = transition['fromSource']
    require(exact(source, ('tree', 'manifestSha256', 'verifierSha256', 'scopeVerifierSha256'))
            and re.fullmatch('[0-9a-f]{40}', source['tree'])
            and all(re.fullmatch('[0-9a-f]{64}', source[key]) for key in ('manifestSha256', 'verifierSha256', 'scopeVerifierSha256')),
            'Alpha transition lacks the exact whole-source predecessor proof')
    return pin


def readiness(root, selection, paths=None, require_git=False):
    source = validate_source(root, selection, paths)
    if require_git:
        source = validate_git_source(root, source)
    pin = alpha_state(root)
    request = strict_json(read(root, OWNER_REVIEW)[1])
    require(request['status'] == 'UNACCEPTED_PROPOSAL_ONLY' and request['trueUnclearedQualityWarnings'] == 8
            and request['acceptedRecordsChanged'] is False, 'Owner review request cannot claim acceptance')
    return {**source, 'nativeAcceptance': 'NOT_RUN', 'alphaPin': 'UNSET' if pin['status'].startswith('UNSET') else 'REVIEWED_FINAL_SOURCE', 'versionReservation': 'UNRESERVED_PROPOSAL',
            'moduleGraphSha256': CHANGES['integrations/alpha-agent/discovery-installed-module-graph.mjs']['after']['sha256'],
            'holds': ['QUALIFIED_PREREQUISITE_MAIN_REQUIRED',
                      'FINAL_REVIEWED_ALPHA_MAIN_PIN_REQUIRED' if pin['status'].startswith('UNSET')
                      else 'INSTALLED_ARCHIVE_NATIVE_QUALIFICATION_REQUIRED',
                      'FRESH_FINAL_SOURCE_SCANNER_ACCEPTANCE_REQUIRED', 'EIGHT_TRUE_QUALITY_OWNER_DISPOSITIONS_REQUIRED',
                      'EXACT_FINAL_SOURCE_HOSTED_QUALIFICATION_REQUIRED', 'EXPLICIT_PUBLICATION_PROFILE_APPROVAL_REQUIRED']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=pathlib.Path, default=ROOT)
    parser.add_argument('--manifest-sha256', required=True)
    parser.add_argument('--verifier-sha256', required=True)
    parser.add_argument('--scope-verifier-sha256', required=True)
    parser.add_argument('--require-shippable', action='store_true')
    parser.add_argument('--require-git', action='store_true')
    args = parser.parse_args()
    result = readiness(args.root, select(manifest_sha256=args.manifest_sha256, verifier_sha256=args.verifier_sha256,
             scope_verifier_sha256=args.scope_verifier_sha256), require_git=args.require_git)
    print(json.dumps(result, sort_keys=True))
    if args.require_shippable:
        raise SystemExit('Shipping refused: ' + ', '.join(result['holds']))
