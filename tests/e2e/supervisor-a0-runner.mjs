import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runSuite } from "./helpers/suite-runner.mjs";
import { acquireRegressionLock } from "./helpers/regression-lock.mjs";

const options = { echo: false };
const good = await runSuite("correcta", ["-e", 'console.log("RESULTADO: 2 ✅ / 0 ❌")'], options);
assert.equal(good.success, true);
assert.equal(good.passed, 2);
assert.equal(good.failed, 0);

const reportedFailure = await runSuite("fallo comunicado", ["-e", 'console.log("RESULTADO: 1 ✅ / 1 ❌")'], options);
assert.equal(reportedFailure.success, false);
assert.equal(reportedFailure.code, 0);

const exception = await runSuite("excepción", ["-e", 'throw new Error("error de prueba")'], options);
assert.equal(exception.success, false);
assert.notEqual(exception.code, 0);

const afterFailure = await runSuite("posterior", ["-e", 'console.log("RESULTADO: 1 ✅ / 0 ❌")'], options);
assert.equal(afterFailure.success, true);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "conecta-lock-test-"));
const lockPath = path.join(dir, "regression.lock");
try {
  const release = await acquireRegressionLock(lockPath);
  try {
    await assert.rejects(acquireRegressionLock(lockPath), new RegExp(`Ya hay una regresión en curso \\(PID ${process.pid}\\)`));
    const script = `import { acquireRegressionLock } from ${JSON.stringify(new URL("./helpers/regression-lock.mjs", import.meta.url).href)}; await acquireRegressionLock(process.argv[1]);`;
    const concurrent = await runSuite("concurrente", ["--input-type=module", "-e", script, lockPath], options);
    assert.notEqual(concurrent.code, 0);
  } finally {
    release();
  }
  assert.equal(fs.existsSync(lockPath), false);
  fs.writeFileSync(lockPath, JSON.stringify({ pid: 2147483647, startedAt: "2000-01-01T00:00:00.000Z" }));
  const releaseStale = await acquireRegressionLock(lockPath);
  assert.equal(JSON.parse(fs.readFileSync(lockPath, "utf8")).pid, process.pid);
  releaseStale();
  assert.equal(fs.existsSync(lockPath), false);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log("RESULTADO A0: 8 ✅ / 0 ❌");
