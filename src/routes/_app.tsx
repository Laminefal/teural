import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { RoleProvider } from "@/lib/role";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_app")({
  component: AuthGate,
});

function AuthGate() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" />;
  return (
    <RoleProvider>
      <AppShell />
    </RoleProvider>
  );
}
