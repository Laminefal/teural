import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowRight, Boxes, LineChart, Receipt, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" />;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-gradient-emerald grid place-items-center text-primary-foreground font-display font-bold">T</div>
            <span className="font-display text-lg font-semibold">Teranga</span>
          </div>
          <Link to="/login" className="text-sm font-medium hover:text-accent transition-colors">Se connecter</Link>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pattern-kente opacity-60" />
        <div className="relative mx-auto max-w-6xl px-6 py-24 lg:py-32">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-medium text-gold-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-gold" /> Fait pour les commerçants sénégalais
            </span>
            <h1 className="mt-6 font-display text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl">
              Gérez votre boutique <span className="text-accent">en toute simplicité</span>.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              Suivez votre stock, enregistrez vos ventes, contrôlez vos dépenses. Tout en FCFA, sur mobile comme sur ordinateur.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-emerald px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-glow transition-transform hover:-translate-y-0.5"
              >
                Commencer gratuitement <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#features" className="inline-flex items-center rounded-xl border border-border bg-card px-6 py-3.5 text-sm font-semibold hover:bg-muted transition-colors">
                Découvrir
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Boxes, title: "Inventaire", desc: "Produits, prix, alertes de stock bas." },
            { icon: Receipt, title: "Ventes", desc: "Enregistrez chaque vente en un clic." },
            { icon: LineChart, title: "Tableau de bord", desc: "Chiffre d'affaires et bénéfice du jour." },
            { icon: ShieldCheck, title: "Sécurisé", desc: "Vos données protégées et privées." },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border border-border/60 bg-card p-6 shadow-soft transition-shadow hover:shadow-glow">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-gold text-gold-foreground">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border/60 py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Teranga · Dakar, Sénégal
      </footer>
    </div>
  );
}
