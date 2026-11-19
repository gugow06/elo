"use client";

import { useEffect, useState } from "react";

/**
 * Endereço da API. O padrão (NEXT_PUBLIC_API_URL) aponta para localhost, que só funciona no próprio
 * computador. Aberto de outro aparelho ou pelo IP da máquina (ex.: http://192.168.0.10:3000), o
 * navegador procuraria a API no próprio aparelho e a conexão falharia: nesse caso, usa o mesmo
 * endereço da página, na porta da API.
 */
function resolverApiUrl(): string {
  const configurada = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";
  if (typeof window === "undefined") return configurada;
  try {
    const url = new URL(configurada);
    const local = (h: string) => h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    if (local(url.hostname) && !local(window.location.hostname)) url.hostname = window.location.hostname;
    return url.toString().replace(/\/$/, "");
  } catch {
    return configurada;
  }
}

export const API_URL = resolverApiUrl();

export type Perfil = "cidadao" | "voluntario" | "tecnico" | "gestor" | "agente";

/** Primeira tela de cada perfil do painel. */
export const INICIO_POR_PERFIL: Partial<Record<Perfil, string>> = { tecnico: "/fila", gestor: "/gestao", agente: "/receber" };

export const NOME_PERFIL: Partial<Record<Perfil, string>> = { tecnico: "Técnica do CRAS", gestor: "Gestão", agente: "Agente do ponto de coleta" };

export interface UsuarioSessao {
  id: string;
  nome: string;
  perfil: Perfil;
}

const CHAVE_TOKEN = "elo.token";
const CHAVE_USUARIO = "elo.usuario";

export function salvarSessao(token: string, usuario: UsuarioSessao) {
  sessionStorage.setItem(CHAVE_TOKEN, token);
  sessionStorage.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
}

export function lerSessao(): { token: string; usuario: UsuarioSessao } | null {
  if (typeof window === "undefined") return null;
  const token = sessionStorage.getItem(CHAVE_TOKEN);
  const usuario = sessionStorage.getItem(CHAVE_USUARIO);
  return token && usuario ? { token, usuario: JSON.parse(usuario) } : null;
}

export function sair() {
  sessionStorage.removeItem(CHAVE_TOKEN);
  sessionStorage.removeItem(CHAVE_USUARIO);
  window.location.href = "/entrar";
}

export class ErroApi extends Error {
  constructor(public status: number, mensagem: string) {
    super(mensagem);
  }
}

export async function api<T = unknown>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  const sessao = lerSessao();
  let resposta: Response;
  try {
    resposta = await fetch(`${API_URL}${caminho}`, {
      ...opcoes,
      headers: {
        // Só com corpo: o Fastify recusa JSON vazio (ex.: DELETE sem corpo)
        ...(opcoes.body ? { "content-type": "application/json" } : {}),
        ...(sessao ? { authorization: `Bearer ${sessao.token}` } : {}),
        ...opcoes.headers,
      },
    });
  } catch {
    // "Failed to fetch": API fora do ar, sem rede ou bloqueio do navegador (CORS)
    throw new ErroApi(0, "Não foi possível falar com a API do ELO. Confira se ela está no ar e tente de novo.");
  }
  if (resposta.status === 401 && sessao) {
    sair();
    throw new ErroApi(401, "Sessão expirada");
  }
  const texto = await resposta.text();
  const corpo = texto ? (() => { try { return JSON.parse(texto); } catch { return texto; } })() : null;
  if (!resposta.ok) {
    const msg =
      (corpo && typeof corpo === "object" && (corpo.message?.erro ?? corpo.erro ?? corpo.message)) ||
      `Erro ${resposta.status}`;
    const detalhes = corpo?.detalhes ?? corpo?.message?.detalhes;
    throw new ErroApi(resposta.status, detalhes?.[0]?.mensagem ? `${msg}: ${detalhes[0].mensagem}` : String(msg));
  }
  return corpo as T;
}

/** Eventos em tempo real (SSE). O token vai na query porque o EventSource não envia cabeçalho. */
export function assinarEventos(caminho: string, aoReceber: (tipo: string, dados: unknown) => void): () => void {
  const sessao = lerSessao();
  if (!sessao) return () => undefined;
  const fonte = new EventSource(`${API_URL}${caminho}?token=${encodeURIComponent(sessao.token)}`);
  const tipos = ["alerta_vermelho", "solicitacao_criada", "solicitacao_atualizada", "entrega_registrada", "leitura_sensor", "alerta_ponto"];
  for (const tipo of tipos) {
    fonte.addEventListener(tipo, (e) => aoReceber(tipo, JSON.parse((e as MessageEvent).data)));
  }
  return () => fonte.close();
}

let configCache: Promise<{ modo_demo: boolean }> | null = null;

/** Modo demonstração da API (contas de teste e avisos). Em produção (MODO_DEMO=false) é false. */
export function useModoDemo(): boolean {
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    configCache ??= fetch(`${API_URL}/config`).then((r) => r.json()).catch(() => ({ modo_demo: false }));
    configCache.then((c) => setDemo(c.modo_demo === true));
  }, []);
  return demo;
}
