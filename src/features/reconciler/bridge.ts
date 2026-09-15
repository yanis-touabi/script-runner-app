export type StagedFile = {
  name: string;
  path: string;
  size: number;
  operator: string | null;
};

export type ReportFile = {
  operator: string;
  name: string;
  path: string;
  mtime: number;
};

export type AppState = {
  workingDir: string | null;
  hasSimDb: boolean;
  staged: StagedFile[];
  reports: ReportFile[];
  running: boolean;
  rejected?: string[];
  error?: string;
};

export type LogEntry = { level: "info" | "error" | "done"; text: string };

export type Summary = {
  operator: string;
  moved: number;
  matches: number;
  keys: number;
};

export type RunResult = {
  ok: boolean;
  error?: string;
  code?: number;
  message?: string;
  durationMs?: number;
  summaries?: Summary[];
  deleted?: number;
  state?: AppState;
};

export type PythonStatus = { ok: boolean; command: string | null; reason: string | null };

export type ReconBridge = {
  isDesktop: boolean;
  getState: () => Promise<AppState>;
  checkPython: () => Promise<PythonStatus>;
  chooseFolder: () => Promise<AppState>;
  addFiles: () => Promise<AppState>;
  addPaths: (paths: string[]) => Promise<AppState>;
  removeFile: (path: string) => Promise<AppState>;
  openPath: (path: string) => Promise<unknown>;
  revealPath: (path: string) => Promise<unknown>;
  run: () => Promise<RunResult>;
  cancel: () => Promise<unknown>;
  pathForFile: (file: File) => string | null;
  onLog: (callback: (entry: LogEntry) => void) => () => void;
};

const OPERATORS = ["MOBILIS", "DJEZZY", "OOREDOO"];
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** In-browser preview stand-in so the same UI can be reviewed outside Electron. */
function createDemoBridge(): ReconBridge {
  let state: AppState = {
    workingDir: "/Users/demo/Documents/SCRIPT",
    hasSimDb: true,
    staged: [
      { name: "MOBILIS.xlsx", path: "/demo/RESILIATION/MOBILIS.xlsx", size: 1_258_291, operator: "MOBILIS" },
      { name: "DJEZZY.xlsx", path: "/demo/RESILIATION/DJEZZY.xlsx", size: 943_718, operator: "DJEZZY" },
      { name: "OOREDOO.xlsx", path: "/demo/RESILIATION/OOREDOO.xlsx", size: 1_468_006, operator: "OOREDOO" },
    ],
    reports: [],
    running: false,
  };
  const listeners = new Set<(entry: LogEntry) => void>();
  const emit = (entry: LogEntry) => listeners.forEach((listener) => listener(entry));

  return {
    isDesktop: false,
    getState: async () => state,
    checkPython: async () => ({ ok: true, command: "python3 (démo)", reason: null }),
    chooseFolder: async () => state,
    addFiles: async () => state,
    addPaths: async () => state,
    removeFile: async (path) => {
      state = { ...state, staged: state.staged.filter((file) => file.path !== path) };
      return state;
    },
    openPath: async () => undefined,
    revealPath: async () => undefined,
    cancel: async () => undefined,
    pathForFile: () => null,
    run: async () => {
      const staged = state.staged;
      emit({ level: "info", text: `Démarrage · ${staged.length} fichier(s) · mode démonstration` });
      await wait(400);
      emit({ level: "info", text: "Reading resiliation files..." });
      const summaries: Summary[] = [];
      for (const operator of OPERATORS) {
        await wait(500);
        const moved = 40 + Math.floor(Math.random() * 60);
        emit({ level: "info", text: `[${operator}] Found ${moved} matching row(s) in SIM_DB/2026/${operator}.xlsx` });
        await wait(350);
        emit({ level: "info", text: `[${operator}] Saving ${moved} moved row(s)...` });
        summaries.push({ operator, moved, matches: moved, keys: moved + 3 });
      }
      await wait(300);
      emit({ level: "done", text: "Terminé · fichiers de résiliation supprimés." });
      state = {
        ...state,
        staged: [],
        reports: OPERATORS.map((operator) => ({
          operator,
          name: `${operator}_resiliations_found.xlsx`,
          path: `/demo/${operator}_resiliations_found.xlsx`,
          mtime: Date.now(),
        })),
      };
      return { ok: true, durationMs: 3600, summaries, deleted: staged.length, state };
    },
    onLog: (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
  };
}

let demo: ReconBridge | null = null;

export function getBridge(): ReconBridge {
  const native = (globalThis as { recon?: ReconBridge }).recon;
  if (native) return native;
  if (!demo) demo = createDemoBridge();
  return demo;
}
