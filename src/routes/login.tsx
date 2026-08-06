import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to="/dashboard" />;

  const onSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Bienvenue !");
    navigate({ to: "/dashboard" });
  };

  const onSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          owner_name: String(fd.get("owner_name") || ""),
          shop_name: String(fd.get("shop_name") || ""),
        },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Compte créé !");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex relative bg-gradient-emerald p-12 flex-col justify-between text-primary-foreground">
        <div className="absolute inset-0 pattern-kente opacity-30" />
        <Link to="/" className="relative flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-gold grid place-items-center text-gold-foreground font-display font-bold">T</div>
          <span className="font-display text-lg font-semibold">Teranga</span>
        </Link>
        <div className="relative">
          <h2 className="font-display text-4xl font-bold leading-tight">
            « Une boutique bien gérée, c'est une famille nourrie. »
          </h2>
          <p className="mt-4 text-primary-foreground/80">Suivi du stock, ventes, dépenses — en FCFA.</p>
        </div>
        <div className="relative text-sm text-primary-foreground/70">Dakar · Thiès · Saint-Louis</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-3xl font-bold">Bienvenue</h1>
          <p className="mt-1 text-sm text-muted-foreground">Connectez-vous ou créez votre compte boutique.</p>

          <Tabs defaultValue="signin" className="mt-8">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Connexion</TabsTrigger>
              <TabsTrigger value="signup">Créer un compte</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={onSignIn} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" required autoComplete="email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Mot de passe</Label>
                  <Input id="password" name="password" type="password" required autoComplete="current-password" />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />} Se connecter
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={onSignUp} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="owner_name">Nom complet</Label>
                  <Input id="owner_name" name="owner_name" placeholder="Ex : Aminata Diop" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shop_name">Nom de la boutique</Label>
                  <Input id="shop_name" name="shop_name" placeholder="Ex : Boutique Teranga Dakar" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email2">Email</Label>

                <div className="space-y-2">
                  <Label htmlFor="email2">Email</Label>
                  <Input id="email2" name="email" type="email" required autoComplete="email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password2">Mot de passe</Label>
                  <Input id="password2" name="password" type="password" minLength={6} required autoComplete="new-password" />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />} Créer le compte
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
