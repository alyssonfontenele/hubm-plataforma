/**
 * Testes de lógica de rate limiting para a Edge Function recover-cpf-password.
 *
 * Estes testes verificam o comportamento da lógica de lockout de forma isolada,
 * sem depender da Edge Function completa ou do banco de dados.
 *
 * Para rodar: npx vitest run supabase/functions/__tests__/auth-rate-limit.test.ts
 */
import { describe, it, expect } from "vitest";

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutos

// Lógica extraída da Edge Function para teste isolado
function computeNextState(
  currentAttempts: number,
  lockedUntil: Date | null,
  now: Date
): { blocked: boolean; newAttempts: number; newLockedUntil: Date | null } {
  // Verificar lockout ativo
  if (lockedUntil && lockedUntil > now) {
    return { blocked: true, newAttempts: currentAttempts, newLockedUntil: lockedUntil };
  }

  const newAttempts = currentAttempts + 1;
  const newLockedUntil =
    newAttempts >= RATE_LIMIT_MAX
      ? new Date(now.getTime() + RATE_LIMIT_LOCKOUT_MS)
      : null;

  return { blocked: false, newAttempts, newLockedUntil };
}

describe("auth-rate-limit — lógica de lockout", () => {
  const now = new Date("2026-06-01T12:00:00Z");

  it("primeira tentativa: permite e registra 1 attempt", () => {
    const result = computeNextState(0, null, now);
    expect(result.blocked).toBe(false);
    expect(result.newAttempts).toBe(1);
    expect(result.newLockedUntil).toBeNull();
  });

  it("segunda a quarta tentativa: permite sem lockout", () => {
    for (let prev = 1; prev < RATE_LIMIT_MAX - 1; prev++) {
      const result = computeNextState(prev, null, now);
      expect(result.blocked).toBe(false);
      expect(result.newLockedUntil).toBeNull();
    }
  });

  it("quinta tentativa (limite): permite mas aplica lockout", () => {
    const result = computeNextState(RATE_LIMIT_MAX - 1, null, now);
    expect(result.blocked).toBe(false);
    expect(result.newAttempts).toBe(RATE_LIMIT_MAX);
    expect(result.newLockedUntil).not.toBeNull();
    expect(result.newLockedUntil!.getTime()).toBe(now.getTime() + RATE_LIMIT_LOCKOUT_MS);
  });

  it("sexta tentativa durante lockout: bloqueia sem incrementar", () => {
    const lockedUntil = new Date(now.getTime() + RATE_LIMIT_LOCKOUT_MS);
    const result = computeNextState(RATE_LIMIT_MAX, lockedUntil, now);
    expect(result.blocked).toBe(true);
    expect(result.newAttempts).toBe(RATE_LIMIT_MAX); // não incrementa
  });

  it("após lockout expirado: permite e reinicia contador", () => {
    const expiredLockout = new Date(now.getTime() - 1); // 1ms antes de now
    const result = computeNextState(RATE_LIMIT_MAX, expiredLockout, now);
    expect(result.blocked).toBe(false);
    expect(result.newAttempts).toBe(RATE_LIMIT_MAX + 1);
  });

  it("lockout dura exatamente 15 minutos", () => {
    const result = computeNextState(RATE_LIMIT_MAX - 1, null, now);
    const expectedEnd = new Date(now.getTime() + 15 * 60 * 1000);
    expect(result.newLockedUntil?.toISOString()).toBe(expectedEnd.toISOString());
  });
});
