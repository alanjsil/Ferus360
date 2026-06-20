import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronDialog", {
  confirmar: (senha: string) => ipcRenderer.send("dialog-senha:confirmar", senha),
  cancelar: () => ipcRenderer.send("dialog-senha:cancelar"),
});
