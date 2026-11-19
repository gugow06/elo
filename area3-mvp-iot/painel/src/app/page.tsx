"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { lerSessao } from "@/lib/api";

export default function Inicio() {
  const router = useRouter();
  useEffect(() => {
    const s = lerSessao();
    if (!s) router.replace("/entrar");
    else router.replace(s.usuario.perfil === "tecnico" ? "/fila" : "/gestao");
  }, [router]);
  return null;
}
