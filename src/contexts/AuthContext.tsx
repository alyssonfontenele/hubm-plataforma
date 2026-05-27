import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";
import {
  supabase,
  type Company,
  type GlobalRole,
  type Profile,
  type SectorMembership,
} from "@/integrations/supabase/client";

export type MfaState =
  | "unknown"
  | "not_required"
  | "needs_enrollment"
  | "needs_challenge"
  | "verified";

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  company: Company | null;
  globalRole: GlobalRole | null;
  sectorMemberships: SectorMembership[];
  providerToken: string | null;
  loading: boolean;
  isPasswordRecovery: boolean;
  mfaState: MfaState;
  refreshMfa: () => Promise<void>;
  clearPasswordRecovery: () => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [sectorMemberships, setSectorMemberships] = useState<SectorMembership[]>([]);
  const [providerToken, setProviderToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [mfaState, setMfaState] = useState<MfaState>("unknown");
  const navigate = useNavigate();

  const loadProfile = useCallback(async (userId: string) => {
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (profErr || !prof) {
      setProfile(null);
      setCompany(null);
      setSectorMemberships([]);
      return;
    }
    setProfile(prof as Profile);

    const [{ data: comp }, { data: members }] = await Promise.all([
      supabase.from("companies").select("id,slug,name,domain,logo_url,primary_color,email_sender,active").eq("id", prof.company_id).maybeSingle(),
      supabase
        .from("sector_members")
        .select("sector_id, role, sector:sectors!inner(id, name, slug, icon, group_name)")
        .eq("profile_id", userId)
        .eq("sector.active", true),
    ]);

    setCompany((comp as Company) ?? null);
    setSectorMemberships((members as SectorMembership[] | null) ?? []);
  }, []);

  useEffect(() => {
    let active = true;

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!active) return;
      setSession(newSession);
      const pt = newSession?.provider_token ?? null;
      if (pt) {
        setProviderToken(pt);
      } else if (!newSession) {
        setProviderToken(null);
      }
      if (event === "PASSWORD_RECOVERY") {
        setIsPasswordRecovery(true);
        void navigate({ to: "/change-password" });
      }
      if (newSession?.user) {
        // defer DB calls to avoid recursive auth callbacks
        setTimeout(() => {
          void loadProfile(newSession.user.id);
        }, 0);
      } else {
        setProfile(null);
        setCompany(null);
        setSectorMemberships([]);
      }
    });

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      const s = data.session;
      setSession(s);
      if (s?.provider_token) {
        setProviderToken(s.provider_token);
      }
      if (s?.user) {
        await loadProfile(s.user.id);
      }
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile, navigate]);

  const refresh = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  const signOut = useCallback(async () => {
    setMfaState("unknown");
    await supabase.auth.signOut();
  }, []);

  const clearPasswordRecovery = useCallback(() => {
    setIsPasswordRecovery(false);
  }, []);

  const refreshMfa = useCallback(async () => {
    if (!session?.user) {
      setMfaState("unknown");
      return;
    }
    if ((profile?.global_role ?? null) !== "admin") {
      setMfaState("not_required");
      return;
    }
    try {
      const { data: factors, error: factorsErr } = await supabase.auth.mfa.listFactors();
      if (factorsErr) throw factorsErr;
      const verifiedTotp = factors?.totp?.find((f) => f.status === "verified");
      if (!verifiedTotp) {
        setMfaState("needs_enrollment");
        return;
      }
      const { data: aal, error: aalErr } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalErr) throw aalErr;
      if (aal?.nextLevel === "aal2" && aal?.currentLevel !== "aal2") {
        setMfaState("needs_challenge");
      } else {
        setMfaState("verified");
      }
    } catch {
      setMfaState("needs_challenge");
    }
  }, [session, profile]);

  useEffect(() => {
    if (!company) return;
    document.documentElement.style.setProperty('--company-primary', company.primary_color ?? '#111111');
    document.documentElement.style.setProperty('--company-name', `"${company.name}"`);
    const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
    if (link && company.logo_url) link.href = company.logo_url;
  }, [company]);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      setMfaState("unknown");
      return;
    }
    if (!profile) return;
    void refreshMfa();
  }, [loading, session, profile, refreshMfa]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      company,
      globalRole: profile?.global_role ?? null,
      sectorMemberships,
      providerToken,
      loading,
      isPasswordRecovery,
      mfaState,
      refreshMfa,
      clearPasswordRecovery,
      refresh,
      signOut,
    }),
    [
      session,
      profile,
      company,
      sectorMemberships,
      providerToken,
      loading,
      isPasswordRecovery,
      mfaState,
      refreshMfa,
      clearPasswordRecovery,
      refresh,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
