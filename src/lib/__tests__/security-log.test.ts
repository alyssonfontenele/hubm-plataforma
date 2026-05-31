import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the supabase client before importing the module under test
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "test-user-id" } } }),
    },
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
  },
}));

import { logSecurityEvent } from "../security-log";
import { supabase } from "@/integrations/supabase/client";

describe("logSecurityEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("insere evento válido na tabela admin_logs", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockReturnValue({ insert: insertMock } as never);

    await logSecurityEvent("login_success", { method: "cpf" });

    expect(supabase.from).toHaveBeenCalledWith("admin_logs");
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "login_success",
        action: "login_success",
        target_type: "security_event",
        metadata: { method: "cpf" },
      })
    );
  });

  it("não quebra quando metadata é omitido (default vazio)", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockReturnValue({ insert: insertMock } as never);

    await expect(logSecurityEvent("login_failure")).resolves.toBeUndefined();

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: {} })
    );
  });

  it("não lança exceção mesmo se a inserção falhar", async () => {
    const insertMock = vi.fn().mockRejectedValue(new Error("DB error"));
    vi.mocked(supabase.from).mockReturnValue({ insert: insertMock } as never);

    // logSecurityEvent nunca deve propagar erros — logging é fire-and-forget
    await expect(logSecurityEvent("login_success", {})).resolves.toBeUndefined();
  });

  it("inclui admin_id do usuário autenticado quando disponível", async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: "abc-123" } },
    } as never);
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockReturnValue({ insert: insertMock } as never);

    await logSecurityEvent("user_created");

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ admin_id: "abc-123" })
    );
  });

  it("usa admin_id null quando usuário não está autenticado", async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: null },
    } as never);
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockReturnValue({ insert: insertMock } as never);

    await logSecurityEvent("lockout_triggered");

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ admin_id: null })
    );
  });
});
