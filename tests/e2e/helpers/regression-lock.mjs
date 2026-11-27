import fs from "node:fs";

function readOwner(lockPath) {
  let contents;
  try {
    contents = fs.readFileSync(lockPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  let owner;
  try {
    owner = JSON.parse(contents);
  } catch {
    return { pending: true };
  }
  if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0 || typeof owner.startedAt !== "string") {
    return { pending: true };
  }
  return owner;
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    if (error.code === "EPERM") return true;
    throw error;
  }
}

export async function acquireRegressionLock(lockPath) {
  const owner = { pid: process.pid, startedAt: new Date().toISOString() };
  const recoveryPath = `${lockPath}.recovery`;
  const deadline = Date.now() + 5000;
  for (;;) {
    let fd;
    try {
      fd = fs.openSync(lockPath, "wx");
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const current = readOwner(lockPath);
      if (!current) continue;
      if (current.pending) {
        if (Date.now() >= deadline) throw new Error(`No se puede identificar el propietario del candado ${lockPath}.`);
        await new Promise((resolve) => setTimeout(resolve, 50));
        continue;
      }
      if (isAlive(current.pid)) throw new Error(`Ya hay una regresión en curso (PID ${current.pid})`);

      let recovery;
      try {
        recovery = fs.openSync(recoveryPath, "wx");
      } catch (recoveryError) {
        if (recoveryError.code !== "EEXIST") throw recoveryError;
        if (Date.now() >= deadline) throw new Error(`No se pudo recuperar el candado; revisa ${recoveryPath}.`);
        await new Promise((resolve) => setTimeout(resolve, 50));
        continue;
      }
      try {
        const latest = readOwner(lockPath);
        if (latest && !latest.pending && !isAlive(latest.pid)) fs.unlinkSync(lockPath);
      } finally {
        fs.closeSync(recovery);
        fs.unlinkSync(recoveryPath);
      }
      continue;
    }

    try {
      fs.writeFileSync(fd, JSON.stringify(owner));
    } catch (error) {
      fs.unlinkSync(lockPath);
      throw error;
    } finally {
      fs.closeSync(fd);
    }
    return () => {
      const current = readOwner(lockPath);
      if (!current || current.pid !== owner.pid || current.startedAt !== owner.startedAt) {
        throw new Error("El candado de regresión cambió antes de liberarse.");
      }
      fs.unlinkSync(lockPath);
    };
  }
}
