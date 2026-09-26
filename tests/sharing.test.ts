import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("public preview is a static, bounded PNG with no request or provider input", () => {
  const path = new URL("../app/opengraph-image.tsx", import.meta.url);
  assert.ok(existsSync(path), "missing Open Graph image route");
  const image = readFileSync(path, "utf8");
  assert.match(image, /ImageResponse/);
  assert.match(image, /width: 1200/);
  assert.match(image, /height: 630/);
  assert.match(image, /image\/png/);
  assert.match(image, /unofficial/i);
  assert.doesNotMatch(image, /\b(fetch|cookies|headers)\s*\(|process\.env|searchParams|\bparams\b/);
});

test("public metadata uses the confirmed community origin without collapsing canonicals", () => {
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /metadataBase: new URL\("https:\/\/jev\.guru"\)/);
  assert.match(layout, /summary_large_image/);
  assert.match(layout, /unofficial/i);
  assert.doesNotMatch(layout, /canonical:/);
});

test("local sharing evidence is ignored instead of becoming source", () => {
  const ignore = readFileSync(new URL("../.gitignore", import.meta.url), "utf8");
  assert.ok(ignore.split(/\r?\n/).includes("/test-results/sharing/"));
});
