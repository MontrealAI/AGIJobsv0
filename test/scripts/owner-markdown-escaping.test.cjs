'use strict';

// Preserve the original CI entry while checking actual rendered literal values.
// The full suite retains pipe/backslash and newline cases, with Markdown/HTML,
// adjacent-cell, import-safety and CLI regressions instead of output-string coupling.
require('./owner-report-markdown.test.cjs');
