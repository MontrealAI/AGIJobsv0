import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { renderEcosystemMap } from '../../scripts/pages/ecosystem-map.mjs';

test('four-system map keeps distinct protocols and direct destinations inspectable without JavaScript', () => {
  const document = new JSDOM(renderEcosystemMap()).window.document;
  const map = document.querySelector('#ecosystem-map');
  assert.equal(map.getAttribute('aria-labelledby'), 'ecosystem-map-title');
  assert.equal(map.querySelectorAll('h2').length, 1);
  assert.deepEqual(
    [...map.querySelectorAll('.ecosystem-card a')].map((a) =>
      a.getAttribute('href')
    ),
    [
      'https://montrealai.github.io/AGI-Alpha-Agent-v0/',
      '#explore',
      'https://montrealai.github.io/AGIJobManager/',
      'https://montrealai.github.io/AGI-Fleet-Linux/start.html',
    ]
  );
  assert.match(map.textContent, /AGIALPHA JobRegistry/);
  assert.match(map.textContent, /USDC contracts are separate systems/);
  assert.match(
    map.textContent,
    /does not transfer a task, connect a wallet or authorize work/
  );
  assert.equal(map.querySelectorAll('script, iframe, input, button').length, 0);
});
