import {
  fields,
  defaults,
  planCapacity,
  examples,
  taskDraft,
} from './computer-work-model.mjs';
import { html } from './runtime.js';

const panel = document.querySelector('#computer-work');
const guide =
  'https://github.com/MontrealAI/AGIJobsv0/blob/main/demo/AGI-Jobs-Platform-at-Kardashev-II-Scale/COMPUTER-WORK.md';
const fragments = (parts) => parts.reduce((a, b) => html`${a}${b}`, html``);
const repo = 'https://github.com/MontrealAI/AGIJobsv0';
const number = (value) => new Intl.NumberFormat('en-US').format(value);
const usd = (value) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);

if (panel) {
  try {
    panel.innerHTML = html` <span class="cw-kicker"
        >Computer work · From a scoped task to a work fabric</span
      >
      <h2 id="computer-work-title">
        A civilization-scale vision starts with verifiable work.
      </h2>
      <p>
        Explore ten concrete digital-work scopes, inspect their deliverables,
        and plan throughput against independent review capacity. OpenClaw with
        the Codex Computer Use harness and ChatGPT Work can operate supported
        desktop applications; actual capability depends on the task,
        permissions, environment and evidence.
      </p>
      <p class="cw-note">
        <strong>Interactive planning exercise.</strong> This panel runs locally,
        makes no provider requests and grants no authority. The USD 40 trillion
        annual market is a user-supplied planning assumption, not a verified
        market estimate or a claim that all human work is automatable.
      </p>
      <div class="cw-grid">
        <article class="cw-step">
          <h3>1 · Define the job</h3>
          <p>
            Choose a synthetic example. Inspect inputs, allowed origins,
            artifact formats and independently testable acceptance criteria.
          </p>
        </article>
        <article class="cw-step">
          <h3>2 · Commission a worker</h3>
          <p>
            Prefer a structured API or MCP for repeatable operations. Use
            computer interaction where visual work is necessary. Admit the exact
            task digest to an isolated worker profile.
          </p>
        </article>
        <article class="cw-step">
          <h3>3 · Review the evidence</h3>
          <p>
            Collect artifact hashes and execution evidence. Hold uncertain
            outcomes for reconciliation. Independent review and contract
            finalization precede any settlement.
          </p>
        </article>
      </div>
      <h3>Explore a complete task scope</h3>
      <label for="cw-example"
        >Synthetic work example<select id="cw-example">
          ${fragments(
            examples.map(
              (item) => html`<option value="${item.id}">${item.title}</option>`
            )
          )}
        </select></label
      >
      <div id="cw-task" class="cw-task"></div>
      <div class="cw-actions">
        <button type="button" id="cw-download">
          Download task draft (JSON)</button
        ><a href="${guide}"
          >Runbook, live commissioning and evidence requirements</a
        >
      </div>
      <p id="cw-download-status" role="status">
        Drafts use k2_sandbox and loopback port 4175. They require an
        operator-provided workspace; they are not approved jobs.
      </p>
      <details>
        <summary>Inspect the exact task JSON</summary>
        <pre id="cw-json"></pre>
      </details>
      <h3>Plan workers and reviewers together</h3>
      <p>
        Change assumptions to expose the bottleneck. All submitted jobs require
        review; only the assumed accepted fraction contributes to modeled gross
        job value.
      </p>
      <div class="cw-fields">
        ${fragments(
          fields.map(
            ([id, label, min, max, value]) =>
              html`<label for="cw-${id}"
                >${label}<input
                  id="cw-${id}"
                  name="${id}"
                  type="number"
                  step="1"
                  min="${min}"
                  max="${max}"
                  value="${value}"
                  required
              /></label>`
          )
        )}
      </div>
      <div class="cw-actions">
        <button type="button" id="cw-reset">Reset planning assumptions</button>
      </div>
      <p id="cw-planning-status" role="status" aria-live="polite"></p>
      <div id="cw-results" class="cw-results"></div>
      <details>
        <summary>Calculation rules and limits</summary>
        <p>
          Submitted = workers × jobs per day × operating days. Review capacity =
          floor(reviewers × review hours × 60 × operating days / review
          minutes). Reviewed = min(submitted, review capacity). Accepted =
          floor(reviewed × acceptance percentage / 100). Gross job value =
          accepted × assumed USD value. Market fraction = gross job value /
          assumed annual market.
        </p>
        <p>
          This is a steady-state annual capacity calculation. It excludes worker
          failures, reviewer fatigue, provider cost, retries, demand, taxes,
          implementation lead time and treasury constraints. Gross job value is
          neither protocol revenue nor profit, and is unrelated to the fictional
          energy or token ledgers below.
        </p>
      </details>
      <details>
        <summary>
          Run an actual browser fixture and inspect a rejected result
        </summary>
        <p>
          From a trusted checkout at the repository root, use the pinned Node
          toolchain and installed dependencies:
        </p>
        <pre>
npm run build:orchestrator
npx playwright install chromium
npm run demo:computer-work
npm run demo:computer-work -- --inject-error</pre
        >
        <p>
          The first run opens a local synthetic Supplier Desk with Chromium,
          compares quotes and generates evidence. The injected late-supplier
          recommendation must be rejected with exit code 1. Both runs use a
          local fixture gateway; neither demonstrates a live OpenClaw provider
          or places an order.
        </p>
        <p>
          Evidence is written under reports/computer-work/.
          <a href="${repo}/tree/main/demo/One-Box/computer-work"
            >Inspect the fixture and independent reviewer</a
          >.
        </p>
      </details>
      <details>
        <summary>Connect OpenClaw or ChatGPT Work responsibly</summary>
        <p>
          OpenClaw: enable the Codex plugin's computerUse configuration and
          strictReadiness: true, provision its native service, and verify /codex
          computer-use status plus a harmless real desktop probe. The HTTP
          /v1/responses endpoint is disabled by default; its shared-secret token
          carries full gateway operator authority. Use a dedicated trust
          boundary and OS-enforced scope.
        </p>
        <p>
          ChatGPT Work: install and enable the Computer Use plugin, grant
          required OS permissions, choose allowed applications and a bounded
          task, then export evidence for separate review. Windows targets must
          remain visible and unlocked. Work is an operator workflow, not an
          invented remote API.
        </p>
        <p>
          Never place tokens in task JSON. Screens, documents and tool outputs
          are untrusted inputs. Desktop completion alone cannot authorize
          publication, payments or a contract result.
        </p>
        <p>
          <a href="https://docs.openclaw.ai/plugins/codex-computer-use"
            >OpenClaw Computer Use</a
          >
          ·
          <a href="https://docs.openclaw.ai/gateway/openresponses-http-api"
            >OpenClaw HTTP API</a
          >
          ·
          <a href="https://learn.chatgpt.com/docs/computer-use"
            >ChatGPT Work guide</a
          >
          ·
          <a href="${repo}/blob/main/docs/computer-work.md"
            >Repository worker integration guide</a
          >
        </p>
      </details>`.toString();

    const selector = panel.querySelector('#cw-example');
    function showTask() {
      const task = taskDraft(selector.value);
      panel.querySelector('#cw-task').innerHTML = html` <div>
          <h3>Goal and supplied inputs</h3>
          <p>${task.goal}</p>
          <p>${task.inputText}</p>
        </div>
        <div>
          <h3>Independent acceptance checks</h3>
          <ul>
            ${fragments(
              task.acceptanceCriteria.map((item) => html`<li>${item}</li>`)
            )}
          </ul>
          <h3>Required deliverables</h3>
          <ul>
            ${fragments(
              task.deliverables.map(
                (item) => html`<li>${item.name} · ${item.mediaType}</li>`
              )
            )}
          </ul>
        </div>`.toString();
      panel.querySelector('#cw-json').textContent = JSON.stringify(
        task,
        null,
        2
      );
    }
    selector.addEventListener('change', showTask);
    panel.querySelector('#cw-download').addEventListener('click', () => {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(taskDraft(selector.value), null, 2) + '\n'], {
          type: 'application/json',
        })
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `k2-${selector.value}-task-draft.json`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      panel.querySelector('#cw-download-status').textContent =
        'Task draft downloaded. Inspect it and bind the exact digest to an operator-approved job before dispatch. No worker was contacted.';
    });
    function showPlan() {
      const status = panel.querySelector('#cw-planning-status');
      const output = panel.querySelector('#cw-results');
      try {
        const input = Object.fromEntries(
          fields.map(([id]) => {
            const field = panel.querySelector(`#cw-${id}`);
            return [id, field.value.trim() === '' ? NaN : field.valueAsNumber];
          })
        );
        const plan = planCapacity(input);
        status.className = '';
        status.textContent = `${plan.bottleneck} limits throughput. ${number(
          plan.backlog
        )} submitted jobs exceed annual review capacity; ${number(
          plan.rejected
        )} reviewed jobs are assumed rejected. ${number(
          plan.requiredReviewers
        )} reviewers would be required to review every submission at these assumptions.`;
        output.innerHTML = [
          ['Submitted jobs / year', number(plan.submitted)],
          ['Review capacity / year', number(plan.reviewCapacity)],
          ['Accepted jobs / year', number(plan.accepted)],
          ['Modeled gross job value', usd(plan.valueUSD)],
        ]
          .map(
            ([label, value]) =>
              html`<div class="cw-result">
                ${label}<strong>${value}</strong>
              </div>`
          )
          .join('');
        const fraction = document.createElement('p');
        fraction.textContent = `${
          plan.marketPercent === 0 ? '0' : plan.marketPercent.toPrecision(4)
        }% of the assumed annual market. This ratio is a scenario comparison, not a revenue forecast or proof of market capture.`;
        output.append(fraction);
      } catch (error) {
        output.replaceChildren();
        status.className = 'cw-error';
        status.textContent = `Planning input invalid: ${error.message} No result is shown.`;
      }
    }
    for (const [id] of fields)
      panel.querySelector(`#cw-${id}`).addEventListener('input', showPlan);
    panel.querySelector('#cw-reset').addEventListener('click', () => {
      for (const [id] of fields)
        panel.querySelector(`#cw-${id}`).value = defaults[id];
      showPlan();
    });
    showTask();
    showPlan();
    panel.dataset.status = 'ready';
  } catch (error) {
    panel.dataset.status = 'failed';
    panel.textContent = `Computer-work planning panel unavailable: ${error.message}. Read the computer-work runbook in the repository. No live work was performed.`;
    panel.setAttribute('role', 'alert');
  }
}
