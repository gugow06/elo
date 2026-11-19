"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alerta, Botao, Cartao, Carregando, Tag } from "@/components/ui";
import { api, lerSessao } from "@/lib/api";
import { CATEGORIA } from "@/lib/formato";

type Tipo = "ponto_coleta" | "assistencia" | "abrigo" | "distribuicao" | "saude";

const TIPOS: Record<Tipo, { rotulo: string; icone: string; ajuda: string }> = {
  ponto_coleta: { rotulo: "Ponto de coleta", icone: "📦", ajuda: "Recebe as doações dos pedidos. Pode ter sensor IoT." },
  assistencia: { rotulo: "Assistência social", icone: "🏛️", ajuda: "CRAS, CREAS, Centro POP." },
  abrigo: { rotulo: "Abrigo / acolhimento", icone: "🏠", ajuda: "Abrigo municipal, casa de passagem." },
  distribuicao: { rotulo: "Ponto de distribuição", icone: "🍲", ajuda: "Cozinha solidária, banco de alimentos." },
  saude: { rotulo: "Saúde", icone: "🩺", ajuda: "UBS e outros serviços de saúde." },
};

interface Local {
  id: string;
  tipo: Tipo;
  nome: string;
  endereco: string;
  latitude: number | null;
  longitude: number | null;
  telefone: string | null;
  horario: string | null;
  descricao: string | null;
  categorias: string[];
  vagas: number | null;
  ativo: boolean;
  bairro_id: string | null;
  bairro: string | null;
  capacidade_kg: number | null;
  estoque_kg: number | null;
  tem_sensor: boolean;
  chave_dispositivo?: string;
}

interface Lugar {
  nome: string;
  endereco: string;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  latitude: number;
  longitude: number;
}

interface Bairro {
  id: string;
  nome: string;
}

type Form = {
  tipo: Tipo;
  nome: string;
  endereco: string;
  latitude: string;
  longitude: string;
  bairro_id: string;
  telefone: string;
  horario: string;
  descricao: string;
  categorias: string[];
  vagas: string;
  capacidade_kg: string;
};

const VAZIO: Form = {
  tipo: "assistencia", nome: "", endereco: "", latitude: "", longitude: "", bairro_id: "",
  telefone: "", horario: "", descricao: "", categorias: [], vagas: "", capacidade_kg: "",
};

const campo = "min-h-12 w-full rounded-md border-2 border-borda bg-superficie px-3 focus:border-brand-700 focus:outline-none";

/** Mapa do OpenStreetMap embutido (gratuito, sem chave) para conferir o ponto. */
function MiniMapa({ lat, lng }: { lat: number; lng: number }) {
  const d = 0.004;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d}%2C${lat - d}%2C${lng + d}%2C${lat + d}&layer=mapnik&marker=${lat}%2C${lng}`;
  return (
    <div>
      <iframe title="Mapa com a posição do local" src={src} className="h-64 w-full rounded-md border border-borda" loading="lazy" />
      <p className="mt-1 text-xs text-texto-2">© colaboradores do OpenStreetMap</p>
    </div>
  );
}

/** Cadastro dos locais da rede pelo gestor: pelo nome do lugar ou pelo endereço. */
export default function Locais() {
  const gestor = lerSessao()?.usuario.perfil === "gestor";
  const [locais, setLocais] = useState<Local[] | null>(null);
  const [bairros, setBairros] = useState<Bairro[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [chave, setChave] = useState<{ nome: string; chave: string } | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [candidatos, setCandidatos] = useState<Lugar[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [filtro, setFiltro] = useState<Tipo | "">("");

  const carregar = useCallback(() => {
    api<Local[]>("/gestao/locais").then(setLocais).catch((e) => setErro(e.message));
  }, []);

  useEffect(() => {
    carregar();
    api<Bairro[]>("/bairros").then(setBairros).catch(() => undefined);
  }, [carregar]);

  const mudar = (k: keyof Form, v: string | string[]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  function novo() {
    setForm({ ...VAZIO });
    setEditando(null);
    setBusca("");
    setCandidatos(null);
    setAviso(null);
    setChave(null);
  }

  function editar(l: Local) {
    setForm({
      tipo: l.tipo, nome: l.nome, endereco: l.endereco,
      latitude: l.latitude?.toString() ?? "", longitude: l.longitude?.toString() ?? "",
      bairro_id: l.bairro_id ?? "", telefone: l.telefone ?? "", horario: l.horario ?? "", descricao: l.descricao ?? "",
      categorias: l.categorias ?? [], vagas: l.vagas?.toString() ?? "", capacidade_kg: l.capacidade_kg?.toString() ?? "",
    });
    setEditando(l.id);
    setBusca("");
    setCandidatos(null);
    setAviso(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function buscar(e: FormEvent) {
    e.preventDefault();
    if (busca.trim().length < 2) return;
    setBuscando(true);
    setErro(null);
    try {
      setCandidatos(await api<Lugar[]>(`/geo/buscar?q=${encodeURIComponent(busca.trim())}`));
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setBuscando(false);
    }
  }

  function escolher(l: Lugar) {
    setForm((f) =>
      f ? { ...f, nome: f.nome || l.nome, endereco: l.endereco || l.nome, latitude: String(l.latitude), longitude: String(l.longitude) } : f,
    );
    const b = bairros.find((x) => l.bairro && x.nome.toLowerCase() === l.bairro.toLowerCase());
    if (b) mudar("bairro_id", b.id);
    setCandidatos(null);
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSalvando(true);
    setErro(null);
    const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
    const corpo = {
      ...(editando ? {} : { tipo: form.tipo }),
      nome: form.nome, endereco: form.endereco,
      latitude: num(form.latitude), longitude: num(form.longitude),
      bairro_id: form.bairro_id || null,
      telefone: form.telefone, horario: form.horario, descricao: form.descricao,
      categorias: form.categorias,
      vagas: form.tipo === "abrigo" ? num(form.vagas) : null,
      capacidade_kg: form.tipo === "ponto_coleta" ? num(form.capacidade_kg) : null,
    };
    try {
      const salvo = await api<Local>(editando ? `/gestao/locais/${editando}` : "/gestao/locais", {
        method: editando ? "PATCH" : "POST",
        body: JSON.stringify(corpo),
      });
      if (salvo.chave_dispositivo) setChave({ nome: salvo.nome, chave: salvo.chave_dispositivo });
      setAviso(editando ? `"${salvo.nome}" atualizado.` : `"${salvo.nome}" cadastrado. Já aparece no mapa do app.`);
      setForm(null);
      setEditando(null);
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(l: Local) {
    try {
      await api(`/gestao/locais/${l.id}`, { method: "PATCH", body: JSON.stringify({ ativo: !l.ativo }) });
      setAviso(l.ativo ? `"${l.nome}" desativado: saiu do mapa.` : `"${l.nome}" reativado.`);
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  const lat = form ? Number(form.latitude.replace(",", ".")) : NaN;
  const lng = form ? Number(form.longitude.replace(",", ".")) : NaN;
  const temPonto = form && form.latitude !== "" && form.longitude !== "" && !Number.isNaN(lat) && !Number.isNaN(lng);
  const visiveis = (locais ?? []).filter((l) => !filtro || l.tipo === filtro);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-brand-900">Locais da rede</h1>
          <p className="text-texto-2">Pontos de coleta, assistência social, abrigos, distribuição e saúde que aparecem no mapa do app.</p>
        </div>
        {gestor && !form && <Botao onClick={novo}>＋ Novo local</Botao>}
      </div>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {aviso && <Alerta tipo="ok">{aviso}</Alerta>}
      {chave && (
        <Alerta tipo="info">
          Chave do sensor de &quot;{chave.nome}&quot;: <code className="rounded bg-superficie px-2 py-1 font-mono">{chave.chave}</code>
          <br />
          Anote agora e configure no dispositivo: ela não será mostrada de novo.
        </Alerta>
      )}

      {form && (
        <Cartao>
          <form onSubmit={salvar} className="space-y-5">
            <h2 className="text-xl font-extrabold text-brand-900">{editando ? "Editar local" : "Novo local"}</h2>

            {!editando && (
              <fieldset>
                <legend className="mb-2 font-bold">Tipo</legend>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  {(Object.keys(TIPOS) as Tipo[]).map((t) => (
                    <label key={t} className={`flex min-h-12 cursor-pointer flex-col rounded-md border-2 p-3 ${form.tipo === t ? "border-brand-700 bg-brand-50" : "border-borda"}`}>
                      <span className="font-bold">
                        <input type="radio" name="tipo" value={t} checked={form.tipo === t} onChange={() => mudar("tipo", t)} className="mr-2" />
                        {TIPOS[t].icone} {TIPOS[t].rotulo}
                      </span>
                      <span className="text-sm text-texto-2">{TIPOS[t].ajuda}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="rounded-md bg-fundo p-4">
              <label htmlFor="busca" className="font-bold">Buscar pelo nome do lugar ou pelo endereço</label>
              <div className="mt-2 flex gap-2">
                <input
                  id="busca"
                  className={campo}
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") buscar(e); }}
                  placeholder="Ex.: CRAS Liberdade, Salvador  ou  Rua Lima e Silva, 100, Salvador"
                />
                <Botao type="button" variante="secundario" onClick={buscar} disabled={buscando}>{buscando ? "Buscando…" : "Buscar"}</Botao>
              </div>
              {candidatos && (
                <ul className="mt-3 space-y-2" aria-label="Resultados da busca">
                  {candidatos.length === 0 && <li className="text-texto-2">Nada encontrado. Tente com o nome da cidade junto.</li>}
                  {candidatos.map((c, i) => (
                    <li key={i}>
                      <button type="button" onClick={() => escolher(c)} className="w-full rounded-md border-2 border-borda bg-superficie p-3 text-left hover:border-brand-700">
                        <span className="font-bold">{c.nome}</span>
                        <span className="block text-sm text-texto-2">{c.endereco}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-texto-2">Busca de endereço: dados © colaboradores do OpenStreetMap.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="nome" className="font-bold">Nome</label>
                <input id="nome" required className={campo} value={form.nome} onChange={(e) => mudar("nome", e.target.value)} />
              </div>
              <div>
                <label htmlFor="bairro" className="font-bold">Bairro {form.tipo === "ponto_coleta" ? "" : "(opcional)"}</label>
                <select id="bairro" className={campo} value={form.bairro_id} onChange={(e) => mudar("bairro_id", e.target.value)} required={form.tipo === "ponto_coleta"}>
                  <option value="">Sem bairro</option>
                  {bairros.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label htmlFor="endereco" className="font-bold">Endereço</label>
                <input id="endereco" required className={campo} value={form.endereco} onChange={(e) => mudar("endereco", e.target.value)} />
              </div>
              <div>
                <label htmlFor="lat" className="font-bold">Latitude</label>
                <input id="lat" required inputMode="decimal" className={campo} value={form.latitude} onChange={(e) => mudar("latitude", e.target.value)} />
              </div>
              <div>
                <label htmlFor="lng" className="font-bold">Longitude</label>
                <input id="lng" required inputMode="decimal" className={campo} value={form.longitude} onChange={(e) => mudar("longitude", e.target.value)} />
              </div>
              {temPonto && (
                <div className="md:col-span-2">
                  <MiniMapa lat={lat} lng={lng} />
                  <p className="mt-1 text-sm text-texto-2">Confira se o marcador está no lugar certo. Se não estiver, ajuste a latitude e a longitude.</p>
                </div>
              )}
              <div>
                <label htmlFor="tel" className="font-bold">Telefone (opcional)</label>
                <input id="tel" className={campo} value={form.telefone} onChange={(e) => mudar("telefone", e.target.value)} />
              </div>
              <div>
                <label htmlFor="horario" className="font-bold">Horário (opcional)</label>
                <input id="horario" className={campo} value={form.horario} onChange={(e) => mudar("horario", e.target.value)} placeholder="Seg a sex, 8h às 17h" />
              </div>
              {form.tipo === "abrigo" && (
                <div>
                  <label htmlFor="vagas" className="font-bold">Vagas</label>
                  <input id="vagas" inputMode="numeric" className={campo} value={form.vagas} onChange={(e) => mudar("vagas", e.target.value)} />
                </div>
              )}
              {form.tipo === "ponto_coleta" && (
                <div>
                  <label htmlFor="cap" className="font-bold">Capacidade (kg)</label>
                  <input id="cap" inputMode="decimal" className={campo} value={form.capacidade_kg} onChange={(e) => mudar("capacidade_kg", e.target.value)} placeholder="200" />
                </div>
              )}
              <div className="md:col-span-2">
                <label htmlFor="desc" className="font-bold">Descrição (opcional)</label>
                <textarea id="desc" rows={2} className={`${campo} py-2`} value={form.descricao} onChange={(e) => mudar("descricao", e.target.value)} placeholder="Serviços oferecidos, público atendido, como chegar…" />
              </div>
              {(form.tipo === "ponto_coleta" || form.tipo === "distribuicao") && (
                <fieldset className="md:col-span-2">
                  <legend className="font-bold">{form.tipo === "ponto_coleta" ? "Recebe" : "Distribui"}</legend>
                  <div className="mt-2 flex flex-wrap gap-3">
                    {Object.entries(CATEGORIA).map(([k, v]) => (
                      <label key={k} className="flex min-h-12 items-center gap-2 rounded-full border-2 border-borda px-4">
                        <input
                          type="checkbox"
                          checked={form.categorias.includes(k)}
                          onChange={(e) => mudar("categorias", e.target.checked ? [...form.categorias, k] : form.categorias.filter((x) => x !== k))}
                        />
                        {v}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            </div>

            <div className="flex gap-3">
              <Botao type="submit" disabled={salvando}>{salvando ? "Salvando…" : editando ? "Salvar alterações" : "Cadastrar local"}</Botao>
              <Botao type="button" variante="secundario" onClick={() => { setForm(null); setEditando(null); }}>Cancelar</Botao>
            </div>
          </form>
        </Cartao>
      )}

      <Cartao>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label htmlFor="filtro" className="font-bold">Tipo</label>
          <select id="filtro" className={`${campo} w-auto`} value={filtro} onChange={(e) => setFiltro(e.target.value as Tipo | "")}>
            <option value="">Todos</option>
            {(Object.keys(TIPOS) as Tipo[]).map((t) => <option key={t} value={t}>{TIPOS[t].rotulo}</option>)}
          </select>
          <span className="text-texto-2">{visiveis.length} locais</span>
        </div>
        {!locais ? (
          <Carregando />
        ) : visiveis.length === 0 ? (
          <p className="text-texto-2">Nenhum local cadastrado{filtro ? " deste tipo" : ""}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <caption className="sr-only">Locais da rede do município</caption>
              <thead className="border-b border-borda text-sm text-texto-2">
                <tr>
                  <th className="py-2 pr-3">Tipo</th>
                  <th className="py-2 pr-3">Nome e endereço</th>
                  <th className="py-2 pr-3">Bairro</th>
                  <th className="py-2 pr-3">Detalhes</th>
                  <th className="py-2 pr-3">Situação</th>
                  {gestor && <th className="py-2"><span className="sr-only">Ações</span></th>}
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => (
                  <tr key={l.id} className={`border-b border-borda align-top ${l.ativo ? "" : "opacity-60"}`}>
                    <td className="py-3 pr-3 whitespace-nowrap">{TIPOS[l.tipo].icone} {TIPOS[l.tipo].rotulo}</td>
                    <td className="py-3 pr-3">
                      <p className="font-bold">{l.nome}</p>
                      <p className="text-sm text-texto-2">{l.endereco}</p>
                      {l.latitude === null && <p className="text-sm font-bold text-risco-vermelha">Sem posição no mapa: edite e busque o endereço.</p>}
                    </td>
                    <td className="py-3 pr-3">{l.bairro ?? "—"}</td>
                    <td className="py-3 pr-3 text-sm">
                      {l.tipo === "abrigo" && l.vagas !== null && <p>{l.vagas} vagas</p>}
                      {l.tipo === "ponto_coleta" && l.capacidade_kg !== null && <p>{l.estoque_kg ?? 0} de {l.capacidade_kg} kg{l.tem_sensor ? " · com sensor" : ""}</p>}
                      {l.horario && <p>{l.horario}</p>}
                      {l.telefone && <p>{l.telefone}</p>}
                      {l.categorias.length > 0 && <p className="text-texto-2">{l.categorias.map((c) => CATEGORIA[c] ?? c).join(", ")}</p>}
                    </td>
                    <td className="py-3 pr-3">{l.ativo ? <Tag tom="marca">Ativo</Tag> : <Tag tom="neutro">Desativado</Tag>}</td>
                    {gestor && (
                      <td className="py-3 whitespace-nowrap">
                        <Botao variante="texto" onClick={() => editar(l)} aria-label={`Editar ${l.nome}`}>Editar</Botao>
                        <Botao variante="texto" onClick={() => alternarAtivo(l)} aria-label={`${l.ativo ? "Desativar" : "Reativar"} ${l.nome}`}>
                          {l.ativo ? "Desativar" : "Reativar"}
                        </Botao>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>
    </div>
  );
}
