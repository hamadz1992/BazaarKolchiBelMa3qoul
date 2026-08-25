const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const electronPkg = require.resolve("electron/package.json", { paths: [projectRoot] });
const electronDir = path.dirname(electronPkg);
const electronExe = path.join(electronDir, "dist", "electron.exe");
const installScript = path.join(electronDir, "install.js");

function runNode(script, args = []) {
  const r = cp.spawnSync(process.execPath, [script, ...args], {
    cwd: projectRoot,
    stdio: "inherit",
    windowsHide: false,
    shell: false
  });
  if (r.error) throw r.error;
  return r.status ?? 1;
}

if (!fs.existsSync(electronExe)) {
  console.log("[desktop] Electron binary missing. Running Electron installer...");
  const status = runNode(installScript);
  if (status !== 0 || !fs.existsSync(electronExe)) {
    console.error("[desktop] Electron binary is still missing.");
    process.exit(status || 1);
  }
}

console.log("[desktop] Starting:", electronExe);
const child = cp.spawn(electronExe, ["."], {
  cwd: projectRoot,
  stdio: "inherit",
  windowsHide: false,
  shell: false
});

child.on("error", err => {
  console.error("[desktop] Failed to start Electron:", err);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`[desktop] Electron exited by ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 0);
});
