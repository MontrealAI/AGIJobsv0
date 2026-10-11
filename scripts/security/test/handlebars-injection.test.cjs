'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const Handlebars = require('handlebars');

// Harmless local markers for GHSA-8r5x-fm3f-whwj and the earlier AST guards.
for (const kind of ['block-params-length', 'number-literal']) {
  for (const mode of ['compile', 'precompile']) {
    test(`patched Handlebars ${mode} does not execute ${kind} AST injection`, () => {
      const H = Handlebars.create();
      const ast = kind === 'block-params-length' ? H.parse('{{#if ok}}safe{{/if}}') : H.parse('{{identity 1}}');
      const marker = '__agiDependencyInjection';
      if (kind === 'block-params-length') {
        ast.body[0].program.blockParams = { length: '(globalThis.__agiDependencyInjection = true, 0)' };
      } else {
        ast.body[0].params[0].value = '(globalThis.__agiDependencyInjection = true, 0)';
      }
      globalThis[marker] = false;
      const context = { [marker]: false };
      try {
        try {
          const template = mode === 'compile' ? H.compile(ast) :
            H.template(vm.runInNewContext('(' + H.precompile(ast) + ')', context, { timeout: 1000 }));
          template({ ok: true }, { helpers: { identity: (value) => value } });
        } catch { /* A validation error is the expected secure result. */ }
        assert.equal(globalThis[marker], false);
        assert.equal(context[marker], false);
      } finally { delete globalThis[marker]; }
    });
  }
}
