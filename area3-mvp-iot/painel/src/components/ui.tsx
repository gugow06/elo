"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Faixa de risco: sempre cor + ícone + texto (nunca só cor, RNF-A08). */
const FAIXA = {
  verde: { texto: "Verde", icone: "●", classe: "bg-risco-verde-claro text-risco-verde", desc: "Rede cidadã" },
  amarela: { texto: "Amarela", icone: "▲", classe: "bg-risco-amarela-claro text-risco-amarela", desc: "Contato pessoal" },
  vermelha: { texto: "Vermelha", icone: "■", classe: "bg-risco-vermelha-claro text-risco-vermelha", desc: "Risco: prioridade" },
} as const;

export function FaixaRisco({ faixa, detalhada = false }: { faixa: keyof typeof FAIXA; detalhada?: boolean }) {
  const f = FAIXA[faixa];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${f.classe}`}>
      <span aria-hidden="true">{f.icone}</span>
      <span>
        Faixa {f.texto}
        {detalhada && <span className="font-semibold"> · {f.desc}</span>}
      </span>
    </span>
  );
}

export function Tag({ children, tom = "acento" }: { children: ReactNode; tom?: "acento" | "marca" | "neutro" }) {
  const classes = {
    acento: "bg-accent-500 text-brand-900", // texto escuro sobre âmbar (contraste)
    marca: "bg-brand-100 text-brand-900",
    neutro: "bg-fundo text-texto-2 border border-borda",
  }[tom];
  return <span className={`inline-flex items-center rounded-sm px-2.5 py-0.5 text-sm font-bold ${classes}`}>{children}</span>;
}

export function Botao({
  variante = "primario",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: "primario" | "secundario" | "texto" | "perigo" }) {
  const estilos = {
    primario: "bg-brand-900 text-white hover:bg-brand-700 disabled:bg-texto-2",
    secundario: "border-2 border-borda bg-superficie text-brand-900 hover:border-brand-700",
    texto: "text-brand-700 underline-offset-4 hover:underline",
    perigo: "bg-risco-vermelha text-white hover:opacity-90",
  }[variante];
  return (
    <button
      {...props}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 font-bold transition disabled:cursor-not-allowed ${estilos} ${className}`}
    />
  );
}

export function Cartao({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg bg-superficie p-5 shadow-e1 ${className}`}>{children}</section>;
}

export interface Meta {
  valor: number;
  sentido: "minimo" | "maximo";
  texto: string;
}

/** Indicador com meta escrita em texto: o estado nunca é comunicado só por cor. */
export function Kpi({ titulo, valor, formatado, meta, ajuda }: { titulo: string; valor: number | null; formatado: string; meta?: Meta; ajuda?: string }) {
  const ok = meta && valor !== null ? (meta.sentido === "minimo" ? valor >= meta.valor : valor <= meta.valor) : null;
  return (
    <Cartao className="flex flex-col gap-1">
      <h3 className="text-sm font-bold text-texto-2">{titulo}</h3>
      <p className="text-3xl font-extrabold text-brand-900">{formatado}</p>
      {meta && ok !== null && (
        <p className={`text-sm font-bold ${ok ? "text-risco-verde" : "text-risco-vermelha"}`}>
          <span aria-hidden="true">{ok ? "✓ " : "✕ "}</span>
          {ok ? "Dentro da meta" : "Fora da meta"}: {meta.texto}
        </p>
      )}
      {ajuda && <p className="text-sm text-texto-2">{ajuda}</p>}
    </Cartao>
  );
}

export function Alerta({ tipo = "info", children }: { tipo?: "info" | "erro" | "risco" | "ok"; children: ReactNode }) {
  const c = {
    info: "bg-brand-50 text-brand-900 border-brand-600",
    erro: "bg-risco-vermelha-claro text-risco-vermelha border-risco-vermelha",
    risco: "bg-risco-vermelha-claro text-risco-vermelha border-risco-vermelha",
    ok: "bg-risco-verde-claro text-risco-verde border-risco-verde",
  }[tipo];
  return (
    <div role={tipo === "erro" || tipo === "risco" ? "alert" : "status"} className={`rounded-md border-l-4 px-4 py-3 font-semibold ${c}`}>
      {children}
    </div>
  );
}

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return (
    <p role="status" className="py-8 text-center text-texto-2">
      {texto}
    </p>
  );
}
