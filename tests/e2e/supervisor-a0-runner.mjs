import assert from "node:assert/strict";
import { runSuite } from "./helpers/suite-runner.mjs";

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
console.log("RESULTADO A0: 4 ✅ / 0 ❌");
