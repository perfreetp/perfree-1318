import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';

let mainWindow: BrowserWindow | null = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'API Replay Tool - 接口回放工具',
    frame: true,
    backgroundColor: '#1a1a2e'
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

ipcMain.handle('save-file', async (_event, { defaultPath, content, filters }) => {
  const result = await dialog.showSaveDialog({
    defaultPath,
    filters: filters || [{ name: 'All Files', extensions: ['*'] }]
  });
  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, content);
    return { success: true, filePath: result.filePath };
  }
  return { success: false };
});

ipcMain.handle('open-file', async (_event, { filters, properties }) => {
  const result = await dialog.showOpenDialog({
    filters: filters || [{ name: 'All Files', extensions: ['*'] }],
    properties: properties || ['openFile']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const content = fs.readFileSync(result.filePaths[0], 'utf-8');
    return { success: true, filePath: result.filePaths[0], content };
  }
  return { success: false };
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
