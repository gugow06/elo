export const pct = (v: number | null | undefined, casas = 1) =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: casas })}%`;

export const num = (v: number | null | undefined, casas = 0) =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: casas });

export const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export const tempoEspera = (horas: number) =>
  horas < 1 ? `${Math.max(1, Math.round(horas * 60))} min` : horas < 48 ? `${num(horas, 1)} h` : `${num(horas / 24, 1)} dias`;

export const CATEGORIA: Record<string, string> = {
  alimento: "Alimentação",
  roupa: "Roupas",
  movel: "Móveis",
  material_escolar: "Material escolar",
  apoio_idoso: "Apoio a idoso",
  transporte: "Transporte",
  outro: "Outro",
};

export const CANAL: Record<string, string> = {
  app: "App",
  whatsapp: "WhatsApp",
  balcao: "Balcão do CRAS",
  web_leve: "Web leve",
};

export const ORIGEM_TRIAGEM: Record<string, string> = {
  regra: "Regra determinística",
  llm: "Modelo de linguagem",
  offline: "Classificador offline",
  fallback: "Falha segura",
  tecnico: "Técnico",
};
