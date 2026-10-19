# Put a real mission on your agent's desk

Open [SUCCESSOR Ω Mission Studio](https://montrealai.github.io/AGIJobsv0/successor/mission/)
([Français](https://montrealai.github.io/AGIJobsv0/successor/mission/fr/)) with a
business decision or mathematical question you actually want to investigate.
Prepare the question, source material and requirements, then give your own
Computer Use agent an exact task. Keep its strategies, experiments, evidence and
unresolved questions together so the next attempt can build on the last.

Preparing a mission is free and requires no account, wallet or API key. The site
creates the task and working desk. Your separately started agent or a person
performs the investigation; creating a mission does not mean it has been solved.

## Prepare a useful first mission

1. **Name the decision or question.** State what you need to learn and the outcome
   that would be useful. Identify your current approach and the strongest
   credible alternative you know.
2. **Keep the real requirements explicit.** Enter the constraints that must
   survive every proposed strategy or reframing. Examples include an immutable
   deadline, a complete cost ceiling, an assumption that a mathematical argument
   must preserve, or a prohibition on treating an unproved claim as a theorem.
3. **Supply public source material.** Give each source a title and its exact public
   HTTPS address, with an optional excerpt for the agent to examine. Confirm that
   the material is public, non-personal and permitted for use and export. URLs provide
   attribution; the website does not fetch or authenticate their contents.
4. **Prepare the mission.** Inspect the resulting brief and exact task before
   using your agent. Download the mission if you want to keep it.

The business and mathematics presets are starting briefs. Replace their question
or sources with material relevant to your work. Their strategy and evidence
ledgers start without completed findings. A preset is not a reported discovery,
business recommendation or mathematical proof.

## Start actual Computer Use

The public desk is a working interface with editable strategy, experiment and
evidence ledgers. A person or a computer-using agent can operate it through the
visible controls, keyboard and mouse.

For an existing ChatGPT Work session with browser or computer access:

1. Open the mission's public desk and confirm its brief and hard requirements.
2. Copy the generated Computer Use mission into your session and explicitly ask
   the agent to perform the bounded investigation.
3. Ask it to record methods considered, experiments actually performed, source
   evidence, objections and what remains unresolved. Retain the screenshots and
   action records actually produced.
4. Inspect the completed ledger and export it before leaving the page.

**Keep your record before closing or reloading.** Update this session keeps the
current tab's working record. Export the workspace to retain a file you can
restore later. Large records remain available in full even when they exceed the
native worker's handoff limit. In that case, use the operator handoff and restore
the complete exported package in the public workspace. The instructions bind
both the mission and workspace digests and require that exact package before
work begins. Prepare a separate bounded mission if you need a native task.

The copied task starts no session automatically. Your session's available tools,
permissions and usage terms govern the execution. The site does not connect to
your private computer or request a provider credential.

For your isolated Alpha runtime, download the **Alpha ComputerTask** and the
**exact local desk**. The task binds the mission and desk HTML. Use the separately
reviewed native `alpha-agent successor-computer prepare` and `run` route, an
explicitly selected available model, a digest-pinned admitted image and the exact
owner-reviewed permit. The [Computer Use integration guide](COMPUTER_USE_LEVELS.md)
describes the pinned runtime setup and authorization boundaries. Its supplier
exercise is a transport qualification; it does not establish success on your new
mission.

If you open the downloaded desk directly in a normal browser and a source
refuses embedding, use **Open exact source in a browser tab** in the reader.
The native worker uses its isolated reader and closes extra tabs.

In the directory containing your downloaded `successor-omega-computer-task.json`,
choose an available computer-use model and an admitted image by immutable digest.
Set `SUCCESSOR_COMPUTER_MODEL` and `SUCCESSOR_COMPUTER_IMAGE` to those reviewed
values, then prepare the exact task:

```bash
alpha-agent successor-computer prepare successor-omega-computer-task.json \
  --image "$SUCCESSOR_COMPUTER_IMAGE" --model "$SUCCESSOR_COMPUTER_MODEL" \
  --provider responses --key-env OPENAI_API_KEY
```

Inspect the returned commitment and exact requested sources, bounds and task.
Only after authorizing that run, set `SUCCESSOR_COMPUTER_PERMIT` to the returned
commitment, `SUCCESSOR_OPERATOR_HOME` to your reviewed operator home and
`SUCCESSOR_NEW_RESULT_DIRECTORY` to a new result directory. Execute:

```bash
alpha-agent --home "$SUCCESSOR_OPERATOR_HOME" successor-computer run \
  successor-omega-computer-task.json \
  --image "$SUCCESSOR_COMPUTER_IMAGE" --model "$SUCCESSOR_COMPUTER_MODEL" \
  --provider responses --key-env OPENAI_API_KEY \
  --permit "$SUCCESSOR_COMPUTER_PERMIT" --output "$SUCCESSOR_NEW_RESULT_DIRECTORY"
```

Retain the actual run's task, screenshots, action records, provider identity and
usage where available. A prepared task, model name or successful scripted fixture
does not establish that this live provider run succeeded.

The native Alpha task retains its 200,000-character HTML admission limit. Mission
Studio disables native exports that exceed it and explains the available
operator route. Portable mission and workspace files use a separate shared
1,500,000-byte UTF-8 export/import bound, covering the maximum accepted fields
even with JSON escaping. Source excerpts, ledgers and requirements are preserved
in the exported record.

Provider keys remain in your operator environment. They do not belong in the
mission, source text, copied prompt, export, command arguments or repository.

## Develop the strategy before trusting the conclusion

**Level 3 applies investigation to the methods themselves.** Use the strategy
ledger to describe the current method, alternatives, proposed combinations and
why a change might help. Record the experiment that could show the proposal is
wrong, the resources it uses and its observed result. Revise the method in
response to evidence and preserve rejected attempts. A plausible strategy is a
proposal until the corresponding work has actually been performed and checked.

For a business mission, compare the proposed approach against the current
process and a credible alternative using the same real constraints. Include
complete costs, risk, time and human review effort when those matter to the
decision. A more elaborate workflow does not by itself establish an advantage.

For a mathematics mission, separate a question, conjecture, heuristic,
computation, counterexample and proof. Record the assumptions, exact claim,
derivation and checks. A computer experiment or agent-written argument can guide
research; a ledger entry does not certify a theorem.

The mathematics preset asks for a reusable instrument and a decision about the
next research direction. Extract methods from the supplied primary research,
compare competing strategies, investigate a combination or transfer, and state
the exact target and unresolved proof obligations. When your session has a
separately authorized isolated computation tool, retain the program, inputs,
dependencies, resource bounds and observed output of each experiment. A native
computer-only worker without that tool records a **NOT_RUN** recipe; it must not
report an invented computation.

**Level 4 examines the formulation.** Describe an assumption that may be
unnecessarily restrictive, propose a different formulation and map every hard
requirement to how it remains satisfied. Submit the exact proposal for an
explicit owner decision before treating that formulation as approved for an
experiment. Editing it invalidates the previous approval. The immutable mission
requirements remain in the record.

An owner label and approval are self-attested records. They grant no purchasing,
publishing, payment, blockchain or production authority and establish no
independent proof. If a reframing weakens a real requirement, reject it or create
a separately authorized new mission with the changed requirement clearly stated.

## Reproduce the desk transport separately

For a local infrastructure check, complete the pinned Alpha, Python, Node and
Playwright setup in the [Computer Use integration guide](COMPUTER_USE_LEVELS.md),
then run from the AGI Jobs checkout:

```bash
python integrations/alpha-agent/successor-frontier-mission-lab.py \
  --alpha-source ../AGI-Alpha-Agent-v0-computer \
  --node "$(command -v node)" --output reports/my-mission-transport
```

Use a new output directory. Exit status `0` means the scripted transport check
passed. Inspect `evidence.json`, `review.json`, the action journal and retained
screenshots. The check uses actual Chromium and the native Alpha Computer Use
protocol to read one explicitly synthetic source response, return to the desk,
enter supplied text and verify its portable draft. It also rejects a draft bound
to another mission. The source response and advice are laboratory fixtures; this
check measures neither live research nor autonomous strategy discovery.

Add `--prepare-only` with another new output directory to export the synthetic
task and instructions without executing it. To investigate **your own mission**,
use your downloaded task and the separately authorized operator route described
above; the transport fixture is not your mission's completed result.

## Preserve a record someone can examine

Save the working ledgers and export the workspace. Keep the immutable mission,
source text, strategies, experiments, evidence and formulation decisions
together. Reimporting the workspace checks its bindings before restoring the
record. It does not authenticate an author, model, reviewer or screenshot and
does not turn written claims into verified execution.

Use the retained record when planning the next attempt. State what was reused,
what changed and what further check is necessary. Downloading or reimporting a
record preserves continuity; useful reuse still needs to be observed in the next
piece of work.

The initial execution status remains **not attested**. Ledgers are
**user-entered and unverified**. Neither ordinary text editing nor imported model
names can establish independent proof, production approval or operational
authority. Retain the current method when improvement has not been established.

**Alpha** is the advantage worth investigating. The **Gym** develops methods.
**Specialist ASI** requires demonstrated superiority within an agreed mission.
**SUCCESSOR Ω** retains useful methods and operating memory after proof and
explicit bounded authorization. Mission Studio gives you the working brief,
Computer Use task and continuity record for pursuing that ambition; it does not
award those later qualifications.
