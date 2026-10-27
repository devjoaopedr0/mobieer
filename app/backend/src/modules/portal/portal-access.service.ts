/**
 * Acesso do cliente ao portal criado pela gestão.
 *
 * Quando a equipe cadastra o cliente (ou converte o lead do briefing), o
 * sistema cria a conta com uma senha provisória e manda por e-mail: login é o
 * e-mail do cliente. No primeiro acesso o portal pede a troca da senha.
 *
 * Quem se cadastrou pelo site já tem senha própria: recebe só o aviso de que
 * o portal completo foi liberado.
 */
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { env } from "../../config/env";
import { sendMail } from "../../lib/mailer";
import { prisma } from "../../prisma";

// sem letras e números que se confundem (0/O, 1/l/I)
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Senha provisória legível: 10 caracteres, com letra minúscula, maiúscula e número. */
export function generateTempPassword() {
  for (;;) {
    const bytes = crypto.randomBytes(10);
    const pwd = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd) && /\d/.test(pwd)) return pwd;
  }
}

async function companyName(clientId: string) {
  const c = await prisma.client.findUnique({
    where: { id: clientId },
    select: { organization: { select: { name: true, enterprise: { select: { tradeName: true, legalName: true } } } } },
  });
  return c?.organization.enterprise.tradeName || c?.organization.enterprise.legalName || c?.organization.name || "MOBIEER";
}

const loginLink = () => `${env.appUrl}${env.portal.path}/login`;

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const button = (link: string, label: string) =>
  `<p><a href="${esc(link)}" style="background:#bd5528;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">${label}</a></p>`;

export function renderAccessEmail(p: { name: string; company: string; email: string; password: string; link: string }) {
  return {
    subject: `${p.company} — seu acesso ao portal do cliente`,
    text:
      `Olá, ${p.name}.\n\nSeu acesso ao portal do cliente da ${p.company} está pronto. Lá você acompanha o projeto, documentos, pagamentos e fala com a equipe.\n\n` +
      `Endereço: ${p.link}\nE-mail: ${p.email}\nSenha provisória: ${p.password}\n\nNo primeiro acesso o portal vai pedir para você criar uma senha nova.`,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#241f1c;line-height:1.6">
        <p>Olá, ${esc(p.name)}.</p>
        <p>Seu acesso ao <strong>portal do cliente</strong> da ${esc(p.company)} está pronto. Lá você acompanha o projeto, documentos, pagamentos e fala com a equipe.</p>
        <table style="border-collapse:collapse;margin:12px 0">
          <tr><td style="padding:4px 12px 4px 0;color:#8a7f75">E-mail</td><td style="padding:4px 0"><strong>${esc(p.email)}</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#8a7f75">Senha provisória</td><td style="padding:4px 0;font-family:monospace;font-size:16px"><strong>${esc(p.password)}</strong></td></tr>
        </table>
        ${button(p.link, "Entrar no portal")}
        <p style="font-size:13px;color:#8a7f75">No primeiro acesso o portal vai pedir para você criar uma senha nova.<br>Endereço: ${esc(p.link)}</p>
      </div>`,
  };
}

export function renderUpgradeEmail(p: { name: string; company: string; email: string; link: string }) {
  return {
    subject: `${p.company} — portal do cliente liberado`,
    text:
      `Olá, ${p.name}.\n\nSeu cadastro foi concluído e o portal do cliente da ${p.company} está liberado por completo.\n\n` +
      `Entre em ${p.link} com o e-mail ${p.email} e a senha que você criou no cadastro. Esqueceu? Use "Esqueci a senha" na tela de entrada.`,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#241f1c;line-height:1.6">
        <p>Olá, ${esc(p.name)}.</p>
        <p>Seu cadastro foi concluído e o <strong>portal do cliente</strong> da ${esc(p.company)} está liberado por completo: projeto, documentos, pagamentos e conversa com a equipe.</p>
        <p>Entre com o e-mail <strong>${esc(p.email)}</strong> e a senha que você criou no cadastro.</p>
        ${button(p.link, "Entrar no portal")}
        <p style="font-size:13px;color:#8a7f75">Esqueceu a senha? Use "Esqueci a senha" na tela de entrada.</p>
      </div>`,
  };
}

export type AccessResult =
  | { status: "created" | "reset" | "upgraded"; accountId: string; email: string; delivered: boolean }
  | { status: "exists"; accountId: string; email: string }
  | { status: "no-email" }
  | { status: "conflict"; email: string };

/** Mensagem curta para a equipe sobre o que aconteceu com o acesso. */
export function accessMessage(r: AccessResult) {
  switch (r.status) {
    case "created":
    case "reset":
      return r.delivered
        ? `Acesso ao portal enviado para ${r.email}`
        : `Acesso ao portal criado, mas o e-mail para ${r.email} não saiu. Use "Enviar nova senha" na página do projeto.`;
    case "upgraded":
      return r.delivered
        ? `O cliente já tinha cadastro pelo site: portal completo liberado e aviso enviado para ${r.email}`
        : `Portal completo liberado para ${r.email}, mas o e-mail de aviso não saiu`;
    case "exists":
      return null;
    case "no-email":
      return "Sem e-mail no cadastro: o acesso ao portal não foi enviado";
    case "conflict":
      return `O e-mail ${r.email} já é usado por outro acesso do portal: o acesso não foi criado`;
  }
}

/** Cria (se ainda não existe) o acesso do cliente com senha provisória e manda por e-mail. */
export async function grantPortalAccess(opts: {
  clientId: string;
  name: string;
  email: string | null | undefined;
  createdById?: string | null;
  /** a equipe pediu mais uma conta (ex.: cônjuge): não para no acesso que já existe */
  additional?: boolean;
}): Promise<AccessResult> {
  const email = opts.email?.trim().toLowerCase();
  if (!email) return { status: "no-email" };

  const existing = await prisma.clientAccount.findUnique({ where: { email }, select: { id: true, clientId: true } });
  if (existing && !existing.clientId) {
    // fez o cadastro rápido pelo site e a gestão cadastrou o cliente direto: liga o acesso que já existe
    await prisma.clientAccount.update({ where: { id: existing.id }, data: { clientId: opts.clientId, accessLevel: "FULL" } });
    const { delivered } = await sendUpgradeEmail(existing.id);
    return { status: "upgraded", accountId: existing.id, email, delivered };
  }
  if (existing) return existing.clientId === opts.clientId ? { status: "exists", accountId: existing.id, email } : { status: "conflict", email };
  // cliente que já tem acesso por outro e-mail não ganha um segundo automático
  const other = opts.additional ? null : await prisma.clientAccount.findFirst({ where: { clientId: opts.clientId }, select: { id: true, email: true } });
  if (other) return { status: "exists", accountId: other.id, email: other.email };

  const password = generateTempPassword();
  const account = await prisma.clientAccount.create({
    data: {
      clientId: opts.clientId,
      accessLevel: "FULL",
      name: opts.name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      status: "ACTIVE",
      mustChangePassword: true,
      createdById: opts.createdById ?? null,
    },
  });
  const mail = renderAccessEmail({ name: opts.name, company: await companyName(opts.clientId), email, password, link: loginLink() });
  const { delivered } = await sendMail({ to: email, ...mail });
  return { status: "created", accountId: account.id, email, delivered };
}

/** Gera outra senha provisória para uma conta existente e manda por e-mail. */
export async function resetPortalPassword(accountId: string): Promise<AccessResult> {
  const account = await prisma.clientAccount.findUnique({ where: { id: accountId }, select: { id: true, name: true, email: true, clientId: true } });
  if (!account?.clientId) return { status: "no-email" };
  const password = generateTempPassword();
  await prisma.clientAccount.update({
    where: { id: account.id },
    data: { passwordHash: await bcrypt.hash(password, 12), status: "ACTIVE", mustChangePassword: true, inviteToken: null, inviteExpiry: null, resetToken: null, resetTokenExpiry: null },
  });
  const mail = renderAccessEmail({ name: account.name, company: await companyName(account.clientId), email: account.email, password, link: loginLink() });
  const { delivered } = await sendMail({ to: account.email, ...mail });
  return { status: "reset", accountId: account.id, email: account.email, delivered };
}

/** Lead do briefing virou cliente: avisa que o portal completo foi liberado. */
export async function sendUpgradeEmail(accountId: string) {
  const account = await prisma.clientAccount.findUnique({ where: { id: accountId }, select: { name: true, email: true, clientId: true } });
  if (!account?.clientId) return { delivered: false };
  const mail = renderUpgradeEmail({ name: account.name, company: await companyName(account.clientId), email: account.email, link: loginLink() });
  return sendMail({ to: account.email, ...mail });
}
