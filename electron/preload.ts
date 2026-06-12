import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  saveFile: (defaultPath: string, content: string, filters?: any[]) =>
    ipcRenderer.invoke('save-file', { defaultPath, content, filters }),
  openFile: (filters?: any[], properties?: string[]) =>
    ipcRenderer.invoke('open-file', { filters, properties })
});
