import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "./server.mjs";
test("local server serves assets but refuses writes, source and traversal", async () => {
  const server = createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const good = await fetch(base + "/biziva/index.html");
    assert.equal(good.status, 200);
    assert.ok(
      good.headers
        .get("content-security-policy")
        .includes("connect-src 'none'"),
    );
    assert.equal(good.headers.get("cache-control"), "no-store");
    for (const p of [
      "/biziva/server.mjs",
      "/biziva/../../package.json",
      "/biziva/%2e%2e%2fpackage.json",
      "/.env",
    ])
      assert.equal((await fetch(base + p)).status, 404);
    assert.equal(
      (await fetch(base + "/biziva/app.mjs", { method: "POST" })).status,
      405,
    );
  } finally {
    await new Promise((r) => server.close(r));
  }
});
import { parse, redact, diff, process } from "./logic.mjs";
test("nested secrets and optional contacts are protected; prototype keys stay data", () => {
  const input = parse(
    '{"__proto__":{"polluted":true},"items":[{"access_token":"secret-value","email":"demo@example.invalid"}]}',
  );
  const r = redact(input, true);
  assert.equal(r.redacted, 2);
  assert.equal(r.value.items[0].access_token, "[PROTEGIDO]");
  assert.equal({}.polluted, undefined);
  assert.equal(Object.getPrototypeOf(r.value), null);
});
test("diff escapes JSON pointers and never includes secret values", async () => {
  assert.deepEqual(diff({ "a/b": 1 }, { "a/b": 2 }), [
    { path: "/a~1b", type: "alterado" },
  ]);
  const result = await process({
    source: '{"apiKey":"secret-one","x":1}',
    compare: '{"apiKey":"secret-two","x":2}',
  });
  assert.ok(!result.text.includes("secret-"));
  assert.ok(result.text.includes("/x"));
});
test("limits deeply nested and oversized JSON", () => {
  let x = {};
  for (let i = 0; i < 70; i++) x = { x };
  assert.throws(() => redact(x));
  assert.throws(() => parse(" ".repeat(1024 * 1024 + 1)));
});
