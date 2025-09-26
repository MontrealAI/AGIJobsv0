# @agijobs/onebox-sdk

TypeScript definitions shared between the AGI Jobs one-box front-end and the AGI-Alpha Orchestrator. These interfaces capture the JobIntent contract used by the planner and executor routes (`/onebox/plan`, `/onebox/execute`, `/onebox/status`).

## Usage

```ts
import type { JobIntent, PlanResponse } from '@agijobs/onebox-sdk';

async function submitIntent(intent: JobIntent): Promise<void> {
  const res = await fetch('/onebox/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intent, mode: 'relayer' }),
  });
  const json = (await res.json()) as PlanResponse;
  // ...
}
```

Run `pnpm --filter @agijobs/onebox-sdk build` (or `npm run build --workspace=@agijobs/onebox-sdk`) to emit `.d.ts` files under `dist/`.

## Relationship to the orchestrator

The FastAPI service should export matching Pydantic models:

```py
class JobAttachment(BaseModel):
    name: str
    ipfs: str | None = None
    type: str | None = None
    url: AnyUrl | None = None

class JobIntent(BaseModel):
    action: Literal['post_job', 'finalize_job', 'check_status', 'stake', 'validate', 'dispute']
    payload: dict[str, Any]
    constraints: dict[str, Any] | None = None
    userContext: dict[str, Any] | None = Field(default=None, alias='userContext')
```

Keeping the schemas in sync avoids brittle JSON parsing in the UI and enables editor autocomplete.
