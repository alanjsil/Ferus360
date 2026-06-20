import type { ElectronAPI } from "../../preload";

export {};

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
