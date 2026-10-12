"use strict";
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const isDev = process.env.NODE_ENV === 'development';
const BACKEND_PORT = 3000;
let backendProc = null;

function startBackend() {
  const backendEntry = path.join(app.getAppPath(), 'backend', 'dist', 'index.js');
  // 以 Node 模式运行后端（better-sqlite3 原生模块已随 electron-builder 重编译）
  backendProc = spawn(process.execPath, [backendEntry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(BACKEND_PORT),
      BID_EXTRACTOR_DATA_DIR: app.getPath('userData'),
    },
    stdio: 'inherit',
  });
  backendProc.on('exit', (code) => {
    console.log(`[electron] 后端进程退出 code=${code}`);
  });
}

function waitForBackend(timeout = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const probe = () => {
      const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/health`, (res) => {
        if (res.statusCode === 200) resolve();
        else retry();
      });
      req.on('error', retry);
    };
    const retry = () => {
      if (Date.now() - start > timeout) return reject(new Error('后端启动超时'));
      setTimeout(probe, 250);
    };
    probe();
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#F7F5EF',
    icon: path.join(app.getAppPath(), 'frontend', 'dist', 'logo.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const version = app.getVersion();
  win.setTitle(`文取猩 v${version} (${process.platform}/${process.arch})`);

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    // 生产：运行内置 Express 后端并加载其托管的静态前端
    startBackend();
    waitForBackend()
      .then(() => win.loadURL(`http://localhost:${BACKEND_PORT}`))
      .catch((err) => {
        console.error('[electron]', err.message);
        dialog.showErrorBox('启动失败', `后端服务未能启动：${err.message}`);
        app.quit();
      });
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (backendProc) backendProc.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (backendProc) backendProc.kill();
});

// IPC: 应用信息
ipcMain.handle('get-app-info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
}));

ipcMain.handle('show-about-dialog', () => {
  dialog.showMessageBox({
    type: 'info',
    title: '关于 文取猩',
    message: `文取猩\n版本 ${app.getVersion()}\n${process.platform}/${process.arch}`,
    buttons: ['确定'],
  });
});