import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/arena/route";

test("hosted comparisons fail before provider work with actionable local setup instructions", async () => {
  const response = await POST(new Request("https://arena.example/api/arena", {
    method: "POST", headers: { origin: "https://arena.example", "content-type": "application/json" },
    body: JSON.stringify({ caseId: "read" }),
  }));
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.attempted, false);
  assert.match(body.error, /local host/);
  assert.match(body.error, /pnpm dev/);
  assert.match(body.error, /127\.0\.0\.1:4173/);
  assert.match(body.error, /No provider request or CLI run/);
});
