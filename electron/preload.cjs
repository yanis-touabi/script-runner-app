const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("recon", {
  isDesktop: true,
  getState: () => ipcRenderer.invoke("app:state"),
  checkPython: () => ipcRenderer.invoke("python:check"),
  chooseFolder: () => ipcRenderer.invoke("folder:choose"),
  addFiles: () => ipcRenderer.invoke("files:add"),
  addPaths: (paths) => ipcRenderer.invoke("files:addPaths", paths),
  removeFile: (filePath) => ipcRenderer.invoke("files:remove", filePath),
  openPath: (target) => ipcRenderer.invoke("path:open", target),
  revealPath: (target) => ipcRenderer.invoke("path:reveal", target),
  run: () => ipcRenderer.invoke("run:start"),
  cancel: () => ipcRenderer.invoke("run:cancel"),
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return file.path || null;
    }
  },
  onLog: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("run:log", listener);
    return () => ipcRenderer.removeListener("run:log", listener);
  },
});
