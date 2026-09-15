const { app, BrowserWindow, dialog, ipcMain, shell, nativeImage } = require("electron");
const { spawn, execFile } = require("child_process");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const OPERATORS = ["MOBILIS", "DJEZZY", "OOREDOO"];
const RESILIATION_DIR = "RESILIATION";
const SIM_DB_DIR = "SIM_DB";

let mainWindow = null;
let currentRun = null;

/* ---------------- config ---------------- */

const configPath = () => path.join(app.getPath("userData"), "config.json");

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch {
    return {};
  }
}

function writeConfig(patch) {
  const next = { ...readConfig(), ...patch };
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(next, null, 2));
  return next;
}

/* ---------------- helpers ---------------- */

const resourcePath = (...parts) =>
  app.isPackaged
    ? path.join(process.resourcesPath, ...parts)
    : path.join(__dirname, ...parts);

function operatorOf(fileName) {
  const stem = fileName.toLowerCase();
  return OPERATORS.find((operator) => stem.includes(operator.toLowerCase())) || null;
}

function findDirCaseInsensitive(root, name) {
  try {
    const hit = fs
      .readdirSync(root, { withFileTypes: true })
      .find((entry) => entry.isDirectory() && entry.name.toLowerCase() === name.toLowerCase());
    return hit ? path.join(root, hit.name) : null;
  } catch {
    return null;
  }
}

function resiliationDir(workingDir) {
  return findDirCaseInsensitive(workingDir, RESILIATION_DIR) || path.join(workingDir, RESILIATION_DIR);
}

function stagedFiles(workingDir) {
  if (!workingDir) return [];
  const dir = resiliationDir(workingDir);
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => /\.xlsm?x?$/i.test(name) && !name.startsWith("~$"))
      .map((name) => {
        const full = path.join(dir, name);
        const stat = fs.statSync(full);
        return {
          name,
          path: full,
          size: stat.size,
          operator: operatorOf(name),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

function reportFiles(workingDir) {
  if (!workingDir) return [];
  return OPERATORS.map((operator) => {
    const file = path.join(workingDir, `${operator}_resiliations_found.xlsx`);
    return fs.existsSync(file)
      ? { operator, name: path.basename(file), path: file, mtime: fs.statSync(file).mtimeMs }
      : null;
  }).filter(Boolean);
}

function detectPython() {
  const candidates =
    process.platform === "win32" ? ["py", "python", "python3"] : ["python3", "python"];
  return new Promise((resolve) => {
    const tryNext = (index) => {
      if (index >= candidates.length) {
        resolve({ ok: false, command: null, reason: "python-missing" });
        return;
      }
      const command = candidates[index];
      execFile(command, ["-c", "import openpyxl; print('ok')"], { timeout: 15000 }, (error, stdout) => {
        if (!error && String(stdout).includes("ok")) {
          resolve({ ok: true, command, reason: null });
          return;
        }
        execFile(command, ["--version"], { timeout: 10000 }, (versionError) => {
          if (!versionError) {
            resolve({ ok: false, command, reason: "openpyxl-missing" });
            return;
          }
          tryNext(index + 1);
        });
      });
    };
    tryNext(0);
  });
}

function appState() {
  const { workingDir } = readConfig();
  const valid = Boolean(workingDir && fs.existsSync(workingDir));
  return {
    workingDir: valid ? workingDir : null,
    hasSimDb: valid ? Boolean(findDirCaseInsensitive(workingDir, SIM_DB_DIR)) : false,
    staged: valid ? stagedFiles(workingDir) : [],
    reports: valid ? reportFiles(workingDir) : [],
    running: Boolean(currentRun),
  };
}

const send = (channel, payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
};

/* ---------------- window ---------------- */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1040,
    minHeight: 720,
    backgroundColor: "#e2e8f0",
    title: "Resiliate",
    icon: nativeImage.createFromPath(resourcePath("build", "icon.png")),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, "..", "dist-electron-renderer", "index.html"));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

/* ---------------- ipc ---------------- */

ipcMain.handle("app:state", () => appState());

ipcMain.handle("python:check", () => detectPython());

ipcMain.handle("folder:choose", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choisir le dossier de travail (contenant SIM_DB)",
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) return appState();
  writeConfig({ workingDir: result.filePaths[0] });
  fs.mkdirSync(resiliationDir(result.filePaths[0]), { recursive: true });
  return appState();
});

async function stagePaths(paths) {
  const { workingDir } = readConfig();
  if (!workingDir) return { ...appState(), error: "no-folder" };
  const target = resiliationDir(workingDir);
  await fsp.mkdir(target, { recursive: true });
  const rejected = [];
  for (const source of paths) {
    const name = path.basename(source);
    if (!/\.xlsm?x?$/i.test(name) || name.startsWith("~$")) {
      rejected.push(name);
      continue;
    }
    if (path.resolve(path.dirname(source)) !== path.resolve(target)) {
      await fsp.copyFile(source, path.join(target, name));
    }
  }
  return { ...appState(), rejected };
}

ipcMain.handle("files:add", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Sélectionner les fichiers de résiliation",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Excel", extensions: ["xlsx", "xlsm"] }],
  });
  if (result.canceled) return appState();
  return stagePaths(result.filePaths);
});

ipcMain.handle("files:addPaths", (_event, paths) => stagePaths(paths || []));

ipcMain.handle("files:remove", async (_event, filePath) => {
  const { workingDir } = readConfig();
  if (workingDir && path.resolve(filePath).startsWith(path.resolve(resiliationDir(workingDir)))) {
    await fsp.rm(filePath, { force: true });
  }
  return appState();
});

ipcMain.handle("path:open", (_event, target) => shell.openPath(target));
ipcMain.handle("path:reveal", (_event, target) => shell.showItemInFolder(target));

ipcMain.handle("run:cancel", () => {
  if (currentRun) currentRun.kill();
  return { ok: true };
});

ipcMain.handle("run:start", async () => {
  if (currentRun) return { ok: false, error: "already-running" };
  const { workingDir } = readConfig();
  if (!workingDir || !fs.existsSync(workingDir)) return { ok: false, error: "no-folder" };
  if (!findDirCaseInsensitive(workingDir, SIM_DB_DIR)) return { ok: false, error: "no-sim-db" };

  const staged = stagedFiles(workingDir);
  if (staged.length === 0) return { ok: false, error: "no-files" };

  const python = await detectPython();
  if (!python.ok) return { ok: false, error: python.reason };

  const scriptTarget = path.join(workingDir, "reconcile_resiliations.py");
  await fsp.copyFile(resourcePath("python", "reconcile_resiliations.py"), scriptTarget);

  const startedAt = Date.now();
  send("run:log", { level: "info", text: `Démarrage · ${staged.length} fichier(s) · ${workingDir}` });

  return new Promise((resolve) => {
    const child = spawn(python.command, ["-u", scriptTarget], {
      cwd: workingDir,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    currentRun = child;

    const emit = (level) => (chunk) => {
      String(chunk)
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .forEach((text) => send("run:log", { level, text }));
    };
    child.stdout.on("data", emit("info"));
    child.stderr.on("data", emit("error"));

    const summaries = [];
    child.stdout.on("data", (chunk) => {
      const pattern = /^(\w+): moved (\d+) record\(s\), active matches (\d+), resiliation keys (\d+)/;
      String(chunk)
        .split(/\r?\n/)
        .forEach((line) => {
          const match = line.trim().match(pattern);
          if (match) {
            summaries.push({
              operator: match[1],
              moved: Number(match[2]),
              matches: Number(match[3]),
              keys: Number(match[4]),
            });
          }
        });
    });

    child.on("error", (error) => {
      currentRun = null;
      send("run:log", { level: "error", text: error.message });
      resolve({ ok: false, error: "spawn-failed", message: error.message });
    });

    child.on("close", async (code) => {
      currentRun = null;
      const durationMs = Date.now() - startedAt;
      if (code !== 0) {
        send("run:log", { level: "error", text: `Arrêt du script (code ${code}).` });
        resolve({ ok: false, error: "script-failed", code, durationMs, summaries, state: appState() });
        return;
      }
      let deleted = 0;
      for (const file of staged) {
        try {
          await fsp.rm(file.path, { force: true });
          deleted += 1;
        } catch {
          /* ignore */
        }
      }
      await fsp.rm(scriptTarget, { force: true });
      send("run:log", {
        level: "done",
        text: `Terminé · ${deleted} fichier(s) de résiliation supprimé(s).`,
      });
      resolve({ ok: true, durationMs, summaries, deleted, state: appState() });
    });
  });
});
