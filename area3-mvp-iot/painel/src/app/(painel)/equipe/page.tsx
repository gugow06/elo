"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alerta, Botao, Cartao, Carregando, Tag } from "@/components/ui";
import { api } from "@/lib/api";

interface Membro {
  id: string;
  nome: string;
  email: string | null;
  telefone: string;
  perfil: "tecnico" | "gestor";
}

const campo = "min-h-12 w-full rounded-md border-2 border-borda bg-superficie px-3 focus:border-brand-700 focus:outline-none";
const VAZIO = { nome: "", email: "", telefone: "", perfil: "tecnico" as Membro["perfil"] };

/** Equipe do painel: o gestor convida técnicas(os) do CRAS e outros gestores do município. */
export default function Equipe() {
  const [equipe, setEquipe] = useState<Membro[] | null>(null);
  const [form, setForm] = useState(VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(() => {
    api<Membro[]>("/gestao/equipe").then(setEquipe).catch((e) => setErro(e.message));
  }, []);
  useEffect(carregar, [carregar]);

  async function convidar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    setAviso(null);
    try {
      const m = await api<Membro>("/gestao/equipe", { method: "POST", body: JSON.stringify(form) });
      setAviso(`${m.nome} foi convidada(o). Enviamos um e-mail para ${m.email} com o endereço do painel.`);
      setForm(VAZIO);
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-brand-900">Equipe</h1>
        <p className="text-texto-2">Quem usa o painel no seu município. A pessoa convidada entra com o e-mail e um código de 6 dígitos, sem senha.</p>
      </div>
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {aviso && <Alerta tipo="ok">{aviso}</Alerta>}

      <Cartao>
        <form onSubmit={convidar} className="grid gap-4 md:grid-cols-2">
          <h2 className="text-xl font-extrabold text-brand-900 md:col-span-2">Convidar para o painel</h2>
          <div>
            <label htmlFor="nome" className="font-bold">Nome</label>
            <input id="nome" required className={campo} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </div>
          <div>
            <label htmlFor="perfil" className="font-bold">Função</label>
            <select id="perfil" className={campo} value={form.perfil} onChange={(e) => setForm({ ...form, perfil: e.target.value as Membro["perfil"] })}>
              <option value="tecnico">Técnica(o) do CRAS: fila e fichas dos pedidos</option>
              <option value="gestor">Gestão: indicadores, locais e equipe</option>
            </select>
          </div>
          <div>
            <label htmlFor="email" className="font-bold">E-mail</label>
            <input id="email" type="email" required className={campo} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label htmlFor="telefone" className="font-bold">Telefone com DDD</label>
            <input id="telefone" type="tel" required className={campo} value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Botao type="submit" disabled={enviando}>{enviando ? "Convidando…" : "Convidar"}</Botao>
          </div>
        </form>
      </Cartao>

      <Cartao>
        {!equipe ? (
          <Carregando />
        ) : (
          <table className="w-full text-left">
            <caption className="sr-only">Equipe do painel</caption>
            <thead className="border-b border-borda text-sm text-texto-2">
              <tr>
                <th className="py-2 pr-3">Nome</th>
                <th className="py-2 pr-3">E-mail</th>
                <th className="py-2 pr-3">Telefone</th>
                <th className="py-2">Função</th>
              </tr>
            </thead>
            <tbody>
              {equipe.map((m) => (
                <tr key={m.id} className="border-b border-borda">
                  <td className="py-3 pr-3 font-bold">{m.nome}</td>
                  <td className="py-3 pr-3">{m.email ?? "—"}</td>
                  <td className="py-3 pr-3">{m.telefone}</td>
                  <td className="py-3">{m.perfil === "tecnico" ? <Tag tom="marca">Técnica(o) do CRAS</Tag> : <Tag tom="acento">Gestão</Tag>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Cartao>
    </div>
  );
}
