# Develop strategies and test them through computer use

Use the [free Computer Use mission](https://montrealai.github.io/AGIJobsv0/successor/computer/)
to improve a bounded procurement recommendation. Start with the guided example,
compare constructed strategies, and inspect why a changed question can reveal a
better plan without weakening the buyer's requirements. No purchase is made.

The browser laboratory works without an account, wallet or API key. It prepares
an inspectable recommendation and a task for a computer-using worker. Running a
scripted browser exercise, running a model provider, checking an outcome and
authorizing real work are separate steps.

## Start with the buyer's actual need

The original fictional example needs 40 units in total, with at least 10 available
by day 7 and all 40 by day 14. The budget is USD 510.00 (51,000 cents). Its three public demo offers
are:

| Supplier   | Unit price in USD | One shipping charge per supplier in USD | Arrival day |
| ---------- | ----------------: | --------------------------------------: | ----------: |
| Stellar    |             12.00 |                                   10.00 |           7 |
| Laurentian |              7.00 |                                   20.00 |          12 |
| Boreal     |             14.00 |                                    0.00 |           5 |

Buying all 40 from Stellar costs USD 490.00 and meets the need. Buying all 40 from
Laurentian costs USD 300.00 but misses the early requirement. Buying all 40 from
Boreal costs USD 560.00 and exceeds the budget.

A staged plan buys 10 from Stellar and 30 from Laurentian. Including both shipping
charges, it costs USD 360.00 and meets both deadlines. The USD 130.00 difference is a
calculation on this disclosed fictional scenario; it is not observed customer
savings or a claim about real supplier availability.

A conventional two-delivery comparison also finds USD 360.00. The constructed
strategy does not uniquely discover this plan or outperform that credible
alternative. Its comparison with USD 490.00 changes the extra workflow assumption;
it is not a same-task algorithmic improvement.

If the buyer instead requires **all 40 by day 7**, that becomes a hard
requirement. The later Laurentian shipment cannot be used to make a cheaper plan
appear acceptable. Stellar's USD 490.00 plan remains the feasible comparison. A useful
reframing preserves the real need; it cannot rewrite an inconvenient deadline.

## What Level 3 and Level 4 mean here

**Level 3 develops the strategy itself.** The bounded search constructs and
revises typed programs for examining offers and planning quantities. Inspect the
program, its parents, the changed operations, the development results and the
failed attempts. The method is frozen before a fresh case is examined. Changing
a program after that test creates a new candidate, rather than rewriting the old
candidate's record.

**Level 4 challenges an extra assumption.** Buying from one supplier is one way
to meet the buyer's demand, but it is not necessarily part of the demand. A staged
allocation can change that formulation while preserving quantities, deadlines,
budget and the requirement to make only a recommendation. The laboratory shows
the original and reframed plans with their checks. Approval authorizes a local
comparison only. It does not authorize procurement or establish general
transformational intelligence.

The search space and checker are deliberately bounded. A local program search
can demonstrate a different strategy on these cases; it does not demonstrate
open-ended invention or autonomous business judgment. Visible controls and fresh
cases help examine the result, but do not create protected independent proof.

## Use the public procurement desk

Open the desk from the mission. Read the brief and supplier offers, enter a
proposed allocation, and ask the desk to check it. Its quantity, deadline and
budget checks give a concrete outcome. The same public desk can be operated with
a keyboard and mouse by a person or an authorized computer-using worker.

Download the mission record before leaving. Keep the strategy, its lineage, the
frozen comparison, the requirements and the recommendation together. Reopening
a record checks its bindings; a checksum authenticates neither an author nor a
reviewer. Imported evidence cannot grant authority or turn an unqualified result
into independent proof.

The task export asks a worker to use the desk and retain the result. For the
no-key route, copy the task into an existing ChatGPT Work session that has browser
or computer access. Restrict it to the public demo desk and request screenshots
and the final allocation. The task does not connect a worker automatically or
guarantee that the selected session has the required capability.

## Reproduce actual browser interaction locally

Start in the AGI Jobs checkout on Linux with `/proc` available. Use Python 3.12
for this setup; the retained Alpha runtime supports Python 3.11 through 3.13.
Install the Node version in `.nvmrc` with your Node version manager. With `nvm`
already installed:

```bash
nvm install
nvm use
npm ci
git clone --no-checkout https://github.com/MontrealAI/AGI-Alpha-Agent-v0.git ../AGI-Alpha-Agent-v0-computer
git -C ../AGI-Alpha-Agent-v0-computer checkout --detach 70dac8e5ce739978f5cd96d0fc190b6ebfcdf8d7
python3.12 -m venv .venv-successor-computer
. .venv-successor-computer/bin/activate
python -m pip install pydantic==2.14.0 httpx==0.28.1 cryptography==50.0.1 playwright==1.63.0
python -m playwright install --with-deps chromium
python integrations/alpha-agent/successor-computer-mission-lab.py \
  --alpha-source ../AGI-Alpha-Agent-v0-computer \
  --node "$(command -v node)" \
  --output reports/my-computer-positive
```

The output directory must be new. Playwright uses the browser installed for its
exact package version. If your environment requires a reviewed local binary, add
`--chromium-executable /absolute/path/to/chromium`; the evidence records that
actual executable's identity. This host laboratory checks the trusted Alpha
runtime closure and retains screenshots, action records, the task, the desk
source and the checked allocation. Docker isolation requires its separate
operator qualification.

The default local exercise uses a **scripted adviser**. Its browser actions and
screenshots are real; its advice is predetermined. A successful run checks the
computer-action transport and this task's outcome. It does not establish a
frontier model's ability to discover the plan or operate the desk independently.
Usage and cost remain unknown unless the actual provider supplies attributable
records.

Run the two negative cases and prepare a separate operator package:

```bash
python integrations/alpha-agent/successor-computer-mission-lab.py \
  --alpha-source ../AGI-Alpha-Agent-v0-computer \
  --node "$(command -v node)" --output reports/my-computer-late --inject-error late
python integrations/alpha-agent/successor-computer-mission-lab.py \
  --alpha-source ../AGI-Alpha-Agent-v0-computer \
  --node "$(command -v node)" --output reports/my-computer-forged --inject-error false-allocation
python integrations/alpha-agent/successor-computer-mission-lab.py \
  --alpha-source ../AGI-Alpha-Agent-v0-computer \
  --node "$(command -v node)" --output reports/my-computer-operator --prepare-only
```

| Case                 | Expected exit status | Inspect                                                              |
| -------------------- | -------------------: | -------------------------------------------------------------------- |
| Default positive     |                    0 | `accepted: true`, actual browser observations, `liveProvider: false` |
| Late-only allocation |                    1 | `accepted: false` and retained failure evidence                      |
| Falsified allocation |                    1 | `accepted: false` after comparing delivered claims with source facts |
| Prepare only         |                    0 | Task and instructions; no provider or browser execution              |

The negative modes apply to the default fixture. For a changed mission, supply
`--report /path/to/successor-computer-report.json` in a positive or prepare-only
run. The browser desk supports its three named supplier identities; an unsupported
supplier profile is rejected. Inspect `evidence.json`, `review.json` and
`receipt.json` from an executed case. The prepared package includes
`alpha-computer-task.json`, `supplier-desk.html`, `frozen-mission-report.json`,
`execution-manifest.json`, `alpha-operator-commands.json`,
`alpha-operator-commands.txt` and `chatgpt-work-mission.txt`.

For the public no-key route, inspect the generated Work task and verify that the
desk displays the exact requirements and offers. A changed mission must use its
matching desk rather than silently falling back to the default example.

Provider credentials stay in the local operator environment. Do not paste them
into the browser mission, task, export, command arguments or committed files.

## Connect a model only through the separate operator route

The [official OpenAI Computer Use guide](https://developers.openai.com/api/docs/guides/tools-computer-use),
checked on 18 October 2026, documents the Responses API `computer` tool with
`gpt-6.1-sol`. A returned `computer_call` contains ordered actions; the application
executes them and returns a `computer_call_output` containing the resulting
screenshot. For `gpt-6-astra`, the guide recommends code execution for computer
interaction, while retaining the native `computer` tool as a supported
alternative.

Use the separately installed, reviewed `alpha-agent` CLI and inspect
`reports/my-computer-operator/alpha-operator-commands.txt`. Choose an available
model and an admitted Docker image identified by its immutable digest. Set the
generated command's local image, model, operator home and new result-directory
placeholders. Provision the provider key through the named environment variable
using your secret manager. Then prepare the exact task:

```bash
alpha-agent successor-computer prepare reports/my-computer-operator/alpha-computer-task.json \
  --image "$SUCCESSOR_COMPUTER_IMAGE" --model "$SUCCESSOR_COMPUTER_MODEL" \
  --provider responses --key-env OPENAI_API_KEY
```

Inspect the returned commitment. Place that exact value in
`SUCCESSOR_COMPUTER_PERMIT` only when you authorize the bounded run, then use the
generated command:

```bash
alpha-agent --home "$SUCCESSOR_OPERATOR_HOME" successor-computer run \
  reports/my-computer-operator/alpha-computer-task.json \
  --image "$SUCCESSOR_COMPUTER_IMAGE" --model "$SUCCESSOR_COMPUTER_MODEL" \
  --provider responses --key-env OPENAI_API_KEY \
  --permit "$SUCCESSOR_COMPUTER_PERMIT" --output "$SUCCESSOR_NEW_RESULT_DIRECTORY"
```

Configuration, account access, provider compatibility and isolation must be
qualified on the actual task. The scripted lab result does not qualify either
model or establish that a live provider call succeeded. An image name, model name
or imported execution flag is not evidence that the corresponding runtime ran.

## Know which evidence you have

| Evidence                                           | What it supports                                                                      | What remains unestablished                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Local strategy search and exact allocation checks  | The recorded programs and plans behave as checked on these inputs                     | General strategy invention or real business advantage                   |
| Scripted adviser with real Chromium screenshots    | The recorded computer actions executed and the observed desk result matched its check | Autonomous provider judgment or model quality                           |
| Live provider run with retained records            | That exact provider session and its observed outcome                                  | Broad reliability, independent superiority or operational authorization |
| Separate independent acceptance and owner decision | The bounded decision actually reviewed and authorized                                 | Any authority outside its explicit scope                                |

**Alpha** is the advantage worth pursuing. The **Gym** develops methods.
**Specialist ASI** requires earned, mission-specific superiority on agreed fresh
protected work. **SUCCESSOR Ω** preserves useful methods and memory after proof
and explicit bounded authorization. This laboratory awards no Specialist ASI
designation and creates no execution, purchasing, payment or blockchain
authority.
