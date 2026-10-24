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
PROPOSED_VERSION = '2.1.0-rc.20'
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
 '.github/workflows/discovery-installed-release.yml': {'after': {'mode': '100644', 'sha256': '2e5244850e42ee02864d7cfb9c08525d9dcedf5cf4543c500d80ea1bcd3477e2'},
                                                       'before': None,
                                                       'reason': 'Retain the new source-selected producer, independently saved installer, two-runtime extracted consumers and separately reviewed publication route; pass the exact independently selected archive hash, bounded byte count and installed-manifest hash from original producer custody to both extracted operator and native commands, without deriving selection from extracted custody; compose the prepared ad63 response-ID publisher correction with explicit rc20 software metadata and complete unchanged installed gates, preserve rc18/rc19 drafts, retain bounded read-only creation reconciliation and refuse interrupted retry without duplicate or replacement; Add explicit owner-selected recover-owned-rc20 operation with the same main/owner/frozen guards,95-minute bound and existing permissions; use two full-history nonpersistent sibling checkouts for current tools and original f7 payload, exact retained creation ZIP and fixed-ID-only recovery; preserve every original select/producer/native/default publication command and evidence, excluding only the new recovery operation from the original create path'},
 '.github/workflows/discovery-lab-receiver.yml': {'after': {'mode': '100644', 'sha256': '884d9c9c2a6b00fb8768bef1cc6e3f1eb29203518733bf64230e60340a41e5ed'},
                                                  'before': None,
                                                  'reason': 'Preserve full-history checkout, actual installed source applicability and both original suites in order; append only exact owner2425 dependency-coherence and historical-ledger-prefix suites as ordinary changed-source qualification, retaining failures and all existing gates; select only the new explicit rc19 installed release identity, preserving prior rc18 draft/source/assets and every existing authority, source, scanner, dependency and qualification boundary; compose the prepared ad63 response-ID publisher correction with explicit rc20 software metadata and complete unchanged installed gates, preserve rc18/rc19 drafts, retain bounded read-only creation reconciliation and refuse interrupted retry without duplicate or replacement'},
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
                                                                              'sha256': '54fb20408cf023f931b3f43bf3d4d302e25088b3da4e5917a8e37624c1ab5bc7'},
                                                                    'before': None,
                                                                    'reason': 'Implement separately gated source-bound installed archive, immutable Alpha transition, operator, retained mission evidence and release qualification; select only the new explicit rc19 installed release identity, preserving prior rc18 draft/source/assets and every existing authority, source, scanner, dependency and qualification boundary; compose the prepared ad63 response-ID publisher correction with explicit rc20 software metadata and complete unchanged installed gates, preserve rc18/rc19 drafts, retain bounded read-only creation reconciliation and refuse interrupted retry without duplicate or replacement'},
 'config/discovery-installed-review-request-v1.json': {'after': {'mode': '100644',
                                                                 'sha256': 'dc4ab09435c85c2eecd8a03e9e016f522fe7dff878f2d2334d3ddeb32edca1d4'},
                                                       'before': None,
                                                       'reason': 'Implement separately gated source-bound installed archive, immutable Alpha transition, operator, retained mission evidence and release qualification; select only the new explicit rc19 installed release identity, preserving prior rc18 draft/source/assets and every existing authority, source, scanner, dependency and qualification boundary; compose the prepared ad63 response-ID publisher correction with explicit rc20 software metadata and complete unchanged installed gates, preserve rc18/rc19 drafts, retain bounded read-only creation reconciliation and refuse interrupted retry without duplicate or replacement'},
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
 'docs/successor/DISCOVERY_INSTALLED_RELEASE.md': {'after': {'mode': '100644', 'sha256': '6c82a66b549a13087a87b1a7002418e02a3acac4edf58464dacfca33858ccf20'},
                                                   'before': None,
                                                   'reason': 'Document the bounded installed local-review receiver, reviewed615 source and browser-input selection, independent archive hash/size/manifest runtime contract, machine-enforced Alpha public-asset acceptance and remaining exact-main/native/scanner/publication gates; preserve zero authority, incomplete-cost and deployment-observation limits and historical publisher evidence; select only the new explicit rc19 installed release identity, preserving prior rc18 draft/source/assets and every existing authority, source, scanner, dependency and qualification boundary; compose the prepared ad63 response-ID publisher correction with explicit rc20 software metadata and complete unchanged installed gates, preserve rc18/rc19 drafts, retain bounded read-only creation reconciliation and refuse interrupted retry without duplicate or replacement'},
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
 'integrations/alpha-agent/discovery-installed-runtime.mjs': {'after': {'mode': '100644', 'sha256': 'bbc2ccee5f5e5773561c27f34cb8836e2caafd2704af02443eab9cfc094193c0'},
                                                              'before': None,
                                                              'reason': 'Capture the complete bounded installed input set and imported module bytes; require inert independently selected archive hash, positive bounded safe-integer byte count and manifest hash; compare exact extraction custody schema/authority/state/tuple before returning frozen selected capsule provenance, with no manifest-only fallback or new execution authority; select only the new explicit rc19 installed release identity, preserving prior rc18 draft/source/assets and every existing authority, source, scanner, dependency and qualification boundary; compose the prepared ad63 response-ID publisher correction with explicit rc20 software metadata and complete unchanged installed gates, preserve rc18/rc19 drafts, retain bounded read-only creation reconciliation and refuse interrupted retry without duplicate or replacement'},
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
                                 'sha256': 'd0bf0d1bfe02919131b97cd9480265b6fe20ddbf0f1d9fd670b86c40674f7f62'},
                       'before': {'blob': '49676e6284cfb6aee1e953338e702b55fc01b3be', 'mode': '100644'},
                       'reason': 'Preserve proposed rc18 metadata and the Next15.5.28 fixes for GHSA-2464-fhr4-w9xw and GHSA-p3m5-59mp-jv5r; patch only direct DOMPurify3.3.0 and nested3.4.16 to3.4.17 for GHSA-cg2g-xh64-v4q7 and GHSA-mrv2-3pqr-j5jr, deduplicating the compatible root node while preserving all seven protected contract/compiler dependency identities; select only the new explicit rc19 installed release identity, preserving prior rc18 draft/source/assets and every existing authority, source, scanner, dependency and qualification boundary; compose the prepared ad63 response-ID publisher correction with explicit rc20 software metadata and complete unchanged installed gates, preserve rc18/rc19 drafts, retain bounded read-only creation reconciliation and refuse interrupted retry without duplicate or replacement'},
 'package.json': {'after': {'mode': '100644',
                            'sha256': '1d1c825217649e72312026946d4b134642e2b0abcfac1356000672dc095dabd4'},
                  'before': {'blob': 'd69a25b422673d9cb130be61fb45a9f4977317c9', 'mode': '100644'},
                  'reason': 'Preserve proposed rc18 metadata and the Next15.5.28 fixes for GHSA-2464-fhr4-w9xw and GHSA-p3m5-59mp-jv5r; patch only direct DOMPurify3.3.0 and nested3.4.16 to3.4.17 for GHSA-cg2g-xh64-v4q7 and GHSA-mrv2-3pqr-j5jr, deduplicating the compatible root node while preserving all seven protected contract/compiler dependency identities; select only the new explicit rc19 installed release identity, preserving prior rc18 draft/source/assets and every existing authority, source, scanner, dependency and qualification boundary; compose the prepared ad63 response-ID publisher correction with explicit rc20 software metadata and complete unchanged installed gates, preserve rc18/rc19 drafts, retain bounded read-only creation reconciliation and refuse interrupted retry without duplicate or replacement'},
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
 'scripts/release/discovery-installed-qualification.cjs': {'after': {'mode': '100644', 'sha256': '447b47ad50cb3df2c20fd431b732af3ea93be9b0d5b605867821cf55403196f4'},
                                                           'before': None,
                                                           'reason': 'Retain existing Actions byte selectors, initial JSON media, redirect/authentication/error behavior, shared60s deadline,64MB bound and complete qualification gates; add only fixed own-repository positive releaseasset-ID byte reads using documented initial octet media and anonymous existing approved release storage with the same bounds and safe fixed-route/status diagnostics; select explicit rc19 while preserving reviewed Alpha615 and original source/profile/scanner/asset checks; compose the prepared ad63 response-ID publisher correction with explicit rc20 software metadata and complete unchanged installed gates, preserve rc18/rc19 drafts, retain bounded read-only creation reconciliation and refuse interrupted retry without duplicate or replacement; Retain default exact-main qualification unchanged; add only an internally validated owned-rc20 recovery epoch that proves original f7 payload and separately qualified current-main tooling through the strict nine-leaf finite delta, binds honest actual-main observations to the tool epoch and all original source/scanner/producer/record checks to f7, without rewriting API data or changing anonymous packet identity; resolve the authenticated CodeQL service observer from the same fully source-proven payload checkout as its inherited/native consumer, preserving the private per-module observed WeakSet and every live service/source/raw scanner gate instead of mixing byte-identical modules from two roots'},
 'scripts/release/discovery-installed-release-dispatch.cjs': {'after': {'mode': '100644',
                                                                        'sha256': '106975281ef29fe99411a82b80a3b543d95ab2d31c898a6ee74d8c9472fbb384'},
                                                              'before': None,
                                                              'reason': 'Explicitly recognize rc17 plus installed rc18 and rc19 only; retain rc18 as the existing installed-suite output name for both installed editions, the full original rc17 command, every installed check and the historical publisher selected=false boundary; compose the prepared ad63 response-ID publisher correction with explicit rc20 software metadata and complete unchanged installed gates, preserve rc18/rc19 drafts, retain bounded read-only creation reconciliation and refuse interrupted retry without duplicate or replacement'},
 'scripts/release/discovery-installed-release.test.cjs': {'before': None,
 'after': {'mode': '100644', 'sha256': '3562a3b800d290fae3ae3559840a7d96e7c097507438d9c329dcfe3dfef35410'},
 'reason': 'Retain all75 preceding release/caller/private-fixture/transport/diagnostic cases and assertions, updating only draft-lease inventory/by-ID fixture framing and explicit rc19 dispatcher compatibility versus unknown rc20; append14 inert owned cases for complete bounded pagination, private collisions, exact new draft metadata, fixed-ID seven-asset uploads and readbacks, returned-ID substitution, safe HTTP diagnostics, full actualP.publish ID retention and pre-output collision refusal without network or real release commands; compose the prepared ad63 response-ID publisher correction with explicit rc20 software metadata and complete unchanged installed gates, preserve rc18/rc19 drafts, retain bounded read-only creation reconciliation and refuse interrupted retry without duplicate or replacement; Append only the24-case owned-rc20 recovery regression module to the existing test command, preserving all94 preceding cases and assertions and original workflow gates'},
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
 'scripts/release/publish-discovery-installed.cjs': {'before': None,
 'after': {'mode': '100644', 'sha256': '2eb1c51abcdc25357e95ff08c681ac683297e92ad29559e44224f9a8303b75a0'},
 'reason': 'Preserve safe fixed own-repository metadata route/status diagnostics and all exact-source, record, scanner, archive, Alpha and final-main gates; refuse any existing candidate draft or public release through complete bounded inventory, capture only one new exact-title/notes/tag/source release ID, upload exactly seven authenticated owned files to that ID, retain returned asset IDs, and verify draft/public bytes by exact asset IDs with unchanged zero authority; never adopt, overwrite, delete or finalize historical rc18 draft421509220; compose the prepared ad63 response-ID publisher correction with explicit rc20 software metadata and complete unchanged installed gates, preserve rc18/rc19 drafts, retain bounded read-only creation reconciliation and refuse interrupted retry without duplicate or replacement'},
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
 'scripts/security/check-dependency-preservation.cjs': {'after': {'mode': '100644', 'sha256': '2ddef380e9b4a75f4dda71cc3358225a560536f4eb76e2af1605b94e7b2c58d0'},
                                                        'before': {'blob': 'e697e1504a9649dfabfd8746a188bf66725f654b',
                                                                   'mode': '100644'},
                                                        'reason': 'Preserve hardened immutable committed-package selection, original dependency identities and complete authenticated generated-source comparison; recognize only explicitly enumerated installed rc18 and rc19 versions so rc19 cannot fall through to legacy handling; compose the prepared ad63 response-ID publisher correction with explicit rc20 software metadata and complete unchanged installed gates, preserve rc18/rc19 drafts, retain bounded read-only creation reconciliation and refuse interrupted retry without duplicate or replacement'},
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
           'sha256': '3e9ee393990f8eab58714489c9f77ef40d27497823794c8738bdbef6752c4aa6'},
 'reason': 'Preserve exact-head all22 production audit, CULTURE triggers, compatibility surfaces, thresholds and failed-command retention; retain harness evidence and disposable local deployment report/journal under owned runner scratch with original report/SBOM/screenshot artifact paths; scope existing DEPLOY_DEFAULTS_OUTPUT to local-deploy only and retain complete unfiltered Git mutation status before the unchanged generated-source comparator'},
 'test/scripts/dependency-audit.test.cjs': {'before': {'blob': '90f14f656ca7b6d0e47e182601cfc7c8c0bcb40f', 'mode': '100644'},
 'after': {'mode': '100644',
           'sha256': 'bed697ed769babda71332707fccfe435a425db8345beccb9a0cfe644ecde4f8c'},
 'reason': 'Retain all9 preceding strict audit, CULTURE, harness and reader test bodies; append one ordinary owned fixture proving the actual scoped deployment-output command retains both report and journal for success and exit7, does not write checkout reports or leak the output variable, and preserves every unfiltered owned mutation path; current-source hosted qualification remains separately required'},
 'test/scripts/discovery-installed-dependency-preservation.test.cjs': {'before': None,
 'after': {'mode': '100644', 'sha256': 'd7913557e86d0f092601dea91efc9c1118980b1a91b18c1b3477a5196faffc6b'},
 'reason': 'Preserve all preceding owned Git/source/generated-output fixtures byte-for-byte; append one inert rc19 committed-edition case proving strict Git context and current package-byte authentication remain mandatory; compose the prepared ad63 response-ID publisher correction with explicit rc20 software metadata and complete unchanged installed gates, preserve rc18/rc19 drafts, retain bounded read-only creation reconciliation and refuse interrupted retry without duplicate or replacement'},
 'tools/security/discovery-installed-ledger-prefix.mjs': {'before': None,
 'after': {'mode': '100644',
           'sha256': '3b41332df1297be0bb1514eb96fb3a871cf82f15eea87019e514e9e5298e8a63'},
 'reason': 'Preserve original96 ledger, all288 historical protected path/mode/blob identities, complete ancestry/source/index closure and independent installed additions; recognize only exact committed rc18 and rc19 versions under the same hardened readGit interface; compose the prepared ad63 response-ID publisher correction with explicit rc20 software metadata and complete unchanged installed gates, preserve rc18/rc19 drafts, retain bounded read-only creation reconciliation and refuse interrupted retry without duplicate or replacement'},
 'tools/security/discovery-installed-ledger-prefix.test.mjs': {'before': None,
 'after': {'mode': '100644',
           'sha256': '0002f1737c317abdaf2f386735fee8be912c204db09f400068bf8ce03fa08063'},
 'reason': 'Preserve all preceding ledger fixtures byte-for-byte; append one injected data-only case proving exact rc18/rc19 select installed controls while unknown rc20 and tampered rc19 do not; compose the prepared ad63 response-ID publisher correction with explicit rc20 software metadata and complete unchanged installed gates, preserve rc18/rc19 drafts, retain bounded read-only creation reconciliation and refuse interrupted retry without duplicate or replacement'},
 'agent-gateway/validator.ts': {'before': {'mode': '100644',
                                           'blob': '457f22649a18abdf372d2130267fc4495b5cd6bd'},
                                'after': {'mode': '100644',
                                          'sha256': '59b4b2f3d3184f1376996f5b049456b48ac2b2f01b2d200a2614f3772a4f2a6a'},
                                'reason': 'Close the current-main86 worker-controlled HTTP result '
                                          'fetch issue by delegating only that branch to the '
                                          'existing exact operator-origin and checked '
                                          'gateway-route artifact reader, with redirect rejection, '
                                          '15-second abort and 4 MiB streaming bound; preserve '
                                          'local and inline handling, text decoding, '
                                          'unavailable-result refusal and existing result-hash '
                                          'validation without granting production authority'},
 'docs/computer-work.md': {'before': {'mode': '100644',
                                      'blob': '9aef256ab45be5a95f7d568c1e34e43ed328652b'},
                           'after': {'mode': '100644',
                                     'sha256': 'c15540872365afe0d9d5a7e91176a68ae56ee4e4950051b00925e922ae84d85a'},
                           'reason': 'Describe the automatic gateway HTTP result reader migration '
                                     'to the existing 15-second and 4 MiB operator-origin policy, '
                                     'distinguish whole-origin trust from the additional checked '
                                     'gateway route, and retain DNS/egress and unchanged '
                                     'inline/local/IPFS limitations'},
 'test/security/inherited-codeql.test.cjs': {'before': {'mode': '100644',
                                                        'blob': '9e8742d4b3f468a7324a334e11667f23b95d5bb7'},
                                             'after': {'mode': '100644',
                                                       'sha256': 'd826c548b430b1db32ca661fcd0026f8d778b865657d2492987ef31ad924d781'},
                                             'reason': 'Retain all preceding 47084 test-file bytes '
                                                       'exactly and append seven inert '
                                                       'mocked-fetch/stream/timer cases for the '
                                                       'actual private automatic-validator caller: '
                                                       'unapproved origins and credentials, HTTP '
                                                       'decoding, gateway-route containment, '
                                                       'redirect rejection/no retry, exact 4 MiB '
                                                       'and overflow cancellation, 15-second abort '
                                                       'and unchanged inline/local behavior; no '
                                                       'socket, provider or chain probe'},
 '.github/workflows/successor-computer.yml': {'before': {'mode': '100644', 'blob': 'd158e2b3da0d2fda746a3818ad4342a45278ca60'}, 'after': {'mode': '100644', 'sha256': 'd2bee5d44cd8420569c6432b821f810e488bc4693df993130c2b0b14946c7736'}, 'reason': 'Raise only the inherited native Computer Use overall CI budget from15 to30 minutes after exact-main run39987226782 exhausted15 minutes during slow Ubuntu package installation; preserve every pinned action, dependency, command, per-case bound, permission, security control and acceptance assertion, with no skipped gate or unchanged failed-run retry'},
 'scripts/release/anonymous-alpha-metadata-diagnostic.cjs': {'before': None,
                                                             'after': {'mode': '100644',
                                                                       'sha256': '7757420978470a5ab0312a4368abc9b22ee0e92e656562bf290aee71c63c3f5f'},
                                                             'reason': 'Observe only original anonymous fixed-Alpha '
                                                                       'metadata failures without changing identity, '
                                                                       'headers, redirects or retries; retain exact '
                                                                       'current URL/status, bounded redacted body '
                                                                       'evidence and safe response headers while '
                                                                       'leaving original403 details explicitly '
                                                                       'unavailable'},
 'scripts/release/recover-discovery-rc20.cjs': {'before': None, 'after': {'mode': '100644', 'sha256': '84c9dd9424bb93f361da9ea2996edea0292747a4e18d0423b25e26bf975e4564'}, 'reason': 'Recover ONLY original rc20 draft422158983 and its retained creation artifact12521657234 using separately qualified current-main recovery tooling and original f7 payload source; verify both complete Git source epochs and exactly nine finite tooling leaves, retain original producer/scanner/record/tag/asset bindings, fresh qualification and seven anonymous public byte reads; permit only one fixed-ID PATCH with no creation, upload, replacement, credential expansion or new version; Preserve original draft created_at strictly before publication; authenticate the fixed f7 raw Git commit object, tree and committer date before any phase adoption, then require exactly that commit date for published created_at and publication chronology; retain original author identity and authenticated receipt through seven public byte reads, retain pre/post observations, and reconcile an already-public owned release with zero further mutation; reauthenticate original author and every owned identity field in the final by-ID lease immediately before mutation intent'},
 'scripts/release/recover-discovery-rc20.test.cjs': {'before': None, 'after': {'mode': '100644', 'sha256': 'ebe8f04fbb4ee16b51dcc1f0dc38bdb963ec1207dc5b0c71fc1abfda4826f69a'}, 'reason': 'Add25 inert owned recovery/diagnostic/dual-epoch regressions using the exact original creation ZIP; refuse identity/source/asset substitutions, duplicate tags, changed main,403publication, uncertain-outcome duplicate mutation, unqualified tooling, expanded runtime deltas and unauthorized caller context without real release operations; add the actual two-root service-module private-brand regression, preserving cross-root, forged, serialized and wrong-epoch refusals plus ordinary same-root behavior; Preserve25 preceding cases; add6 inert phase-transition/raw-Git/ownership/chronology/idempotency regressions with exact post-PATCH commit-date behavior, immutable source-metadata tamper refusal and already-public zeroPATCH reconciliation; preserve all original draft, asset, source, tag and private proof refusals; include last-tool-gate author movement with zero PATCH intent and zero mutation'}}
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
