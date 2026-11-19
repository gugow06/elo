"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Map as MapaLeaflet, Marker } from "leaflet";

/**
 * Mapa para conferir e ajustar a posição de um local: arraste o marcador ou clique no lugar certo.
 * Ninguém digita latitude e longitude. Leaflet + OpenStreetMap (gratuito).
 */
export function MapaAjuste({ lat, lng, aoMudar }: { lat: number; lng: number; aoMudar: (lat: number, lng: number) => void }) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaLeaflet | null>(null);
  const marcador = useRef<Marker | null>(null);
  const aoMudarRef = useRef(aoMudar);
  useEffect(() => {
    aoMudarRef.current = aoMudar;
  }, [aoMudar]);

  // Cria o mapa uma vez (o Leaflet só roda no navegador)
  useEffect(() => {
    let vivo = true;
    import("leaflet").then((L) => {
      if (!vivo || !caixa.current || mapa.current) return;
      const m = L.map(caixa.current, { scrollWheelZoom: false }).setView([lat, lng], 17);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© colaboradores do OpenStreetMap",
      }).addTo(m);
      // Ícone em HTML: evita as imagens padrão do Leaflet, que se perdem no build
      const icone = L.divIcon({
        className: "",
        html: '<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:#006b52;border:3px solid #fff;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>',
        iconSize: [28, 28],
        iconAnchor: [14, 28],
      });
      const mk = L.marker([lat, lng], { draggable: true, icon: icone, keyboard: true, title: "Posição do local (arraste para ajustar)" }).addTo(m);
      mk.on("dragend", () => {
        const p = mk.getLatLng();
        aoMudarRef.current(p.lat, p.lng);
      });
      m.on("click", (e) => {
        mk.setLatLng(e.latlng);
        aoMudarRef.current(e.latlng.lat, e.latlng.lng);
      });
      mapa.current = m;
      marcador.current = mk;
    });
    return () => {
      vivo = false;
      mapa.current?.remove();
      mapa.current = null;
      marcador.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nova posição vinda de fora (outro resultado da busca): move o marcador e centraliza
  useEffect(() => {
    const mk = marcador.current;
    if (!mk) return;
    const atual = mk.getLatLng();
    if (Math.abs(atual.lat - lat) > 1e-7 || Math.abs(atual.lng - lng) > 1e-7) {
      mk.setLatLng([lat, lng]);
      mapa.current?.setView([lat, lng], Math.max(mapa.current.getZoom(), 16));
    }
  }, [lat, lng]);

  return (
    <div>
      <div ref={caixa} className="h-72 w-full rounded-md border border-borda" role="application" aria-label="Mapa com a posição do local. Arraste o marcador ou clique no lugar certo." />
      <p className="mt-1 text-sm text-texto-2">
        Confira o marcador. Se não estiver na porta certa, <strong>arraste-o ou clique no lugar certo</strong> do mapa.
      </p>
    </div>
  );
}
