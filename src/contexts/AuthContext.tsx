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
import type { Session } from "@supabase/supabase-js";
import {
  supabase,
  type Company,
  type GlobalRole,
  type Profile,
  type SectorMembership,
} from "@/integrations/supabase/client";

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  company: Company | null;
  globalRole: GlobalRole | null;
  sectorMemberships: SectorMembership[];
  providerToken: string | null;
  loading: boolean;
  isPasswordRecovery: boolean;
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
      supabase.from("companies").select("*").eq("id", prof.company_id).maybeSingle(),
      supabase
        .from("sector_members")
        .select("sector_id, role, sector:sectors(id, name, slug, icon)")
        .eq("profile_id", userId),
    ]);

    setCompany((comp as Company) ?? null);
    setSectorMemberships((members as SectorMembership[] | null) ?? []);
  }, []);

  useEffect(() => {
    let active = true;

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!active) return;
      setSession(newSession);
      const pt = newSession?.provider_token ?? null;
      if (pt) {
        setProviderToken(pt);
      } else if (!newSession) {
        setProviderToken(null);
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
      setSession(data.session);
      if (data.session?.provider_token) {
        setProviderToken(data.session.provider_token);
      }
      if (data.session?.user) {
        await loadProfile(data.session.user.id);
      }
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refresh = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      company,
      globalRole: profile?.global_role ?? null,
      sectorMemberships,
      providerToken,
      loading,
      refresh,
      signOut,
    }),
    [session, profile, company, sectorMemberships, providerToken, loading, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
