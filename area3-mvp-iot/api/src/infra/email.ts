import { Logger } from '@nestjs/common';

const log = new Logger('Email');

export interface ResultadoEnvio {
  enviado: boolean;
  motivo?: string;
}

/**
 * Envia e-mail pelo Resend (https://resend.com/docs/api-reference/emails/send-email).
 * Sem RESEND_API_KEY, só registra no log (desenvolvimento e testes).
 * Com o remetente de teste onboarding@resend.dev, o Resend só entrega no e-mail dono da conta;
 * para outros destinatários ele recusa, e a falha é registrada sem derrubar o login.
 */
export async function enviarEmail(para: string, assunto: string, texto: string, html: string): Promise<ResultadoEnvio> {
  const chave = process.env.RESEND_API_KEY;
  if (!chave) {
    log.log(`[e-mail simulado] para ${para}: ${assunto}`);
    return { enviado: false, motivo: 'RESEND_API_KEY não configurada' };
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${chave}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'ELO <onboarding@resend.dev>',
        to: [para],
        subject: assunto,
        text: texto,
        html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) {
      const motivo = `Resend respondeu ${r.status}: ${(await r.text()).slice(0, 300)}`;
      log.warn(`Falha ao enviar para ${para}. ${motivo}`);
      return { enviado: false, motivo };
    }
    return { enviado: true };
  } catch (erro) {
    log.warn(`Falha ao enviar para ${para}: ${(erro as Error).message}`);
    return { enviado: false, motivo: (erro as Error).message };
  }
}

export function emailCodigo(codigo: string): { assunto: string; texto: string; html: string } {
  const assunto = `Seu código do ELO: ${codigo}`;
  const texto = `Seu código de acesso ao ELO é ${codigo}. Ele vale por 10 minutos.\n\nSe não foi você, ignore este e-mail.`;
  const html = `<div style="font-family:Arial,sans-serif;color:#14231D;max-width:480px">
  <p style="font-size:20px;font-weight:800;color:#003B2E;margin:0 0 16px">elo</p>
  <p>Seu código de acesso ao ELO é:</p>
  <p style="font-size:32px;font-weight:800;letter-spacing:8px;color:#003B2E;margin:8px 0 16px">${codigo}</p>
  <p>Ele vale por 10 minutos.</p>
  <p style="color:#4A5A53;font-size:13px">Se não foi você, ignore este e-mail.</p>
</div>`;
  return { assunto, texto, html };
}
