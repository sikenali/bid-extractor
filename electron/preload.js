"use strict";
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  showAbout: () => ipcRenderer.invoke('show-about-dialog'),
});