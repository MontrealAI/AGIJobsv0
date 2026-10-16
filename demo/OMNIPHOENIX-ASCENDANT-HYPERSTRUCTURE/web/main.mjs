import { desk } from './engine.mjs';
import { mountDesk } from './app.mjs';
try {
  const response = await fetch('./plan.json');
  if (!response.ok) throw Error('The original plan could not be loaded.');
  mountDesk(document, desk, new Uint8Array(await response.arrayBuffer()));
} catch (error) {
  document.getElementById('status').textContent = error.message;
  document.getElementById('status').dataset.state = 'error';
}
