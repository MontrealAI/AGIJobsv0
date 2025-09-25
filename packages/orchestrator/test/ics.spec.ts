import { describe, expect, it } from "vitest";
import { validateICS } from "../src/router";

describe("ICS validation", () => {
  it("parses minimal create job payload", () => {
    const json = JSON.stringify({ intent: "create_job", params: { job: { title: "demo" } } });
    const parsed = validateICS(json);
    expect(parsed.intent).toBe("create_job");
  });
});
