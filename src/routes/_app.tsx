import { createFileRoute, Navigate, useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { RoleProvider, useRole } from "@/lib/role";
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
      <SubscriptionGate />
    </RoleProvider>
  );
}

function SubscriptionGate() {
  const { loading, hasActiveAccess, isOwner } = useRole();
  const path = useRouterState({ select: (r) => r.location.pathname });

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  // Block owners whose trial expired AND no active sub. Agents always pass.
  if (isOwner && !hasActiveAccess && path !== "/subscription") {
    return <Navigate to="/subscription" />;
  }

  return <AppShell />;
}
