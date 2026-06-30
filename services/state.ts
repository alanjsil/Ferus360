import { BrowserWindow } from "electron";
import type { Usuario, Categoria, Subcategoria, Conta, Pessoa, Lancamento, Orcamento, TipoPessoa } from "../src/types";

interface State {
  categorias: Categoria[];
  subcategorias: Subcategoria[];
  contas: Conta[];
  pessoas: Pessoa[];
  lancamentos: Lancamento[];
  orcamento: Orcamento[];
  usuarioAtual: Usuario | null;
  tipoPessoaAtivo: TipoPessoa;
  usarPjAtivo: boolean;
  accessToken: string | null;
  refreshToken: string | null;
}

let state: State = {
  categorias: [],
  subcategorias: [],
  contas: [],
  pessoas: [],
  lancamentos: [],
  orcamento: [],
  usuarioAtual: null,
  tipoPessoaAtivo: "PF",
  usarPjAtivo: false,
  accessToken: null,
  refreshToken: null,
};

function notify(channel: string, data: unknown): void {
  try {
    const wins = BrowserWindow.getAllWindows();
    wins.forEach((win) => {
      win.webContents.send(channel, data);
    });
  } catch {
    // Silently fail outside Electron (e.g., tests)
  }
}

function setState(key: keyof State, value: unknown): void {
  state[key] = value as never;
  notify("state:updated", { key, value });
}

function getState(): State;
function getState<K extends keyof State>(key: K): State[K];
function getState(key?: keyof State): State | State[keyof State] {
  return key ? state[key] : state;
}

function reiniciarState(): void {
  state = {
    categorias: [],
    subcategorias: [],
    contas: [],
    pessoas: [],
    lancamentos: [],
    orcamento: [],
    usuarioAtual: null,
    tipoPessoaAtivo: "PF",
    usarPjAtivo: false,
    accessToken: null,
    refreshToken: null,
  };
}

export { getState, setState, reiniciarState };
