import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type AppState, type CleanerApi } from '../shared/types.js';

const api: CleanerApi = {
  getState: () => ipcRenderer.invoke(IPC.getState),
  updateSettings: (patch) => ipcRenderer.invoke(IPC.updateSettings, patch),
  runQuickClean: () => ipcRenderer.invoke(IPC.runQuickClean),
  scanDeep: (ids) => ipcRenderer.invoke(IPC.scanDeep, ids),
  cleanDeep: (ids) => ipcRenderer.invoke(IPC.cleanDeep, ids),
  clearHistory: () => ipcRenderer.invoke(IPC.clearHistory),
  openFullDiskAccessSettings: () => ipcRenderer.invoke(IPC.openFullDiskAccessSettings),
  revealPath: (path) => ipcRenderer.invoke(IPC.revealPath, path),
  quit: () => ipcRenderer.invoke(IPC.quit),
  onStateChanged: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, state: AppState) => listener(state);
    ipcRenderer.on(IPC.stateChanged, wrapped);
    return () => ipcRenderer.removeListener(IPC.stateChanged, wrapped);
  },
};

contextBridge.exposeInMainWorld('cleaner', api);
