import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyEmpowermentSkipLink } from '../../scripts/pages/empowerment-browser-qa.mjs';

function fixture({
  href = '#main',
  focused = true,
  timeout = false,
  keyError = null,
  targetCount = 1,
} = {}) {
  let url = 'http://127.0.0.1:4321/AGIJobsv0/experiments/empowerment/';
  const calls = [];
  let resolveNavigation;
  const page = {
    url: () => url,
    locator(selector) {
      if (selector === 'a.skip')
        return {
          getAttribute: async (name) => {
            assert.equal(name, 'href');
            return href;
          },
          focus: async () => {
            calls.push('focus');
          },
          evaluate: async () => focused,
        };
      assert.equal(selector, 'main#main');
      return { count: async () => targetCount };
    },
    waitForURL(destination, options) {
      calls.push('wait');
      assert.equal(destination, url + '#main');
      assert.deepEqual(options, { timeout: 5000 });
      if (timeout) return Promise.reject(new Error('navigation timeout'));
      return new Promise((resolve) => {
        resolveNavigation = () => {
          url = destination;
          resolve();
        };
      });
    },
    keyboard: {
      async press(key) {
        calls.push(key);
        if (keyError) throw keyError;
        if (!timeout) setTimeout(resolveNavigation, 10);
      },
    },
  };
  return { page, calls };
}

test('skip QA waits for delayed navigation after exactly one actual Enter', async () => {
  const { page, calls } = fixture();
  await verifyEmpowermentSkipLink(page);
  assert.deepEqual(calls, ['focus', 'wait', 'Enter']);
  assert.equal(new URL(page.url()).hash, '#main');
});

test('invalid href or missing keyboard focus fails before activation', async () => {
  for (const options of [{ href: '#elsewhere' }, { focused: false }]) {
    const { page, calls } = fixture(options);
    await assert.rejects(verifyEmpowermentSkipLink(page));
    assert.ok(!calls.includes('Enter'));
  }
});

test('navigation timeout, keyboard failure and missing landmark remain failures without retries', async () => {
  for (const options of [
    { timeout: true },
    { keyError: new Error('keyboard failure') },
    { targetCount: 0 },
  ]) {
    const { page, calls } = fixture(options);
    await assert.rejects(verifyEmpowermentSkipLink(page));
    assert.equal(calls.filter((call) => call === 'Enter').length, 1);
  }
});

test('a pre-existing destination cannot substitute for keyboard navigation', async () => {
  const { page, calls } = fixture();
  page.url = () =>
    'http://127.0.0.1:4321/AGIJobsv0/experiments/empowerment/#main';
  await assert.rejects(
    verifyEmpowermentSkipLink(page),
    /Start before skip navigation/
  );
  assert.deepEqual(calls, []);
});
