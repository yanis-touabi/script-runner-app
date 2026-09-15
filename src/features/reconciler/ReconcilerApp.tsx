import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getBridge,
  type AppState,
  type LogEntry,
  type PythonStatus,
  type Summary,
} from "./bridge";

const OPERATORS = ["MOBILIS", "DJEZZY", "OOREDOO"] as const;

const OPERATOR_STYLES: Record<string, { dot: string; chip: string; label: string }> = {
  MOBILIS: { dot: "bg-mobilis", chip: "bg-mobilis/15 text-mobilis", label: "Mobilis" },
  DJEZZY: { dot: "bg-djezzy", chip: "bg-djezzy/15 text-djezzy", label: "Djezzy" },
  OOREDOO: { dot: "bg-ooredoo", chip: "bg-ooredoo/15 text-ooredoo", label: "Ooredoo" },
};

const ERROR_MESSAGES: Record<string, string> = {
  "no-folder": "Choisissez d'abord un dossier de travail.",
  "no-sim-db": "Le dossier choisi ne contient pas de dossier SIM_DB.",
  "no-files": "Ajoutez au moins un fichier de résiliation.",
  "python-missing": "Python est introuvable sur cette machine.",
  "openpyxl-missing": "Le module Python openpyxl est manquant (pip install openpyxl).",
  "script-failed": "Le script s'est arrêté avec une erreur — voir le journal.",
  "spawn-failed": "Impossible de lancer Python.",
  "already-running": "Une exécution est déjà en cours.",
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatClock(ms: number) {
  const total = Math.floor(ms / 1000);
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `00:${minutes}:${seconds}`;
}

export default function ReconcilerApp() {
  const bridge = useMemo(() => getBridge(), []);
  const [state, setState] = useState<AppState>({
    workingDir: null,
    hasSimDb: false,
    staged: [],
    reports: [],
    running: false,
  });
  const [python, setPython] = useState<PythonStatus | null>(null);
  const [logs, setLogs] = useState<Array<LogEntry & { at: number }>>([]);
  const [running, setRunning] = useState(false);
  const [summaries, setSummaries] = useState<Summary[] | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [lastDuration, setLastDuration] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const startedAt = useRef<number>(0);
  const consoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bridge.getState().then(setState);
    bridge.checkPython().then(setPython);
  }, [bridge]);

  useEffect(() => {
    return bridge.onLog((entry) => {
      setLogs((current) => [...current.slice(-400), { ...entry, at: Date.now() - startedAt.current }]);
    });
  }, [bridge]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setElapsed(Date.now() - startedAt.current), 500);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight });
  }, [logs]);

  const refresh = useCallback(async () => setState(await bridge.getState()), [bridge]);

  const handleRun = async () => {
    setNotice(null);
    setLogs([]);
    setSummaries(null);
    startedAt.current = Date.now();
    setElapsed(0);
    setRunning(true);
    const result = await bridge.run();
    setRunning(false);
    setLastDuration(result.durationMs ?? Date.now() - startedAt.current);
    if (result.summaries?.length) setSummaries(result.summaries);
    if (!result.ok) setNotice(ERROR_MESSAGES[result.error ?? ""] ?? result.message ?? "Échec de l'exécution.");
    if (result.state) setState(result.state);
    else await refresh();
  };

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const paths = Array.from(event.dataTransfer.files)
      .map((file) => bridge.pathForFile(file))
      .filter((value): value is string => Boolean(value));
    if (paths.length === 0) {
      setNotice("Glisser-déposer indisponible ici — utilisez « Ajouter des fichiers ».");
      return;
    }
    setState(await bridge.addPaths(paths));
  };

  const ready = Boolean(state.workingDir) && state.hasSimDb && state.staged.length > 0 && python?.ok;
  const totalMoved = summaries?.reduce((sum, item) => sum + item.moved, 0) ?? 0;
  const totalKeys = summaries?.reduce((sum, item) => sum + item.keys, 0) ?? 0;

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-slate-200 font-sans">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-32 size-[520px] rounded-full bg-sky-400/40 blur-3xl" />
        <div className="absolute top-1/3 -right-40 size-[560px] rounded-full bg-indigo-400/40 blur-3xl" />
        <div className="absolute -bottom-48 left-1/3 size-[500px] rounded-full bg-teal-300/50 blur-3xl" />
        <div className="absolute top-24 right-1/4 size-64 rounded-full bg-fuchsia-300/30 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-[1400px] px-6 py-7">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-brand to-djezzy text-white shadow-lg shadow-brand/30">
              <SimIcon />
            </div>
            <div>
              <h1 className="text-[15px] leading-tight font-bold text-ink">Resiliate</h1>
              <p className="text-[11px] font-medium text-mut">
                Réconciliation SIM · {bridge.isDesktop ? "bureau" : "démonstration"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => setState(await bridge.chooseFolder())}
              className="flex items-center gap-2 rounded-full border border-white/60 bg-white/40 px-3.5 py-2 text-[12px] font-medium text-mut backdrop-blur-xl transition hover:bg-white/60"
              title="Changer le dossier de travail"
            >
              <span className={`size-2 rounded-full ${state.workingDir ? "bg-brand/70" : "bg-bad"}`} />
              <span className="max-w-[360px] truncate">
                {state.workingDir ?? "Choisir le dossier de travail…"}
              </span>
            </button>
            <button
              disabled={!state.workingDir}
              onClick={() => state.workingDir && bridge.openPath(state.workingDir)}
              className="rounded-full border border-brand/30 bg-white/50 px-4 py-2 text-[12px] font-semibold text-brand backdrop-blur-xl transition hover:bg-white/70 disabled:opacity-40"
            >
              Ouvrir
            </button>
          </div>
        </header>

        {notice && (
          <div className="mt-4 rounded-xl border border-bad/30 bg-bad/10 px-4 py-2.5 text-[12px] font-semibold text-bad backdrop-blur-xl">
            {notice}
          </div>
        )}
        {state.workingDir && !state.hasSimDb && (
          <div className="mt-4 rounded-xl border border-warn/30 bg-warn/10 px-4 py-2.5 text-[12px] font-semibold text-warn backdrop-blur-xl">
            Aucun dossier SIM_DB trouvé dans le dossier de travail.
          </div>
        )}

        <div className="mt-6 grid grid-cols-12 gap-5">
          <div className="col-span-5 space-y-5">
            <section className="rounded-2xl border border-white/60 bg-white/50 p-5 shadow-xl shadow-black/5 backdrop-blur-2xl">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-bold text-ink">Fichiers de résiliation</h2>
                <span className="rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-semibold text-brand">
                  {state.staged.length} / 3 prêt(s)
                </span>
              </div>
              <p className="mt-1 text-[12px] text-mut">
                Un fichier .xlsx par opérateur. Ils sont supprimés après une exécution réussie.
              </p>

              <div className="mt-4 space-y-3">
                {state.staged.length === 0 && (
                  <p className="rounded-xl border border-white/60 bg-white/40 px-3 py-6 text-center text-[12px] text-mut">
                    Aucun fichier ajouté.
                  </p>
                )}
                {state.staged.map((file) => {
                  const style = file.operator ? OPERATOR_STYLES[file.operator] : null;
                  return (
                    <div
                      key={file.path}
                      className="flex items-center gap-3 rounded-xl border border-white/60 bg-white/55 p-3"
                    >
                      <div
                        className={`grid size-9 shrink-0 place-items-center rounded-lg font-mono text-[10px] font-bold ${
                          style ? style.chip : "bg-warn/15 text-warn"
                        }`}
                      >
                        XLS
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold text-ink">{file.name}</div>
                        <div className="text-[11px] text-mut">
                          {style ? style.label : "Opérateur inconnu"} · {formatSize(file.size)}
                        </div>
                      </div>
                      {file.operator ? (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-good">
                          <span className="size-1.5 rounded-full bg-good" />
                          Prêt
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-warn">
                          <span className="size-1.5 rounded-full bg-warn" />
                          Ignoré
                        </span>
                      )}
                      <button
                        disabled={running}
                        onClick={async () => setState(await bridge.removeFile(file.path))}
                        className="grid size-7 shrink-0 place-items-center rounded-lg text-mut transition hover:bg-black/5 disabled:opacity-30"
                        aria-label={`Retirer ${file.name}`}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>

              <button
                disabled={running}
                onClick={async () => setState(await bridge.addFiles())}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                className={`mt-4 grid w-full rounded-xl border border-dashed p-4 text-center transition disabled:opacity-40 ${
                  dragging ? "border-brand bg-brand/10" : "border-brand/40 bg-brand/5 hover:bg-brand/10"
                }`}
              >
                <span className="text-[12px] font-semibold text-brand">+ Ajouter des fichiers</span>
                <span className="text-[11px] text-mut">.xlsx uniquement · glisser-déposer accepté</span>
              </button>
            </section>

            <section className="rounded-2xl border border-white/60 bg-white/50 p-5 shadow-xl shadow-black/5 backdrop-blur-2xl">
              <h2 className="text-[13px] font-bold text-ink">Réconciliation</h2>
              <p className="mt-1 text-[12px] text-mut">
                {python === null
                  ? "Détection de l'environnement Python…"
                  : python.ok
                    ? `Moteur Python · ${python.command}`
                    : ERROR_MESSAGES[python.reason ?? ""] ?? "Python indisponible"}
              </p>
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/60 bg-white/55 px-3 py-2.5 font-mono text-[12px] text-mut">
                <span className={`size-2 shrink-0 rounded-full ${python?.ok ? "bg-good" : "bg-bad"}`} />
                <span className="truncate">reconcile_resiliations.py</span>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  disabled={!ready || running}
                  onClick={handleRun}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand to-djezzy py-3 text-[13px] font-bold text-white shadow-lg shadow-brand/30 transition hover:brightness-105 disabled:opacity-40 disabled:shadow-none"
                >
                  <span className="grid size-4 place-items-center rounded bg-white/25">
                    <span className="ml-[-1px] border-y-[5px] border-r-[8px] border-y-transparent border-r-white" />
                  </span>
                  {running ? "Exécution en cours…" : "Lancer la réconciliation"}
                </button>
                <button
                  disabled={!running}
                  onClick={() => bridge.cancel()}
                  className="rounded-xl border border-white/60 bg-white/55 px-4 text-[13px] font-semibold text-mut transition hover:bg-white/80 disabled:opacity-40"
                >
                  Arrêter
                </button>
              </div>
              <div className="mt-4 flex items-center gap-2 text-[12px] font-semibold text-good">
                {running ? (
                  <>
                    <span className="relative flex size-2.5">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-75" />
                      <span className="relative inline-flex size-2.5 rounded-full bg-good" />
                    </span>
                    Moteur actif · {Math.round(elapsed / 1000)}s
                  </>
                ) : (
                  <span className="text-[12px] font-medium text-mut">
                    {lastDuration !== null
                      ? `Dernière exécution · ${Math.round(lastDuration / 1000)}s`
                      : "En attente"}
                  </span>
                )}
              </div>
            </section>
          </div>

          <div className="col-span-7 space-y-5">
            <section className="rounded-2xl border border-white/60 bg-white/50 p-5 shadow-xl shadow-black/5 backdrop-blur-2xl">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-bold text-ink">Journal en direct</h2>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-black/5 px-2 py-1 font-mono text-[10px] font-semibold text-mut">
                    stdout
                  </span>
                  <span className="text-[11px] font-medium text-mut">{logs.length} ligne(s)</span>
                </div>
              </div>
              <div
                ref={consoleRef}
                className="mt-4 h-[300px] space-y-1.5 overflow-y-auto rounded-xl bg-slate-900/95 p-4 font-mono text-[12px] leading-relaxed"
              >
                {logs.length === 0 && (
                  <div className="text-slate-500">
                    [00:00:00] <span className="text-sky-400">IDLE</span> en attente d'une exécution…
                  </div>
                )}
                {logs.map((entry, index) => (
                  <div
                    key={index}
                    className={
                      entry.level === "error"
                        ? "text-rose-300"
                        : entry.level === "done"
                          ? "text-emerald-300"
                          : "text-slate-300"
                    }
                  >
                    <span className="text-slate-500">[{formatClock(entry.at)}]</span>{" "}
                    <span
                      className={
                        entry.level === "error"
                          ? "text-rose-400"
                          : entry.level === "done"
                            ? "text-emerald-400"
                            : "text-sky-400"
                      }
                    >
                      {entry.level === "error" ? "ERR " : entry.level === "done" ? "DONE" : "INFO"}
                    </span>{" "}
                    {entry.text}
                  </div>
                ))}
                {running && <div className="cursor text-emerald-300" />}
              </div>
            </section>

            <section className="rounded-2xl border border-white/60 bg-white/50 p-5 shadow-xl shadow-black/5 backdrop-blur-2xl">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-bold text-ink">Résultats par opérateur</h2>
                <span className="text-[11px] font-medium text-mut">
                  {lastDuration !== null ? `dernière exécution · ${Math.round(lastDuration / 1000)}s` : "—"}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {OPERATORS.map((operator) => {
                  const style = OPERATOR_STYLES[operator];
                  const summary = summaries?.find((item) => item.operator === operator);
                  return (
                    <div key={operator} className="rounded-xl border border-white/60 bg-white/55 p-4">
                      <div className="flex items-center gap-2">
                        <span className={`size-2.5 rounded-full ${style.dot}`} />
                        <span className="text-[13px] font-bold text-ink">{style.label}</span>
                      </div>
                      <div className="mt-3 font-mono text-2xl font-bold text-ink">
                        {summary ? summary.moved.toLocaleString("fr-FR") : "—"}
                      </div>
                      <div className="text-[11px] text-mut">lignes déplacées</div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span className="rounded-md bg-good/15 px-2 py-1 text-[10px] font-semibold text-good">
                          {summary ? summary.matches.toLocaleString("fr-FR") : "0"} trouvées
                        </span>
                        <span className="rounded-md bg-warn/15 px-2 py-1 text-[10px] font-semibold text-warn">
                          {summary ? summary.keys.toLocaleString("fr-FR") : "0"} clés
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex items-center justify-between rounded-xl border border-white/60 bg-white/55 px-4 py-3">
                <div className="flex items-center gap-6">
                  <div>
                    <span className="text-[11px] text-mut">Déplacées</span>
                    <div className="font-mono text-sm font-bold text-ink">
                      {totalMoved.toLocaleString("fr-FR")}
                    </div>
                  </div>
                  <div>
                    <span className="text-[11px] text-mut">Clés lues</span>
                    <div className="font-mono text-sm font-bold text-good">
                      {totalKeys.toLocaleString("fr-FR")}
                    </div>
                  </div>
                  <div>
                    <span className="text-[11px] text-mut">Rapports</span>
                    <div className="font-mono text-sm font-bold text-warn">{state.reports.length}</div>
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {state.reports.map((report) => (
                    <button
                      key={report.path}
                      onClick={() => bridge.openPath(report.path)}
                      className="rounded-lg bg-ink px-3 py-2 text-[11px] font-semibold text-white transition hover:opacity-90"
                    >
                      {report.operator}
                    </button>
                  ))}
                  {state.reports.length === 0 && (
                    <span className="text-[11px] text-mut">Aucun rapport généré</span>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Lucide "signal" mark — open source (ISC), inlined. */
function SimIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden="true"
    >
      <path d="M18 20V10" />
      <path d="M12 20V4" />
      <path d="M6 20v-6" />
    </svg>
  );
}
