import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

// pnpm start binds this fixed loopback origin. Never fetch the public origin
// or any API/comparison endpoint as part of a sharing smoke test.
const base = new URL("http://127.0.0.1:4173");
const output = new URL("../test-results/sharing/", import.meta.url);
const requests = [];
async function getLocal(path) {
  const url = new URL(path, base);
  assert.equal(url.origin, base.origin);
  assert.ok(["/", "/opengraph-image"].includes(url.pathname));
  requests.push({ method: "GET", path: url.pathname });
  return fetch(url, { method: "GET", redirect: "error", signal: AbortSignal.timeout(5000) });
}
let response;
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const candidate = await getLocal("/");
    if (candidate.ok) { response = candidate; break; }
    await candidate.body?.cancel();
  } catch { /* Wait for the local production server, never fall back to a public host. */ }
  await sleep(500);
}
assert.ok(response, "local production server did not become ready");
const html = await response.text();
const tags = [...html.matchAll(/<meta\s[^>]*>/gi)].map(([tag]) =>
  Object.fromEntries([...tag.matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g)].map((match) => [match[1], match[2]]))
);
function metadata(name) {
  const tag = tags.find((entry) => entry.name === name || entry.property === name);
  assert.ok(tag?.content, `missing rendered ${name}`);
  return tag.content.replace(/&amp;/g, "&");
}
assert.equal(metadata("twitter:card"), "summary_large_image");
assert.match(metadata("description"), /unofficial/i);
await mkdir(output, { recursive: true });
const images = [];
for (const [name, key] of [["og", "og:image"], ["twitter", "twitter:image"]]) {
  const publicUrl = new URL(metadata(key));
  assert.equal(publicUrl.origin, "https://jev.guru");
  const image = await getLocal(publicUrl.pathname + publicUrl.search);
  assert.equal(image.status, 200);
  assert.match(image.headers.get("content-type") ?? "", /image\/png/);
  const bytes = Buffer.from(await image.arrayBuffer());
  assert.ok(bytes.length < 1_000_000);
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(bytes.readUInt32BE(16), 1200);
  assert.equal(bytes.readUInt32BE(20), 630);
  await writeFile(new URL(`generated-${name}.png`, output), bytes);
  images.push({ metadata: key, publicOrigin: publicUrl.origin, path: publicUrl.pathname, width: 1200, height: 630, bytes: bytes.length });
}
await writeFile(new URL("provenance.json", output), JSON.stringify({
  commit: process.env.GITHUB_SHA ?? "local-unrecorded",
  environment: "local Next.js production server, not public production",
  requests, images,
  boundary: "only local GETs for rendered HTML and images; no browser JavaScript, API endpoints, model or CLI comparison invoked"
}, null, 2) + "\n");
console.log("Verified rendered metadata and both PNG responses against the local production build.");
