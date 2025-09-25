import assert from "node:assert/strict";
import test from "node:test";

const { extractJobId } = await import("./openai.ts");

test("parses straightforward job references", () => {
  assert.equal(extractJobId("apply to job 45"), 45);
});

test("ignores unrelated numbers while capturing explicit job references", () => {
  assert.equal(
    extractJobId("Apply to the job about labeling 500 images (#123)"),
    123
  );
});

test("recognizes job id phrasing", () => {
  assert.equal(
    extractJobId("please finalize job id 789 once you're ready"),
    789
  );
});

test("returns null when no job id is present", () => {
  assert.equal(
    extractJobId("the job requires labeling 500 images today"),
    null
  );
});
