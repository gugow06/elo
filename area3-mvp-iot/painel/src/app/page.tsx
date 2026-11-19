"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { INICIO_POR_PERFIL, lerSessao } from "@/lib/api";

export default function Inicio() {
  const router = useRouter();
  useEffect(() => {
    const s = lerSessao();
    if (!s) router.replace("/entrar");
    else router.replace(INICIO_POR_PERFIL[s.usuario.perfil] ?? "/entrar");
  }, [router]);
  return null;
}
