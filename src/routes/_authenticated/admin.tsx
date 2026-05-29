import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { UserCog } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UsersTab } from "@/components/admin/UsersTab";
import { SectorsTab } from "@/components/admin/sectors-tab";
import { CargosTab } from "@/components/admin/CargosTab";
import { HistoryTab } from "@/components/admin/HistoryTab";
import { SettingsTab } from "@/components/admin/SettingsTab";
import { ImportTab } from "@/components/admin/ImportTab";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  head: () => ({ meta: [{ title: "Admin — HubM" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { globalRole, company, loading, session } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && globalRole !== "admin") {
      void navigate({ to: "/app" });
    }
  }, [loading, globalRole, navigate]);

  if (globalRole !== "admin" || !company) return null;

  const adminId = session?.user?.id ?? null;

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wider text-text-muted">Administração</p>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <UserCog className="w-6 h-6" /> Painel administrativo
        </h1>
      </header>

      <Tabs defaultValue="users" className="space-y-6">
        <TabsList className="bg-surface border border-border">
          <TabsTrigger value="users">Usuários</TabsTrigger>
          <TabsTrigger value="sectors">Setores</TabsTrigger>
          <TabsTrigger value="cargos">Cargos</TabsTrigger>
          <TabsTrigger value="import">Importar</TabsTrigger>
          <TabsTrigger value="history">Histórico de ações</TabsTrigger>
          <TabsTrigger value="settings">Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-0">
          <UsersTab companyId={company.id} currentUserId={adminId} />
        </TabsContent>

        <TabsContent value="sectors" className="mt-0">
          <SectorsTab companyId={company.id} adminId={adminId} />
        </TabsContent>

        <TabsContent value="cargos" className="mt-0">
          <CargosTab companyId={company.id} />
        </TabsContent>

        <TabsContent value="import" className="mt-0">
          <ImportTab companyId={company.id} />
        </TabsContent>

        <TabsContent value="history" className="mt-0">
          <HistoryTab companyId={company.id} />
        </TabsContent>

        <TabsContent value="settings" className="mt-0">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
