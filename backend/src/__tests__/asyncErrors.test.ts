import { test } from "node:test";
import assert from "node:assert/strict";
import "../lib/asyncErrors";
import express from "express";
import type { AddressInfo } from "node:net";

test("an async handler's rejection becomes a 500 instead of an unhandled rejection", async () => {
  const app = express();
  app.get("/boom", async () => {
    await Promise.resolve();
    throw new Error("database is locked");
  });
  app.get("/ok", async (_req, res) => {
    res.json({ ok: true });
  });
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: err.message });
  });
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let unhandled = 0;
  const onUnhandled = () => unhandled++;
  process.on("unhandledRejection", onUnhandled);
  try {
    const boom = await fetch(`${base}/boom`);
    assert.equal(boom.status, 500);
    assert.deepEqual(await boom.json(), { error: "database is locked" });
    assert.equal((await fetch(`${base}/ok`)).status, 200);
    await new Promise((r) => setImmediate(r));
    assert.equal(unhandled, 0);
  } finally {
    process.off("unhandledRejection", onUnhandled);
    server.close();
  }
});
