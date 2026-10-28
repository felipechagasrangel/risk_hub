import { useState } from "react";
import { Link } from "react-router-dom";
import { Bar, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { CodeSnippet } from "../../components/CodeSnippet";
import { EditableTable } from "../../components/EditableTable";
import { Callout, Formula, Lab, Legend, NumField, Stat } from "../../components/ui";
import { fmtNum, fmtPct } from "../../format";

type GapRow = { name: string; kind: "in" | "out"; stress: number; base_rollover: number } & Record<`b${number}`, number>;
type Product = { name: string; side: "asset" | "liability"; amount: number; term: number; client_rate: number };
type Premium = { term: number; bps: number };
type Resp = {
  buckets: string[];
  gap: { bucket: string; inflow_base: number; outflow_base: number; cum_base: number; inflow_stress: number; outflow_stress: number; cum_stress: number }[];
  survival_base: number | null; survival_stress: number | null;
  products: (Product & { ftp_rate: number; liquidity_premium: number; margin: number; annual_margin: number })[];
  business_margin: number; treasury_margin: number;
  premium_curve: Premium[];
};

const BUCKET_SHORT = ["1d", "1–30d", "1–3m", "3–6m", "6–12m", "1–2a", "2–5a", "5a+"];
const mi = (v: number) => `${fmtNum(v, 0)} mi`;
const row = (name: string, kind: "in" | "out", stress: number, base_rollover: number, amounts: number[]): GapRow =>
  ({ name, kind, stress, base_rollover, ...Object.fromEntries(amounts.map((a, i) => [`b${i}`, a])) } as GapRow);

export default function LiquidityGapPage() {
  return (
    <>
      <h1>Gap de liquidez e preço de transferência (FTP)</h1>
      <p className="lead">
        O LCR e o NSFR são fotografias regulatórias. Na gestão do dia a dia, a tesouraria olha o caixa faixa a faixa,
        testa quanto tempo o banco aguenta sem acesso a mercado e cobra das áreas de negócio o custo do funding que elas
        consomem.
      </p>

      <h2>1. O gap de liquidez</h2>
      <p>
        Distribuem-se as entradas e saídas de caixa por faixas de prazo — contratuais ou comportamentais — e acumula-se o
        saldo, partindo do colchão de ativos líquidos:
      </p>
      <Formula tex={String.raw`\text{Caixa}(k) = \text{Colchão} + \sum_{j \le k}\big(E_j - S_j\big), \qquad S_j^{\text{estresse}} = \sum_i s_i\,F_{i,j}, \qquad E_j^{\text{estresse}} = \sum_i e_i\,F_{i,j}`} where={[[String.raw`k`, "faixa de prazo (até 1 dia, 1–30 dias, …, acima de 5 anos)"], [String.raw`E_j,\ S_j`, "entradas e saídas de caixa na faixa j"], [String.raw`F_{i,j}`, "fluxo contratual do item i na faixa j"], [String.raw`s_i`, "fração que sai no estresse (o que não é renovado)"], [String.raw`e_i`, "fração das entradas que de fato chega no estresse"], [String.raw`\text{Colchão}`, "ativos líquidos, com haircut no estresse"]]} />
      <p>
        O <strong>horizonte de sobrevivência</strong> é o prazo até o caixa acumulado ficar negativo no cenário de estresse.
        É a métrica central do apetite a risco de liquidez: o banco define quantos dias quer aguentar sem captar.
      </p>
      <CodeSnippet name="liquidity_gap" />
      <CodeSnippet name="survival_horizon" />

      <h2>2. FTP: quem paga pelo funding</h2>
      <p>
        A tesouraria funciona como um banco dentro do banco: “compra” os recursos captados pelas agências e “vende” para as
        áreas que emprestam. A taxa de transferência é a curva base do prazo mais um <strong>prêmio de liquidez</strong> que
        cresce com o prazo — porque prender recursos por mais tempo custa mais.
      </p>
      <Formula tex={String.raw`\text{FTP}(T) = r_{\text{base}}(T) + \text{PL}(T), \qquad \text{margem}^{\text{ativo}} = r_{\text{cliente}} - \text{FTP}, \qquad \text{margem}^{\text{passivo}} = \text{FTP} - r_{\text{cliente}}`} where={[[String.raw`T`, "prazo de liquidez do produto: contratual, ou comportamental para depósitos à vista"], [String.raw`r_{\text{base}}`, "curva base (CDI/pré) do prazo"], [String.raw`\text{PL}(T)`, "prêmio de liquidez do prazo"], [String.raw`r_{\text{cliente}}`, "taxa cobrada do cliente (crédito) ou paga a ele (captação)"]]} />
      <ul>
        <li>O crédito longo paga um FTP alto; o depósito estável recebe um FTP alto — e por isso vale a pena captá-lo.</li>
        <li>O resultado da tesouraria é o descasamento: ela assume o risco de juros e de liquidez entre o que cobra e o que paga.</li>
        <li>O prazo usado para o depósito à vista vem da <Link to="/irrbb/comportamental">modelagem comportamental</Link>.</li>
      </ul>
      <CodeSnippet name="ftp" />

      <h2>3. Laboratório</h2>
      <GapLab />
      <Callout title="O que observar">
        <ul>
          <li>No cenário base, as renovações sustentam o caixa; no estresse, os CDBs não são renovados e o caixa cai.</li>
          <li>Reduza o colchão para 900: o horizonte de sobrevivência despenca para algumas semanas.</li>
          <li>Os depósitos à vista ganham FTP de quase 15% mesmo sem pagar juros ao cliente: é a captação mais valiosa do banco.</li>
          <li>Suba o prêmio de liquidez dos prazos longos: a margem do consignado cai e a da captação longa sobe.</li>
        </ul>
      </Callout>
    </>
  );
}

function GapLab() {
  const [items, setItems] = useState<GapRow[]>([
    row("CDB vencendo", "out", 0.8, 0.85, [0, 400, 600, 700, 900, 800, 600, 0]),
    row("Depósitos à vista (parte volátil)", "out", 1.0, 0, [120, 0, 0, 0, 0, 0, 0, 0]),
    row("Corrida de depósitos à vista", "out", 1.0, 1.0, [0, 300, 0, 0, 0, 0, 0, 0]),
    row("Interbancário captado", "out", 1.0, 0.9, [200, 300, 0, 0, 0, 0, 0, 0]),
    row("Crédito vencendo", "in", 0.6, 0, [0, 350, 600, 700, 1000, 1100, 1500, 600]),
    row("Títulos vencendo", "in", 1.0, 0, [0, 0, 200, 0, 300, 0, 400, 0]),
  ]);
  const [buffer, setBuffer] = useState(1200);
  const [haircut, setHaircut] = useState(0.1);
  const [baseRate, setBaseRate] = useState(0.14);
  const [premium, setPremium] = useState<Premium[]>([
    { term: 0, bps: 0 }, { term: 0.5, bps: 20 }, { term: 1, bps: 40 }, { term: 2, bps: 70 },
    { term: 3, bps: 90 }, { term: 5, bps: 120 }, { term: 10, bps: 150 },
  ]);
  const [products, setProducts] = useState<Product[]>([
    { name: "Consignado", side: "asset", amount: 2000, term: 2.5, client_rate: 0.22 },
    { name: "Capital de giro (CDI)", side: "asset", amount: 1500, term: 0.5, client_rate: 0.17 },
    { name: "CDB 2 anos", side: "liability", amount: 1800, term: 2, client_rate: 0.145 },
    { name: "Depósitos à vista", side: "liability", amount: 600, term: 2.5, client_rate: 0.0 },
  ]);
  const body = {
    buffer, buffer_haircut: haircut, base_rate: baseRate, premium_curve: premium, products,
    items: items.map((r) => ({ name: r.name, kind: r.kind, stress: r.stress, base_rollover: r.base_rollover, amounts: BUCKET_SHORT.map((_, i) => r[`b${i}`]) })),
  };
  const { data, error } = useCompute<Resp>("/liquidity/management", body, 250);
  const fmtDays = (d: number | null) => (d == null ? "sobrevive além de 10 anos" : `${fmtNum(d, 0)} dias`);

  return (
    <Lab title="Gap de liquidez com estresse e FTP (R$ milhões)">
      <div className="grid">
        <NumField label="Colchão de ativos líquidos" value={buffer} onChange={setBuffer} step={100} min={0} />
        <NumField label="Haircut do colchão no estresse" percent value={haircut} onChange={setHaircut} step={5} />
      </div>
      <p className="muted" style={{ fontSize: 13 }}>
        “Estresse”: para entradas, a fração recebida; para saídas, a fração que sai (não renovada). “Renovação normal”: fração das saídas renovada no cenário base.
      </p>
      <EditableTable<GapRow> rows={items} onChange={setItems}
        newRow={() => row("Novo item", "out", 1, 0, [0, 0, 0, 0, 0, 0, 0, 0])}
        columns={[
          { key: "name", label: "Item", type: "text", width: 190 },
          { key: "kind", label: "Tipo", type: "select", width: 90, options: [["in", "Entrada"], ["out", "Saída"]] },
          { key: "stress", label: "Estresse", type: "percent", width: 80 },
          { key: "base_rollover", label: "Renovação normal", type: "percent", width: 90 },
          ...BUCKET_SHORT.map((b, i) => ({ key: `b${i}` as const, label: b, type: "number" as const, width: 70 })),
        ]} />
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <div className="stats">
            <Stat label="Horizonte de sobrevivência — base" value={fmtDays(data.survival_base)} />
            <Stat label="Horizonte de sobrevivência — estresse" value={fmtDays(data.survival_stress)} />
            <Stat label="Caixa em 30 dias (estresse)" value={mi(data.gap[1].cum_stress)} />
          </div>
          <div className="chart-title">Caixa acumulado por faixa de prazo</div>
          <div className="chart-sub">Barras: fluxo líquido da faixa no estresse. Linhas: saldo acumulado nos dois cenários.</div>
          <Legend items={[
            { label: "Fluxo líquido no estresse", color: "var(--axis)", box: true },
            { label: "Acumulado — base", color: "var(--series-1)" },
            { label: "Acumulado — estresse", color: "var(--series-2)" },
          ]} />
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={data.gap.map((g, i) => ({ ...g, short: BUCKET_SHORT[i], net_stress: g.inflow_stress - g.outflow_stress }))} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="short" {...axisProps} />
              <YAxis {...axisProps} width={56} />
              <ReferenceLine y={0} stroke="var(--critical)" strokeDasharray="4 3" />
              <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return <TooltipBox title={d.bucket} rows={[
                  { label: "Entradas (estresse)", value: mi(d.inflow_stress) }, { label: "Saídas (estresse)", value: mi(d.outflow_stress) },
                  { label: "Acumulado base", value: mi(d.cum_base), color: "var(--series-1)" }, { label: "Acumulado estresse", value: mi(d.cum_stress), color: "var(--series-2)" },
                ]} />;
              }} />
              <Bar dataKey="net_stress" fill="var(--axis)" radius={4} maxBarSize={40} isAnimationActive={false} />
              <Line dataKey="cum_base" stroke="var(--series-1)" strokeWidth={2} isAnimationActive={false} />
              <Line dataKey="cum_stress" stroke="var(--series-2)" strokeWidth={2} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>

          <h3>FTP por produto</h3>
          <div className="grid">
            <NumField label="Curva base (CDI/pré)" percent value={baseRate} onChange={setBaseRate} step={0.25} />
          </div>
          <div className="grid-2" style={{ marginTop: 10 }}>
            <div>
              <EditableTable<Premium> rows={premium} onChange={setPremium} newRow={() => ({ term: 7, bps: 135 })}
                columns={[{ key: "term", label: "Prazo (anos)", type: "number" }, { key: "bps", label: "Prêmio (bps)", type: "number" }]} />
            </div>
            <div>
              <div className="chart-title">Curva de prêmio de liquidez</div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="term" type="number" domain={[0, "dataMax"]} tickFormatter={(v) => `${v}a`} {...axisProps} allowDuplicatedCategory={false} />
                  <YAxis {...axisProps} width={44} />
                  <Line data={data.premium_curve} dataKey="bps" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Scatter data={data.products.map((x) => ({ term: x.term, bps: x.liquidity_premium * 10_000 }))} dataKey="bps" fill="var(--series-2)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <EditableTable<Product> rows={products} onChange={setProducts}
            newRow={() => ({ name: "Novo produto", side: "asset", amount: 100, term: 1, client_rate: 0.18 })}
            columns={[
              { key: "name", label: "Produto", type: "text", width: 170 },
              { key: "side", label: "Lado", type: "select", width: 100, options: [["asset", "Ativo"], ["liability", "Passivo"]] },
              { key: "amount", label: "Saldo", type: "number", width: 90 },
              { key: "term", label: "Prazo (anos)", type: "number", width: 90 },
              { key: "client_rate", label: "Taxa cliente", type: "percent", width: 90 },
            ]}
            computed={data.products.length === products.length ? [
              { label: "FTP", values: data.products.map((x) => fmtPct(x.ftp_rate, 2)) },
              { label: "Margem", values: data.products.map((x) => fmtPct(x.margin, 2)) },
              { label: "Margem/ano", values: data.products.map((x) => mi(x.annual_margin)) },
            ] : []} />
          <div className="stats">
            <Stat label="Margem das áreas de negócio" value={mi(data.business_margin)} sub="por ano" />
            <Stat label="Resultado de FTP da tesouraria" value={mi(data.treasury_margin)} sub="FTP cobrado − FTP pago, antes do funding externo" />
          </div>
        </>
      )}
    </Lab>
  );
}
