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
PROPOSED_VERSION = '2.1.0-rc.21'
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
ALPHA_615_PIN_SHA256 = '7b6ac047905dc27da219cb2608a92b590380bb2781d155afe15734af1173b0f3'
ALPHA_141_TARGET = {'commit': '031bdb5d055c8bad896daa076baea2b5e17b242c', 'tree': '330e0e58268ed32990f04278fc543c71db45fd46', 'sourceHash': '54769dbfde99ae13708a33292866f0ca7e6b8b7792a7a944f76bf2fbf1de1358', 'catalogSha256': 'd1c3cb9a5c3eb96e9e5eb111b83a713786ec18ed1213a407cd77bbaf018c5adb'}
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
 '.github/workflows/discovery-lab-receiver.yml': {'after': {'mode': '100644', 'sha256': '2060dd76279ee64d6722a14d9f2d5bfd5a77ac39e4d401535c4fb52ea512628d'},
                                                  'before': None,
                                                  'reason': 'Preserve full-history checkout, actual installed source applicability and both original suites in order; append only exact owner2425 dependency-coherence and historical-ledger-prefix suites as ordinary changed-source qualification, retaining failures and all existing gates; select only the new explicit rc19 installed release identity, preserving prior rc18 draft/source/assets and every existing authority, source, scanner, dependency and qualification boundary; compose the prepared ad63 response-ID publisher correction with explicit rc20 software metadata and complete unchanged installed gates, preserve rc18/rc19 drafts, retain bounded read-only creation reconciliation and refuse interrupted retry without duplicate or replacement; Select the exact reviewed Alpha031b source and original1.41 public packet for the new rc21 edition; preserve historical releases, source identities and all authority restrictions; retain complete source/inventory/metadata checks and explicit accepted-public-body evidence reuse with fresh cross-source packs and live leases'},
 '.github/workflows/source-release-rc16.yml': {'after': {'mode': '100644',
                                                         'sha256': '803f353c14ce9b38db2acf7dd9750bdd37ae7b8ffa5066ab1da03d896cb51bec'},
                                               'before': {'blob': 'c718ae0e9d5297dade30711c3cafdbb2c29358ea',
                                                          'mode': '100644'},
                                               'reason': 'Dispatch rc18 to additional installed checks while '
                                                         'preserving the original rc17 suite and publisher'},
 'config/discovery-installed-alpha-transition-v1.json': {'after': {'mode': '100644', 'sha256': '1376507f40d4e26cf6f26cae463c6a8d1d19db151eced87dc08cc83266bf3411'},
                                                         'before': None,
                                                         'reason': 'Install the unchanged separately generated Alpha61532 transition from immutable UNSET pin01e32 and exact predecessor Jobs treeb082 with its original M/V/scope identities; retain raw case-specific source review and no publication or installed-compatibility approval; Select the exact reviewed Alpha031b source and original1.41 public packet for the new rc21 edition; preserve historical releases, source identities and all authority restrictions; retain complete source/inventory/metadata checks and explicit accepted-public-body evidence reuse with fresh cross-source packs and live leases'},
 'config/discovery-installed-alpha-v1.json': {'after': {'mode': '100644', 'sha256': '1a2bdd11e4a41bb72d75f0bbe37f6110204bdf883ed1e6400e948ef0c750f141'},
                                              'before': None,
                                              'reason': 'Install the separately reviewed exact Alpha61532 source pin and all43 captured source identities under review cd3966b4c547e890b1e2a7a2b1d9201ee89265f66595f98ead959cc952fabeee; retain pending original producer/native compatibility and false publication/execution authority; Select the exact reviewed Alpha031b source and original1.41 public packet for the new rc21 edition; preserve historical releases, source identities and all authority restrictions; retain complete source/inventory/metadata checks and explicit accepted-public-body evidence reuse with fresh cross-source packs and live leases'},
 'config/discovery-installed-browser-input-v1.json': {'after': {'mode': '100644', 'sha256': '0a6fbc85be008e6767b43a419488d1fc4ff40e2ed9cd4cc379540b4a1c1c9bd8'},
                                                      'before': None,
                                                      'reason': 'Select only the successful exact Alpha61532 original browser packet and all11 raw member identities from common17 transport e31e74d1a5144973e6a22006dbe29ea628a80386, with exact custody/artifact metadata; retain same-mission native and fresh public qualification requirements without rebuilding originals; Select the exact reviewed Alpha031b source and original1.41 public packet for the new rc21 edition; preserve historical releases, source identities and all authority restrictions; retain complete source/inventory/metadata checks and explicit accepted-public-body evidence reuse with fresh cross-source packs and live leases'},
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
                                                                              'sha256': '8303e38317ec79a354af3a584c7c7f8f67934c1383e507afb0c8fa5d8ad0b375'},
                                                                    'before': None,
                                                                    'reason': 'Implement separately gated source-bound installed archive, immutable Alpha transition, operator, retained mission evidence and release qualification; select only the new explicit rc19 installed release identity, preserving prior rc18 draft/source/assets and every existing authority, source, scanner, dependency and qualification boundary; compose the prepared ad63 response-ID publisher correction with explicit rc20 software metadata and complete unchanged installed gates, preserve rc18/rc19 drafts, retain bounded read-only creation reconciliation and refuse interrupted retry without duplicate or replacement; Select the exact reviewed Alpha031b source and original1.41 public packet for the new rc21 edition; preserve historical releases, source identities and all authority restrictions; retain complete source/inventory/metadata checks and explicit accepted-public-body evidence reuse with fresh cross-source packs and live leases'},
 'config/discovery-installed-review-request-v1.json': {'after': {'mode': '100644',
                                                                 'sha256': '4feace514416b26f546a5e2d5a257c165e5d2c81eb538c22ef30b534d6d8d1e0'},
                                                       'before': None,
                                                       'reason': 'Implement separately gated source-bound installed archive, immutable Alpha transition, operator, retained mission evidence and release qualification; select only the new explicit rc19 installed release identity, preserving prior rc18 draft/source/assets and every existing authority, source, scanner, dependency and qualification boundary; compose the prepared ad63 response-ID publisher correction with explicit rc20 software metadata and complete unchanged installed gates, preserve rc18/rc19 drafts, retain bounded read-only creation reconciliation and refuse interrupted retry without duplicate or replacement; Select the exact reviewed Alpha031b source and original1.41 public packet for the new rc21 edition; preserve historical releases, source identities and all authority restrictions; retain complete source/inventory/metadata checks and explicit accepted-public-body evidence reuse with fresh cross-source packs and live leases'},
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
 'docs/successor/DISCOVERY_INSTALLED_RELEASE.md': {'after': {'mode': '100644', 'sha256': '5d9c6cec03870a76a78d4cfbe4e363c29d575ca27d9dbceab3974e5d47ad982b'},
                                                   'before': None,
                                                   'reason': 'Document the bounded installed local-review receiver, reviewed615 source and browser-input selection, independent archive hash/size/manifest runtime contract, machine-enforced Alpha public-asset acceptance and remaining exact-main/native/scanner/publication gates; preserve zero authority, incomplete-cost and deployment-observation limits and historical publisher evidence; select only the new explicit rc19 installed release identity, preserving prior rc18 draft/source/assets and every existing authority, source, scanner, dependency and qualification boundary; compose the prepared ad63 response-ID publisher correction with explicit rc20 software metadata and complete unchanged installed gates, preserve rc18/rc19 drafts, retain bounded read-only creation reconciliation and refuse interrupted retry without duplicate or replacement; Select the exact reviewed Alpha031b source and original1.41 public packet for the new rc21 edition; preserve historical releases, source identities and all authority restrictions; retain complete source/inventory/metadata checks and explicit accepted-public-body evidence reuse with fresh cross-source packs and live leases'},
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
 'integrations/alpha-agent/discovery-installed-runtime.mjs': {'after': {'mode': '100644', 'sha256': '0c855b5a5bbb56bf6a4f8e776f32939fd008b7d2dace753842a22dfc1eb5508a'},
                                                              'before': None,
                                                              'reason': 'Capture the complete bounded installed input set and imported module bytes; require inert independently selected archive hash, positive bounded safe-integer byte count and manifest hash; compare exact extraction custody schema/authority/state/tuple before returning frozen selected capsule provenance, with no manifest-only fallback or new execution authority; select only the new explicit rc19 installed release identity, preserving prior rc18 draft/source/assets and every existing authority, source, scanner, dependency and qualification boundary; compose the prepared ad63 response-ID publisher correction with explicit rc20 software metadata and complete unchanged installed gates, preserve rc18/rc19 drafts, retain bounded read-only creation reconciliation and refuse interrupted retry without duplicate or replacement; Prepare exact-four-field031b53-source catalog admission while retaining the historical41-source path and unchanged archive/custody/authority requirements; no new installed compatibility is accepted; Select the exact reviewed Alpha031b source and original1.41 public packet for the new rc21 edition; preserve historical releases, source identities and all authority restrictions; retain complete source/inventory/metadata checks and explicit accepted-public-body evidence reuse with fresh cross-source packs and live leases'},
 'integrations/alpha-agent/discovery-installed-runtime.test.mjs': {'after': {'mode': '100644', 'sha256': '095bd07295911baa2c8b2fa20df0a7c12df4ec8bdc4a132d7ae6c0750498b436'},
                                                                   'before': None,
                                                                   'reason': 'Retain bounded inventory and ordinary trusted receiver controls; add inert exact extraction provenance cases rejecting hash/size/schema/authority/state/field drift, omitted or coerced external selection and accessors/proxies before installed capture; no native or release approval; Add3 ordinary catalog regressions for the exact031b identity, preserved41-source metadata and unrelated/missing/changed source refusal; Select the exact reviewed Alpha031b source and original1.41 public packet for the new rc21 edition; preserve historical releases, source identities and all authority restrictions; retain complete source/inventory/metadata checks and explicit accepted-public-body evidence reuse with fresh cross-source packs and live leases'},
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
                                 'sha256': 'ec9b78d5ea5c9a08dc85b14f11b2df360a419f86993f5642cabf7e0f0542b946'},
                       'before': {'blob': '49676e6284cfb6aee1e953338e702b55fc01b3be', 'mode': '100644'},
                       'reason': 'Preserve proposed rc18 metadata and the Next15.5.28 fixes for GHSA-2464-fhr4-w9xw and GHSA-p3m5-59mp-jv5r; patch only direct DOMPurify3.3.0 and nested3.4.16 to3.4.17 for GHSA-cg2g-xh64-v4q7 and GHSA-mrv2-3pqr-j5jr, deduplicating the compatible root node while preserving all seven protected contract/compiler dependency identities; select only the new explicit rc19 installed release identity, preserving prior rc18 draft/source/assets and every existing authority, source, scanner, dependency and qualification boundary; compose the prepared ad63 response-ID publisher correction with explicit rc20 software metadata and complete unchanged installed gates, preserve rc18/rc19 drafts, retain bounded read-only creation reconciliation and refuse interrupted retry without duplicate or replacement; Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities; Select the exact reviewed Alpha031b source and original1.41 public packet for the new rc21 edition; preserve historical releases, source identities and all authority restrictions; retain complete source/inventory/metadata checks and explicit accepted-public-body evidence reuse with fresh cross-source packs and live leases'},
 'package.json': {'after': {'mode': '100644',
                            'sha256': '6f21b1127070411c369184313dfc49eee1fe996352a2c4f23ceff1dc932628f3'},
                  'before': {'blob': 'd69a25b422673d9cb130be61fb45a9f4977317c9', 'mode': '100644'},
                  'reason': 'Preserve proposed rc18 metadata and the Next15.5.28 fixes for GHSA-2464-fhr4-w9xw and GHSA-p3m5-59mp-jv5r; patch only direct DOMPurify3.3.0 and nested3.4.16 to3.4.17 for GHSA-cg2g-xh64-v4q7 and GHSA-mrv2-3pqr-j5jr, deduplicating the compatible root node while preserving all seven protected contract/compiler dependency identities; select only the new explicit rc19 installed release identity, preserving prior rc18 draft/source/assets and every existing authority, source, scanner, dependency and qualification boundary; compose the prepared ad63 response-ID publisher correction with explicit rc20 software metadata and complete unchanged installed gates, preserve rc18/rc19 drafts, retain bounded read-only creation reconciliation and refuse interrupted retry without duplicate or replacement; Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities; Select the exact reviewed Alpha031b source and original1.41 public packet for the new rc21 edition; preserve historical releases, source identities and all authority restrictions; retain complete source/inventory/metadata checks and explicit accepted-public-body evidence reuse with fresh cross-source packs and live leases'},
 'scripts/release/capture-discovery-browser-input.cjs': {'after': {'mode': '100644',
                                                                   'sha256': '62646659b364a9cf9edd77d6a6ab02555d9ae0f8fa05522b8b22da53e63172ac'},
                                                         'before': None,
                                                         'reason': 'Implement separately gated source-bound installed archive, immutable Alpha transition, operator, retained mission evidence and release qualification; Select the exact reviewed Alpha031b source and original1.41 public packet for the new rc21 edition; preserve historical releases, source identities and all authority restrictions; retain complete source/inventory/metadata checks and explicit accepted-public-body evidence reuse with fresh cross-source packs and live leases'},
 'scripts/release/capture-discovery-browser-input.test.cjs': {'after': {'mode': '100644',
                                                                        'sha256': '101fd32f26ece2b0dadd03584f582719aeec3756207b9ddbb8aac0de9009d65e'},
                                                              'before': None,
                                                              'reason': 'Implement separately gated source-bound installed archive, immutable Alpha transition, operator, retained mission evidence and release qualification; Select the exact reviewed Alpha031b source and original1.41 public packet for the new rc21 edition; preserve historical releases, source identities and all authority restrictions; retain complete source/inventory/metadata checks and explicit accepted-public-body evidence reuse with fresh cross-source packs and live leases'},
 'scripts/release/discovery-browser-packet-fixtures.cjs': {'after': {'mode': '100644',
                                                                     'sha256': '362a7308a78abf086c047dd5e0be3a522f0c28675f4e50eba76d5c14ec37b2dd'},
                                                           'before': None,
                                                           'reason': 'Add inert shared packet metadata '
                                                                     'fixtures without browser or native '
                                                                     'qualification claims'},
 'scripts/release/discovery-installed-package.py': {'after': {'mode': '100644', 'sha256': '27e387b2e86827e46330fde98c007ab83b528b6766f26f21beeea2a026c48136'},
                                                    'before': None,
                                                    'reason': 'Retain the deterministic installed archive builder, complete source/Alpha capture, manifest and standalone installer provenance; update only generated README instructions to require the authenticated original archive hash and byte count alongside installed-manifest hash; Retain the original41-source catalog path and admit53 only for the exact four-field031b source identity; preserve complete byte/Git/closure checks'},
 'scripts/release/discovery-installed-qualification.cjs': {'after': {'mode': '100644', 'sha256': '228ab1df299ba5c3e97da296ea473cae79fdfebe507a04d4d16d467361c4d88f'},
                                                           'before': None,
                                                           'reason': 'Retain existing Actions byte selectors, initial JSON media, redirect/authentication/error behavior, shared60s deadline,64MB bound and complete qualification gates; add only fixed own-repository positive releaseasset-ID byte reads using documented initial octet media and anonymous existing approved release storage with the same bounds and safe fixed-route/status diagnostics; select explicit rc19 while preserving reviewed Alpha615 and original source/profile/scanner/asset checks; compose the prepared ad63 response-ID publisher correction with explicit rc20 software metadata and complete unchanged installed gates, preserve rc18/rc19 drafts, retain bounded read-only creation reconciliation and refuse interrupted retry without duplicate or replacement; Retain default exact-main qualification unchanged; add only an internally validated owned-rc20 recovery epoch that proves original f7 payload and separately qualified current-main tooling through the strict nine-leaf finite delta, binds honest actual-main observations to the tool epoch and all original source/scanner/producer/record checks to f7, without rewriting API data or changing anonymous packet identity; resolve the authenticated CodeQL service observer from the same fully source-proven payload checkout as its inherited/native consumer, preserving the private per-module observed WeakSet and every live service/source/raw scanner gate instead of mixing byte-identical modules from two roots; Select the exact reviewed Alpha031b source and original1.41 public packet for the new rc21 edition; preserve historical releases, source identities and all authority restrictions; retain complete source/inventory/metadata checks and explicit accepted-public-body evidence reuse with fresh cross-source packs and live leases'},
 'scripts/release/discovery-installed-release-dispatch.cjs': {'after': {'mode': '100644',
                                                                        'sha256': '2f6227d77ae92179a5f61a28daedafb8be2e0a91cfee3ff32c03f849d53940df'},
                                                              'before': None,
                                                              'reason': 'Explicitly recognize rc17 plus installed rc18 and rc19 only; retain rc18 as the existing installed-suite output name for both installed editions, the full original rc17 command, every installed check and the historical publisher selected=false boundary; compose the prepared ad63 response-ID publisher correction with explicit rc20 software metadata and complete unchanged installed gates, preserve rc18/rc19 drafts, retain bounded read-only creation reconciliation and refuse interrupted retry without duplicate or replacement; Select the exact reviewed Alpha031b source and original1.41 public packet for the new rc21 edition; preserve historical releases, source identities and all authority restrictions; retain complete source/inventory/metadata checks and explicit accepted-public-body evidence reuse with fresh cross-source packs and live leases'},
 'scripts/release/discovery-installed-release.test.cjs': {'before': None,
 'after': {'mode': '100644', 'sha256': 'e12f23fd31c4ad10223e9d5bafb1d303b919b49cbb9c6348d2979943945752e5'},
 'reason': 'Retain all75 preceding release/caller/private-fixture/transport/diagnostic cases and assertions, updating only draft-lease inventory/by-ID fixture framing and explicit rc19 dispatcher compatibility versus unknown rc20; append14 inert owned cases for complete bounded pagination, private collisions, exact new draft metadata, fixed-ID seven-asset uploads and readbacks, returned-ID substitution, safe HTTP diagnostics, full actualP.publish ID retention and pre-output collision refusal without network or real release commands; compose the prepared ad63 response-ID publisher correction with explicit rc20 software metadata and complete unchanged installed gates, preserve rc18/rc19 drafts, retain bounded read-only creation reconciliation and refuse interrupted retry without duplicate or replacement; Append only the24-case owned-rc20 recovery regression module to the existing test command, preserving all94 preceding cases and assertions and original workflow gates; Select the exact reviewed Alpha031b source and original1.41 public packet for the new rc21 edition; preserve historical releases, source identities and all authority restrictions; retain complete source/inventory/metadata checks and explicit accepted-public-body evidence reuse with fresh cross-source packs and live leases'},
 'scripts/release/discovery-lab-profile.py': {'after': {'mode': '100644',
                                                        'sha256': '4da6958cd88f4e596aaa5947f398d2367009bb9bfe487fcfa1d0bf17b4cd348b'},
                                              'before': None,
                                              'reason': 'Preserve exact Discovery receiver and finite '
                                                        'source-only controls through the prerequisite '
                                                        'merge'},
 'scripts/release/freeze-discovery-installed-alpha.py': {'after': {'mode': '100644',
                                                                   'sha256': '8b018f00d3ba2e3f34b8a8c0980f104bddcbac4ef4ef4666f123243318ddb725'},
                                                         'before': None,
                                                         'reason': 'Implement separately gated source-bound installed archive, immutable Alpha transition, operator, retained mission evidence and release qualification; Prepare only the explicit exact-reviewed615 to exact031b source proposal; preserve the original unset path, prior files and false publication/installed-compatibility flags'},
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
                                                                   'sha256': 'a441e6d760c5e1a4d09694d36ee3ce6b0f52a80f4c074c318e0782049dfe3665'},
                                                         'before': None,
                                                         'reason': 'Implement separately gated source-bound installed archive, immutable Alpha transition, operator, retained mission evidence and release qualification; Select the exact reviewed Alpha031b source and original1.41 public packet for the new rc21 edition; preserve historical releases, source identities and all authority restrictions; retain complete source/inventory/metadata checks and explicit accepted-public-body evidence reuse with fresh cross-source packs and live leases'},
 'scripts/release/test-discovery-installed-profile.py': {'after': {'mode': '100644',
                                                                   'sha256': '3f4c968357d3c1f6a9faa5f3c26784b2ac76134bf17cfae4c55affd4fddf40c9'},
                                                         'before': None,
                                                         'reason': 'Implement separately gated source-bound installed archive, immutable Alpha transition, operator, retained mission evidence and release qualification; Add14 ordinary metadata/catalog/proposal regressions including original UNSET, exact predecessor and target, false flags and no capture/output on refusal; source capture is explicitly mocked; Select the exact reviewed Alpha031b source and original1.41 public packet for the new rc21 edition; preserve historical releases, source identities and all authority restrictions; retain complete source/inventory/metadata checks and explicit accepted-public-body evidence reuse with fresh cross-source packs and live leases'},
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
 'scripts/security/check-dependency-preservation.cjs': {'after': {'mode': '100644', 'sha256': 'f55e21614c3a1cc98af0464125c0d0cf33301569b34d516214e5cf66a1e21dfd'},
                                                        'before': {'blob': 'e697e1504a9649dfabfd8746a188bf66725f654b',
                                                                   'mode': '100644'},
                                                        'reason': 'Preserve hardened immutable committed-package selection, original dependency identities and complete authenticated generated-source comparison; recognize only explicitly enumerated installed rc18 and rc19 versions so rc19 cannot fall through to legacy handling; compose the prepared ad63 response-ID publisher correction with explicit rc20 software metadata and complete unchanged installed gates, preserve rc18/rc19 drafts, retain bounded read-only creation reconciliation and refuse interrupted retry without duplicate or replacement; Select the exact reviewed Alpha031b source and original1.41 public packet for the new rc21 edition; preserve historical releases, source identities and all authority restrictions; retain complete source/inventory/metadata checks and explicit accepted-public-body evidence reuse with fresh cross-source packs and live leases'},
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
                                             'sha256': 'ff427a1942f91f3d65fe2eeb5f5ec4fdbda2ec8bd992d76ae5b8aefcba4e4bf7'},
                                   'before': {'blob': '0fbb3e3406f94cbc4a61721db924685bc8824644',
                                              'mode': '100644'},
                                   'reason': 'Preserve the exact Next15.5.28 fixes for GHSA-2464-fhr4-w9xw and GHSA-p3m5-59mp-jv5r; patch only transitive DOMPurify3.4.16 to3.4.17 for GHSA-cg2g-xh64-v4q7 and GHSA-mrv2-3pqr-j5jr while preserving contract/compiler dependencies; Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'apps/onebox/package.json': {'after': {'mode': '100644',
                                        'sha256': '02fc41b7a89c8e5175803ad0fa82852b383837a0a4dc1f039c56ebe0140e3188'},
                              'before': {'blob': '97930338ea29bb0e273d4721d99d2c6b92f992c1',
                                         'mode': '100644'},
                              'reason': 'Patch the exact Next15.5.28 dependency graph for GHSA-2464-fhr4-w9xw and GHSA-p3m5-59mp-jv5r while preserving contract/compiler dependencies; Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
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
           'sha256': '36e9ec14321418062c09f6df476f528aca21a869df3f574e91496fc6c97d7fb7'},
 'before': {'blob': 'c91b3f2d6f11ad0a0b0bde788ddfcb33a773db97', 'mode': '100644'},
 'reason': 'Patch only the CULTURE indexer Fastify5.12.5 to5.12.6 for GHSA-389g-gv7q-r4x8 and transitive ip-address10.7.3 to10.7.4 for GHSA-rxp7-6hxx-x8q5, with matching npm/pnpm lock records; preserve existing strict high/critical and failed-command audit checks, protected contract/compiler identities and legacy release bodies; Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'demo/CULTURE-v0/indexers/culture-graph-indexer/package-lock.json': {'after': {'mode': '100644',
           'sha256': 'bada386dbbd23f4e507ccfe7b95eba6a7fbc5fcf12fe1339e977e3f703750c51'},
 'before': {'blob': '60ba190dbb77b0396d2691390b24eb5484386293', 'mode': '100644'},
 'reason': 'Patch only the CULTURE indexer Fastify5.12.5 to5.12.6 for GHSA-389g-gv7q-r4x8 and transitive ip-address10.7.3 to10.7.4 for GHSA-rxp7-6hxx-x8q5, with matching npm/pnpm lock records; preserve existing strict high/critical and failed-command audit checks, protected contract/compiler identities and legacy release bodies; Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'demo/CULTURE-v0/pnpm-lock.yaml': {'after': {'mode': '100644',
           'sha256': '9f5b3c4b9c4cd9f44c92e11d234139d8b9d13665ea24df18a878a5af223ccfd9'},
 'before': {'blob': '6023dfd3e6f38c274d268cc5a04db53c9acfdaef', 'mode': '100644'},
 'reason': 'Patch only the CULTURE indexer Fastify5.12.5 to5.12.6 for GHSA-389g-gv7q-r4x8 and transitive ip-address10.7.3 to10.7.4 for GHSA-rxp7-6hxx-x8q5, with matching npm/pnpm lock records; preserve existing strict high/critical and failed-command audit checks, protected contract/compiler identities and legacy release bodies; Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
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
 'after': {'mode': '100644', 'sha256': 'eaebdc994973a97e8d491450a302c50939a9e0dfd80fa7aa3daf28ebab366478'},
 'reason': 'Preserve all preceding owned Git/source/generated-output fixtures byte-for-byte; append one inert rc19 committed-edition case proving strict Git context and current package-byte authentication remain mandatory; compose the prepared ad63 response-ID publisher correction with explicit rc20 software metadata and complete unchanged installed gates, preserve rc18/rc19 drafts, retain bounded read-only creation reconciliation and refuse interrupted retry without duplicate or replacement; Select the exact reviewed Alpha031b source and original1.41 public packet for the new rc21 edition; preserve historical releases, source identities and all authority restrictions; retain complete source/inventory/metadata checks and explicit accepted-public-body evidence reuse with fresh cross-source packs and live leases'},
 'tools/security/discovery-installed-ledger-prefix.mjs': {'before': None,
 'after': {'mode': '100644',
           'sha256': 'af463726a5ea67f492ce1b95b8507ca279154c4e42296e34121c2a893ac00414'},
 'reason': 'Preserve original96 ledger, all288 historical protected path/mode/blob identities, complete ancestry/source/index closure and independent installed additions; recognize only exact committed rc18 and rc19 versions under the same hardened readGit interface; compose the prepared ad63 response-ID publisher correction with explicit rc20 software metadata and complete unchanged installed gates, preserve rc18/rc19 drafts, retain bounded read-only creation reconciliation and refuse interrupted retry without duplicate or replacement; Select the exact reviewed Alpha031b source and original1.41 public packet for the new rc21 edition; preserve historical releases, source identities and all authority restrictions; retain complete source/inventory/metadata checks and explicit accepted-public-body evidence reuse with fresh cross-source packs and live leases'},
 'tools/security/discovery-installed-ledger-prefix.test.mjs': {'before': None,
 'after': {'mode': '100644',
           'sha256': '2fc7f598bf97e4666477085d8b5775b957f0f3c36c183cfbcf2ab938281faab5'},
 'reason': 'Preserve all preceding ledger fixtures byte-for-byte; append one injected data-only case proving exact rc18/rc19 select installed controls while unknown rc20 and tampered rc19 do not; compose the prepared ad63 response-ID publisher correction with explicit rc20 software metadata and complete unchanged installed gates, preserve rc18/rc19 drafts, retain bounded read-only creation reconciliation and refuse interrupted retry without duplicate or replacement; Select the exact reviewed Alpha031b source and original1.41 public packet for the new rc21 edition; preserve historical releases, source identities and all authority restrictions; retain complete source/inventory/metadata checks and explicit accepted-public-body evidence reuse with fresh cross-source packs and live leases'},
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
 'scripts/release/recover-discovery-rc20.test.cjs': {'before': None, 'after': {'mode': '100644', 'sha256': 'e223d725f20de4ece38f60d08996964efaab096f4fb744df29112b692d3479f8'}, 'reason': 'Add25 inert owned recovery/diagnostic/dual-epoch regressions using the exact original creation ZIP; refuse identity/source/asset substitutions, duplicate tags, changed main,403publication, uncertain-outcome duplicate mutation, unqualified tooling, expanded runtime deltas and unauthorized caller context without real release operations; add the actual two-root service-module private-brand regression, preserving cross-root, forged, serialized and wrong-epoch refusals plus ordinary same-root behavior; Preserve25 preceding cases; add6 inert phase-transition/raw-Git/ownership/chronology/idempotency regressions with exact post-PATCH commit-date behavior, immutable source-metadata tamper refusal and already-public zeroPATCH reconciliation; preserve all original draft, asset, source, tag and private proof refusals; include last-tool-gate author movement with zero PATCH intent and zero mutation; Select the exact reviewed Alpha031b source and original1.41 public packet for the new rc21 edition; preserve historical releases, source identities and all authority restrictions; retain complete source/inventory/metadata checks and explicit accepted-public-body evidence reuse with fresh cross-source packs and live leases'},
 'integrations/alpha-agent/fixtures/alpha141-source-catalog.json': {'before': None, 'after': {'mode': '100644', 'sha256': 'd1c3cb9a5c3eb96e9e5eb111b83a713786ec18ed1213a407cd77bbaf018c5adb'}, 'reason': 'Retain exact031b catalog metadata for ordinary finite source-count regressions; no Alpha module execution or source-review approval'},
 'demo/AGI-Jobs-Platform-at-Kardashev-II-Scale/k2-stellar-demo/scripts/orchestrate.ts': {'before': {'blob': 'eeb99cc4368a23cef80a02d096fa51b71c7c5d95', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': '96fc9fe2b4b8f820e93a8d63a1667bb16727e3e45b81d9dde7d2299e4e787112'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'demo/AGI-Jobs-Platform-at-Kardashev-II-Scale/scripts/run-kardashev-demo.ts': {'before': {'blob': '9f3bf0d7c0d775b623588b40f78ba06585737067', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': '1117af383d2908ef3e1ff447b2ffbee4fbb9b87b76282fefd578a31b86c970c9'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'demo/CULTURE-v0/backend/arena-orchestrator/package-lock.json': {'before': {'blob': 'b0d0241e7a1213ba6424e6cfa3865024d12f7e99', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': 'd63ce18a6a5594f5bfb77e24f021a043e4f2f756f131e258b8e10917c7843dd8'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'demo/CULTURE-v0/backend/arena-orchestrator/package.json': {'before': {'blob': '12fd32fb16dc1d6a37bea2345aa36f5dd6ee5852', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': 'ffaf6bb0dae1342d61834b600daf846d38b0e0abad01a7d4870091064db58bf0'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'demo/CULTURE-v0/indexers/culture-graph-indexer/src/config.ts': {'before': {'blob': 'a29679084b84c7cfaec9ca26db973d0554eb3884', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': 'b085c9e12e95a06c61ddd5e655975f68b33d76a608792c0820e40a6a369d970d'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'demo/CULTURE-v0/package.json': {'before': {'blob': '3eb309067cef947a7773075e41805baa41237187', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': 'ebed3eb0a66604b146c46719dac6040200b0b9dcac2ece9dd7858c5e710e9473'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'demo/CULTURE-v0/scripts/export.weekly.ts': {'before': {'blob': '68041b71f59f0efe8e6de235c3432c37fd54d98b', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': 'c08446a6bdcb68904be8c03d5370162d2cf0d0b67a8dd3ba8fa8259dcb460da0'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'demo/CULTURE-v0/scripts/utils.ts': {'before': {'blob': 'b83244a1b13189177b4c031e83a0ced48bca2599', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': '032673bc0b7623e7df2f6be9a27c525fce7f5f5ea1058569a50763da59a5da77'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'demo/Economic-Power-v0/package-lock.json': {'before': {'blob': 'f3590a4a6395db24c1dcd12b36ccbd06f23b2c37', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': '6463ce55754cac47647e41777201564073ef13fce8e4cbdc8fd0bff574b38c46'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'demo/Economic-Power-v0/package.json': {'before': {'blob': '94aad8672ec1a0bd8d7c06d8f4773e54c083b8d8', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': '9d3298dc18cb8b85ef3a69055655d9b9696931e01d68cc4e96e7dd91850a5fd7'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'demo/Phase-8-Universal-Value-Dominance/package-lock.json': {'before': {'blob': '1cd3c494ed1363940fb6b204d12fd90260d91137', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': 'e9ab88ea1c141dc064359809a0c12262fafa5b5a96faac7f050f56ed0050d223'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'demo/Phase-8-Universal-Value-Dominance/package.json': {'before': {'blob': 'cdb5743602868446f07fb58f7ff8ca35d3843920', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': '1d729964ab485b468981cf6395793a4de6ee44ff0b83214c99cc17323399d83c'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'demo/Phase-8-Universal-Value-Dominance/scripts/contract-extensions.ts': {'before': {'blob': '0fd919e6e85d26230c15a892b1b97bec1129555f', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': '6e0dc6a3ce6a7802288ad00a66618111f09763cc2dee413b084372721e3e8071'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'demo/Phase-8-Universal-Value-Dominance/scripts/owner-console.ts': {'before': {'blob': 'ccc95634b51e27179c9326c67bf1b4099cd75116', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': '6f27172e8e5b3a98ef84324192911f9faf0ffbc9ecfbb5f18d04c6eb26dba3b3'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'demo/Phase-8-Universal-Value-Dominance/scripts/run-phase8-demo.ts': {'before': {'blob': '4e95bbaf59896464bc3280cc2f96f9e2c22fb250', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': '88483e191eb29ebbbab99073b9f37efa26682065bacf29e14360a37b2e5a2ffd'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'packages/onebox-orchestrator/package.json': {'before': {'blob': 'e08de284472c3f1a1921d7887a8d990381732253', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': '3f754db8a0dd946a7526599df5b0caff92c38d87ad3625f70fae80fa42ebf8c1'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'packages/onebox-orchestrator/src/ics/parser.ts': {'before': {'blob': '4ab314bc2ca7bc6f9c160a656285029fa7fef574', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': 'a6e3076d9d919c0dec80164500489bc618f6d77a4fbfa417103a9ea3200699b7'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'packages/onebox-orchestrator/src/ics/schema.ts': {'before': {'blob': '386e22fcd6bde75484be03278b7380ee5adb7d72', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': 'fb129824d956ab675adc97dbce0a3715d546f2b9bb4b4940f0a9084d1da2ce7f'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'packages/onebox-sdk/package-lock.json': {'before': {'blob': '3312d88acd17c20dca690b98994226bf372e31b1', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': '637988bb6e28ce878f8758621b35eea6845d60ee2d2352c0069f925c17512a3b'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'packages/onebox-sdk/package.json': {'before': {'blob': 'e3cf9377c6b07619d654467b46bd75dd299f6467', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': '5a0daa9ff47ad54e55b1e707008a967c1e8ffe07afda9cf05944d6211f2749cf'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'packages/onebox-sdk/src/types.ts': {'before': {'blob': 'df7675bec02578aba3eb904d3100527b5923131b', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': '07be709eb5d8de611fc21908b0ba62f4943728c398508ef270c3918a12ab0e99'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'packages/orchestrator/package-lock.json': {'before': {'blob': 'c607b9c8d1cb7b0fab697d3fe0da99da4e1193ca', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': '5ee1d0f8ef2a1064659b7257a6630131c8e0aefea234a7237f21206b8c41d208'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'packages/orchestrator/package.json': {'before': {'blob': 'ee5b19d83a68e5a6641e292868f22aa2e6176ad5', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': 'b054390f48c1fafa88a5444cce6159c52cc611cedb1f1a65257546570b5742c8'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'packages/orchestrator/src/ics.ts': {'before': {'blob': '71a9fc6c9b6fafd86988fbce2efe7283444e89ec', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': '6ffc6803023c3f103900df86bb012d3e1bcdc7ef9a9254d33716e78f0ad9d873'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'scripts/v2/lib/nationalSupplyChainTranscript.ts': {'before': {'blob': '99684f946e0d8437bda678863a86a90bd5d1d66d', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': '89eaf2c0f7c4d37b88511a4533974390778432cab962246f6134738eb4426592'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'scripts/v2/lib/nationalSupplyChainTranscriptSchema.ts': {'before': {'blob': 'bb808ed298fbaf6de33e5fc83a1baa0d4cf3a635', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': 'dbc4042b8dad04b53c2bb7834f2bf2a0a390818da29423a9b7fc62c50969e411'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'services/arena/package.json': {'before': {'blob': '067e57a0e35d47b965fa1a13d772e6d87163da07', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': 'd396e3636f7d29fcff20851ed3f0388fc4efd825c02e1f8b3517e788e5f523ae'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'services/arena/src/validators.ts': {'before': {'blob': '1a08cf257e91dc920d53cf383f72e23c34eccc9a', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': '4d8b5b376aabfd8be11e0dfb9e7484aa6e1725618a614a7da459b1c4bc256d5f'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'services/culture-graph-indexer/package-lock.json': {'before': {'blob': '141183f8e9d0f76429bb54ba99bebdb017a7fd00', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': 'ff1cfb68136306323ad6b8cf7b7ab071574c5785580016c08f515a1c364f47e0'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'services/culture-graph-indexer/package.json': {'before': {'blob': 'bd34a94c20617dd55cdcdf0c940f05b8d0fd7db9', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': 'ceea39c24608e9fcf178b99f354c52491fd41e6e866af2bb0ebeea2f731fee25'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'services/culture-graph-indexer/src/config.ts': {'before': {'blob': '8fd334f2aa0ed28b159f5c6b6df0b2f12ba0c420', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': '5624093cbe1d82084158e67b79be907451232ef911ab9895a0210127a07afca9'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'scripts/security/test/zod-compat.test.cjs': {'before': None, 'after': {'mode': '100644', 'sha256': 'dcc8515f044dabd5c47a499a72132b73438ca88e6021b74dde5999680057da83'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'demo/sovereign-constellation/server/package-lock.json': {'before': {'blob': '25ad5ef80fdf9a93e4c83bb3254bfcf5245a51c4', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': '4b89e11752da53dcceb5c4c25b6e47ad2227d8583b43b441618a8f89a9269728'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'demo/sovereign-mesh/server/package-lock.json': {'before': {'blob': '4955d1e7b717048638ca249be7daf694cce2f69a', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': 'c60661935f616fae98ddad047b8f2726e8ee4296bdac8c3e8fb7383d3985af0d'}, 'reason': 'Patch the observed application dependency advisories using actual Zod4.6.6 and preserve existing schema semantics, fixed source binding and the seven protected root dependency identities'},
 'CHANGELOG.md': {'before': {'mode': '100644', 'blob': '862a0a221178006cc1ab2e0d5324b09f25698356'}, 'after': {'mode': '100644', 'sha256': '283386480ce4e4b402b57b4fc7634929ce453a580ae376d61f3bc0936cb7e8e0'}, 'reason': 'Select the exact reviewed Alpha031b source and original1.41 public packet for the new rc21 edition; preserve historical releases, source identities and all authority restrictions; retain complete source/inventory/metadata checks and explicit accepted-public-body evidence reuse with fresh cross-source packs and live leases'},
 'README.md': {'before': {'blob': '9d0d52e35f8798d9cd22c70ec2adb13e467a3379', 'mode': '100644'}, 'after': {'mode': '100644', 'sha256': '1f6f108b93a3b198f7dabf3bd494d9941fa2f891510f8a774abf7fede149cae0'}, 'reason': 'Select the exact reviewed Alpha031b source and original1.41 public packet for the new rc21 edition; preserve historical releases, source identities and all authority restrictions; retain complete source/inventory/metadata checks and explicit accepted-public-body evidence reuse with fresh cross-source packs and live leases'},
 'config/discovery-alpha141-retained-public-assets-v1.json': {'before': None, 'after': {'mode': '100644', 'sha256': '56f42c02d933f72022466ef4b782220b8d3d7e94925066f8adfc1c3902789d6a'}, 'reason': 'Select the exact reviewed Alpha031b source and original1.41 public packet for the new rc21 edition; preserve historical releases, source identities and all authority restrictions; retain complete source/inventory/metadata checks and explicit accepted-public-body evidence reuse with fresh cross-source packs and live leases'},
 'scripts/release/alpha141-retained-public-assets.cjs': {'before': None, 'after': {'mode': '100644', 'sha256': '009ee8fb81824ba71c6d4149737f5c07089b1268a2fee239be3140c77798b13f'}, 'reason': 'Select the exact reviewed Alpha031b source and original1.41 public packet for the new rc21 edition; preserve historical releases, source identities and all authority restrictions; retain complete source/inventory/metadata checks and explicit accepted-public-body evidence reuse with fresh cross-source packs and live leases'},
 'scripts/release/alpha141-retained-public-assets.test.cjs': {'before': None, 'after': {'mode': '100644', 'sha256': '9b958fad35d413e2186b56148af1d4fc392f770c3a3d90a0d2845dfc72c79aed'}, 'reason': 'Select the exact reviewed Alpha031b source and original1.41 public packet for the new rc21 edition; preserve historical releases, source identities and all authority restrictions; retain complete source/inventory/metadata checks and explicit accepted-public-body evidence reuse with fresh cross-source packs and live leases'},
 'scripts/release/fixtures/alpha141-original-browser-producer.json': {'before': None, 'after': {'mode': '100644', 'sha256': 'd4e837ab66e511f83923d3328e8304981ab70312b67670103d90ae32a67f852b'}, 'reason': 'Select the exact reviewed Alpha031b source and original1.41 public packet for the new rc21 edition; preserve historical releases, source identities and all authority restrictions; retain complete source/inventory/metadata checks and explicit accepted-public-body evidence reuse with fresh cross-source packs and live leases'},
 'scripts/release/fixtures/alpha615-reviewed-pin.json': {'before': None, 'after': {'mode': '100644', 'sha256': '7b6ac047905dc27da219cb2608a92b590380bb2781d155afe15734af1173b0f3'}, 'reason': 'Select the exact reviewed Alpha031b source and original1.41 public packet for the new rc21 edition; preserve historical releases, source identities and all authority restrictions; retain complete source/inventory/metadata checks and explicit accepted-public-body evidence reuse with fresh cross-source packs and live leases'},
 'scripts/release/fixtures/alpha615-reviewed-transition.json': {'before': None, 'after': {'mode': '100644', 'sha256': '0deb6eb67ee8e10d54d17ba6e3146b581c13909eb44bc9f801328adae7e9e47a'}, 'reason': 'Select the exact reviewed Alpha031b source and original1.41 public packet for the new rc21 edition; preserve historical releases, source identities and all authority restrictions; retain complete source/inventory/metadata checks and explicit accepted-public-body evidence reuse with fresh cross-source packs and live leases'}}
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
            and transition['fromPinSha256'] in (UNSET_ALPHA_SHA256, ALPHA_615_PIN_SHA256),
            'Alpha transition framing differs')
    successor_alpha141 = transition['fromPinSha256'] == ALPHA_615_PIN_SHA256
    if successor_alpha141:
        require(all(pin.get(key) == value for key, value in ALPHA_141_TARGET.items()),
                'Reviewed615 successor is restricted to the exact Alpha141 source')
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
    if successor_alpha141:
        require(review.get('publicationApproved') is False
                and review.get('installedCompatibilityAccepted') is False
                and review.get('externalExecution') == 'unprovisioned',
                'Alpha141 source transition cannot claim publication or installed acceptance')
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
