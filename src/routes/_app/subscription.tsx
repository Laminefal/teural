import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Crown, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { formatFCFA, formatDate } from "@/lib/format";
import { confirmPaymentSent, requestSubscriptionPayment, getSubscription } from "@/lib/subscription.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/subscription")({
  component: SubscriptionPage,
  validateSearch: (s: Record<string, unknown>) => ({
    status: typeof s.status === "string" ? (s.status as "success" | "cancelled") : undefined,
  }),
});

const BENEFITS = [
  "Gestion de stock illimitée",
  "Suivi des ventes en temps réel",
  "Alertes stock bas par SMS",
  "Export des rapports de vente",
  "Support prioritaire WhatsApp",
  "Accès à l'aide au crédit (microfinance)",
];

const ORANGE_MONEY_NUMBER = "+221 78 381 93 49";

type Plan = "monthly" | "yearly";
type Method = "orange-money-senegal" | "wave-senegal";

function SubscriptionPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getSub = useServerFn(getSubscription);
  const requestPayment = useServerFn(requestSubscriptionPayment);
  const confirmSent = useServerFn(confirmPaymentSent);

  const { data: sub, isLoading } = useQuery({
    queryKey: ["subscription"],
    queryFn: () => getSub(),
  });

  const [plan, setPlan] = useState<Plan | null>(null);
  const [method, setMethod] = useState<Method>("orange-money-senegal");
  const [omInfo, setOmInfo] = useState<{ paymentId: string; amount: number } | null>(null);

  useEffect(() => {
    if (search.status === "success") {
      toast.success("Paiement reçu. Mise à jour de votre statut en cours…");
      qc.invalidateQueries({ queryKey: ["subscription"] });
      qc.invalidateQueries({ queryKey: ["role-subscription"] });
      navigate({ to: "/subscription", search: { status: undefined }, replace: true });
    } else if (search.status === "cancelled") {
      toast.error("Paiement annulé.");
      navigate({ to: "/subscription", search: { status: undefined }, replace: true });
    }
  }, [search.status, navigate, qc]);

  const mut = useMutation({
    mutationFn: (vars: { plan: Plan; method: Method }) =>
      requestPayment({ data: { plan: vars.plan, paymentMethod: vars.method } }),
    onSuccess: (res) => {
      if (res.redirectUrl) {
        window.location.href = res.redirectUrl;
      } else if (res.instructions) {
        setOmInfo({ paymentId: res.paymentId, amount: res.instructions.amount });
        setPlan(null);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmMut = useMutation({
    mutationFn: (paymentId: string) => confirmSent({ data: { paymentId } }),
    onSuccess: () => {
      toast.success("Merci ! Votre paiement sera validé sous peu par notre équipe.");
      setOmInfo(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isActive = sub?.subscription_status === "monthly" || sub?.subscription_status === "yearly";
  const expiresAt = sub?.subscription_expires_at ? new Date(sub.subscription_expires_at) : null;
  const trialEndsAt = sub?.trial_ends_at ? new Date(sub.trial_ends_at) : null;
  const trialActive = !isActive && trialEndsAt && trialEndsAt > new Date();

  return (
    <div className="space-y-6">
      <PageHeader title="Abonnement" subtitle="Choisissez l'offre adaptée à votre boutique" />

      {isLoading ? (
        <div className="grid place-items-center py-12"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
      ) : (
        <>
          <Card className="p-5 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "h-10 w-10 rounded-full grid place-items-center",
                isActive ? "bg-gradient-gold text-gold-foreground" : "bg-muted text-muted-foreground",
              )}>
                <Crown className="h-5 w-5" />
              </div>
              <div>
                <div className="font-medium">
                  {isActive ? `Compte abonné (${sub?.subscription_status === "yearly" ? "annuel" : "mensuel"})` :
                   trialActive ? "Période d'essai gratuit" : "Compte expiré"}
                </div>
                <div className="text-sm text-muted-foreground">
                  {isActive && expiresAt && `Actif jusqu'au ${formatDate(expiresAt)}`}
                  {!isActive && trialActive && trialEndsAt && `Essai jusqu'au ${formatDate(trialEndsAt)}`}
                  {!isActive && !trialActive && "Abonnez-vous pour continuer à utiliser Teranga"}
                </div>
              </div>
            </div>
            {isActive && <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">Actif</Badge>}
          </Card>

          <div className="grid md:grid-cols-2 gap-5">
            <PlanCard
              title="Mensuel"
              price={15000}
              suffix="/ mois"
              onSubscribe={() => setPlan("monthly")}
            />
            <PlanCard
              title="Annuel"
              price={150000}
              suffix="/ an"
              highlight
              note="Soit 12 500 FCFA / mois — économisez 30 000 FCFA"
              onSubscribe={() => setPlan("yearly")}
            />
          </div>
        </>
      )}

      {/* Dialogue : choix du mode de paiement */}
      <Dialog open={!!plan} onOpenChange={(o) => !o && setPlan(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choisir le mode de paiement</DialogTitle>
            <DialogDescription>
              {plan === "monthly" ? "15 000 FCFA / mois" : "150 000 FCFA / an"}
            </DialogDescription>
          </DialogHeader>
          <RadioGroup value={method} onValueChange={(v) => setMethod(v as Method)} className="gap-3 py-2">
            <label className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-accent/30">
              <RadioGroupItem value="orange-money-senegal" id="om" />
              <Label htmlFor="om" className="cursor-pointer flex-1">
                <div className="font-medium">Orange Money</div>
                <div className="text-xs text-muted-foreground">Paiement vers notre numéro Orange Money</div>
              </Label>
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-accent/30">
              <RadioGroupItem value="wave-senegal" id="wave" />
              <Label htmlFor="wave" className="cursor-pointer flex-1">
                <div className="font-medium">Wave</div>
                <div className="text-xs text-muted-foreground">Redirection vers le lien de paiement Wave</div>
              </Label>
            </label>
          </RadioGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlan(null)}>Annuler</Button>
            <Button
              disabled={mut.isPending}
              onClick={() => plan && mut.mutate({ plan, method })}
            >
              {mut.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Patientez…</>
                : method === "wave-senegal" ? "Continuer vers Wave" : "Voir les instructions Orange Money"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialogue : instructions Orange Money */}
      <Dialog open={!!omInfo} onOpenChange={(o) => !o && setOmInfo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Paiement Orange Money</DialogTitle>
            <DialogDescription>
              Suivez les étapes ci-dessous pour effectuer votre paiement.
            </DialogDescription>
          </DialogHeader>
          {omInfo && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-border p-4 space-y-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Montant à envoyer</div>
                  <div className="font-display text-2xl font-bold">{formatFCFA(omInfo.amount)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Numéro Orange Money</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-lg font-semibold">{ORANGE_MONEY_NUMBER}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(ORANGE_MONEY_NUMBER);
                        toast.success("Numéro copié");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <ol className="text-sm space-y-2 list-decimal list-inside text-muted-foreground">
                <li>Composez <span className="font-mono text-foreground">#144#</span> sur votre téléphone Orange.</li>
                <li>Choisissez « Transfert d'argent » puis envoyez le montant au numéro ci-dessus.</li>
                <li>Une fois le transfert effectué, cliquez sur « J'ai payé » ci-dessous.</li>
                <li>Notre équipe vérifie et active votre abonnement sous 24h.</li>
              </ol>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOmInfo(null)}>Fermer</Button>
            <Button
              disabled={confirmMut.isPending}
              onClick={() => omInfo && confirmMut.mutate(omInfo.paymentId)}
            >
              {confirmMut.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Envoi…</> : "J'ai payé"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PlanCard({
  title, price, suffix, onSubscribe, highlight, note,
}: { title: string; price: number; suffix: string; onSubscribe: () => void; highlight?: boolean; note?: string }) {
  return (
    <Card className={cn(
      "p-6 flex flex-col gap-5 relative overflow-hidden",
      highlight && "border-accent/60 shadow-soft",
    )}>
      {highlight && (
        <div className="absolute top-3 right-3 inline-flex items-center gap-1 text-xs font-medium bg-gradient-gold text-gold-foreground px-2 py-1 rounded-full">
          <Sparkles className="h-3 w-3" /> Recommandé
        </div>
      )}
      <div>
        <div className="text-sm uppercase tracking-wide text-muted-foreground">{title}</div>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="font-display text-3xl font-bold">{formatFCFA(price)}</span>
          <span className="text-muted-foreground text-sm">{suffix}</span>
        </div>
        {note && <p className="mt-1 text-sm text-accent font-medium">{note}</p>}
      </div>
      <ul className="space-y-2 text-sm">
        {BENEFITS.map((b) => (
          <li key={b} className="flex items-start gap-2">
            <Check className="h-4 w-4 mt-0.5 text-emerald-600 shrink-0" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <Button onClick={onSubscribe} className="mt-auto" variant={highlight ? "default" : "outline"}>
        S'abonner
      </Button>
    </Card>
  );
}
