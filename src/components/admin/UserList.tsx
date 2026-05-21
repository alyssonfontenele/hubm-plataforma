import type { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { Profile } from "@/integrations/supabase/client";

interface UserListProps {
  profiles: Profile[];
  loading: boolean;
  renderActions: (profile: Profile) => ReactNode;
}

export function UserList({ profiles, loading, renderActions }: UserListProps) {
  return (
    <div className="border border-border rounded-lg bg-surface overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-border">
            <TableHead>Nome</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Papel global</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-text-muted py-8">
                Carregando…
              </TableCell>
            </TableRow>
          ) : profiles.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-text-muted py-8">
                Nenhum usuário cadastrado.
              </TableCell>
            </TableRow>
          ) : (
            profiles.map((p) => (
              <TableRow key={p.id} className="border-border">
                <TableCell>
                  <div className="font-medium text-text-primary">{p.full_name}</div>
                  {p.display_name && p.display_name !== p.full_name && (
                    <div className="text-xs text-text-muted">{p.display_name}</div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="border-border text-text-primary">
                    {p.auth_type === "google" ? "Google" : "CPF"}
                  </Badge>
                </TableCell>
                <TableCell className="text-text-primary capitalize">{p.global_role}</TableCell>
                <TableCell>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full border ${
                      p.active && !p.deleted_at
                        ? "border-border text-text-primary bg-background"
                        : "border-border text-text-muted bg-surface"
                    }`}
                  >
                    {p.deleted_at ? "Inativo" : p.active ? "Ativo" : "Suspenso"}
                  </span>
                </TableCell>
                <TableCell className="text-right">{renderActions(p)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
