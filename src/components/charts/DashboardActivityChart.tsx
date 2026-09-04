import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatFCFA } from "@/lib/format";

type Day = { date: string; ventes: number; depenses: number };

export default function DashboardActivityChart({ days }: { days: Day[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={days}>
        <defs>
          <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.55 0.13 165)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="oklch(0.55 0.13 165)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.78 0.13 85)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="oklch(0.78 0.13 85)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.88 0.02 110)" />
        <XAxis dataKey="date" fontSize={11} stroke="oklch(0.48 0.03 160)" />
        <YAxis fontSize={11} stroke="oklch(0.48 0.03 160)" tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
        <Tooltip
          contentStyle={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.88 0.02 110)", borderRadius: 12, fontSize: 12 }}
          formatter={(v: number) => formatFCFA(v)}
        />
        <Area type="monotone" dataKey="ventes" stroke="oklch(0.45 0.11 165)" strokeWidth={2} fill="url(#g1)" />
        <Area type="monotone" dataKey="depenses" stroke="oklch(0.68 0.15 70)" strokeWidth={2} fill="url(#g2)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
