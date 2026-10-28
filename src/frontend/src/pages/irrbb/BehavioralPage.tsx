import { useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { CodeSnippet } from "../../components/CodeSnippet";
import { Callout, Formula, Lab, Legend, NumField, SelectField, Stat } from "../../components/ui";
import { fmtNum, fmtPct } from "../../format";

type Segment = "retail_transactional" | "retail_non_transactional" | "wholesale";
type Assumption = "contratual" | "estática" | "dinâmica";
type Resp = {
  base: Record<Assumption, { pv_loans: number; pv_deposits: number; pv_cdb: number; eve: number; cpr: number }>;
  profile: ({ shock_bps: number } & Record<string, number>)[];
  nmd: { core_share: number; avg_maturity: number; months: number; by_year: number[]; duration_behavioral: number; caps: { core_share: number; avg_maturity: number } };
  loans: { duration_contract: number; duration_static: number; by_year_contract: number[]; by_year_static: number[] };
};

const ASSUMPTIONS: { key: Assumption; label: string; color: string }[] = [
  { key: "contratual", label: "Contratual (sem pré-pagamento nem resgate, depósito vence amanhã)", color: "var(--series-1)" },
  { key: "estática", label: "Comportamental, pré-pagamento e resgate constantes", color: "var(--series-2)" },
  { key: "dinâmica", label: "Comportamental, pré-pagamento e resgate sensíveis aos juros", color: "var(--series-3)" },
];
const SEGMENT_LABEL: Record<Segment, string> = {
  retail_transactional: "Varejo transacional", retail_non_transactional: "Varejo não transacional", wholesale: "Atacado",
};

export default function BehavioralPage() {
  return (
    <>
      <h1>IRRBB: modelagem comportamental</h1>
      <p className="lead">
        O <Link to="/irrbb">ΔEVE e o ΔNII</Link> dependem de <em>quando</em> cada fluxo acontece. Para depósitos sem vencimento
        e créditos que podem ser quitados antes, o prazo contratual é uma ficção — e a premissa comportamental muda o risco
        de juros do banco inteiro.
      </p>

      <h2>1. Depósitos sem vencimento (NMD)</h2>
      <p>
        Um depósito à vista pode, em tese, sair amanhã. Na prática, boa parte do saldo fica por anos. Divide-se o saldo em
        uma parte <strong>volátil</strong> (que vence no dia seguinte) e um <strong>núcleo estável</strong>, distribuído no tempo
        com um prazo médio estimado a partir do histórico. Basileia (BCBS d368) limita o quanto pode ser núcleo e o prazo médio:
      </p>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Segmento</th><th className="num">Máximo como núcleo</th><th className="num">Prazo médio máximo do núcleo</th></tr></thead>
          <tbody>
            <tr><td>Varejo transacional</td><td className="num">90%</td><td className="num">5 anos</td></tr>
            <tr><td>Varejo não transacional</td><td className="num">70%</td><td className="num">4,5 anos</td></tr>
            <tr><td>Atacado</td><td className="num">50%</td><td className="num">4 anos</td></tr>
          </tbody>
        </table>
      </div>
      <Formula tex={String.raw`F_1 = (1 - c)\,D + \frac{c\,D}{T}, \qquad F_k = \frac{c\,D}{T}\ \ (k = 2, \dots, T), \qquad T = 2\,\bar m`} where={[[String.raw`D`, "saldo do depósito"], [String.raw`c`, "fração tratada como núcleo (limitada pelo segmento)"], [String.raw`F_k`, "saída no mês k"], [String.raw`T`, "número de meses da amortização linear do núcleo"], [String.raw`\bar m`, "prazo médio do núcleo — numa amortização linear, metade de T"]]} />
      <CodeSnippet name="nmd_cash_flows" />

      <h2>2. Pré-pagamento de crédito</h2>
      <p>
        Um crédito prefixado de 5 anos raramente dura 5 anos: parte dos clientes quita antes. Mede-se isso pela taxa anual de
        pré-pagamento (CPR), aplicada mês a mês ao saldo:
      </p>
      <Formula tex={String.raw`\text{SMM} = 1 - (1 - \text{CPR})^{1/12}, \qquad \text{CPR}(r) = \text{CPR}_0 + \beta\cdot\max(K - r,\ 0)`} where={[[String.raw`\text{SMM}`, "fração do saldo quitada antecipadamente em cada mês"], [String.raw`\text{CPR}_0`, "pré-pagamento estrutural (mudança, venda do bem, sobra de caixa)"], [String.raw`K`, "taxa do contrato"], [String.raw`r`, "taxa de mercado: abaixo de K, vale a pena refinanciar"], [String.raw`\beta`, "sensibilidade: pontos de CPR por ponto de incentivo"]]} />
      <p>
        Quando o pré-pagamento depende dos juros, o banco está <strong>vendido numa opção</strong>: se os juros caem, o cliente
        quita e o banco reaplica a uma taxa menor; se sobem, ninguém quita. É a <strong>convexidade negativa</strong> — perde-se
        nos dois sentidos em relação ao modelo linear.
      </p>
      <CodeSnippet name="prepayment_rate" />
      <CodeSnippet name="loan_cash_flows" caption="crédito Price com pré-pagamento" />

      <h2>3. Resgate antecipado: a opção do lado do passivo</h2>
      <p>
        Um CDB com liquidez diária é um depósito a prazo com uma opção de venda para o cliente: ele pode resgatar a qualquer
        momento pelo valor corrigido. Quando os juros sobem acima da taxa do CDB, resgatar e reaplicar mais caro passa a
        valer a pena — justamente quando o banco gostaria de manter o funding barato.
      </p>
      <Formula tex={String.raw`\text{resgate}(r) = \rho_0 + \gamma\cdot\max(r - K_{\text{CDB}},\ 0)`} where={[[String.raw`\rho_0`, "resgate anual estrutural (necessidade de caixa do cliente)"], [String.raw`K_{\text{CDB}}`, "taxa do CDB"], [String.raw`r`, "taxa de mercado"], [String.raw`\gamma`, "sensibilidade: pontos de resgate por ponto de incentivo"]]} />
      <p>
        As duas opções vão contra o banco: o crédito encurta quando os juros caem e o passivo encurta quando sobem. É a
        opcionalidade que o BCBS pede para capturar com choques aplicados também às premissas comportamentais.
      </p>
      <CodeSnippet name="redemption_rate" />
      <CodeSnippet name="cdb_cash_flows" caption="CDB com resgate antecipado" />

      <h2>4. Laboratório</h2>
      <BehavioralLab />
      <Callout title="O que observar">
        <ul>
          <li>Tratar o depósito como “vence amanhã” superestima o descasamento: o banco parece muito mais exposto a alta de juros do que é.</li>
          <li>Com o núcleo modelado, o depósito vira um passivo de prazo médio parecido com o do crédito, e o ΔEVE encolhe.</li>
          <li>Com pré-pagamento sensível aos juros, a curva de ΔEVE fica negativa nos dois lados: é a opção vendida ao cliente.</li>
          <li>Aumente a sensibilidade do resgate do CDB: a perda com alta de juros cresce, porque o passivo barato vai embora quando mais se precisa dele.</li>
          <li>Troque o segmento para atacado: o teto de 50% como núcleo encurta o depósito e o ΔEVE volta a crescer.</li>
          <li>Essas premissas são as mais discutidas com o supervisor — pequenas mudanças no prazo do núcleo mudam muito o ΔEVE e o teste de outlier.</li>
        </ul>
      </Callout>
    </>
  );
}

function BehavioralLab() {
  const [p, setP] = useState({
    market_rate: 0.14, loan_balance: 1000, loan_rate: 0.18, loan_months: 60, base_cpr: 0.08, cpr_sensitivity: 0.03,
    nmd_balance: 600, nmd_segment: "retail_transactional" as Segment, stable_share: 0.8, core_share: 1.0, nmd_avg_maturity: 3,
    cdb_balance: 300, cdb_rate: 0.145, cdb_months: 24, cdb_redemption_base: 0.05, cdb_redemption_sensitivity: 0.08,
  });
  const set = <K extends keyof typeof p>(k: K) => (v: (typeof p)[K]) => setP({ ...p, [k]: v });
  const { data, error } = useCompute<Resp>("/irrbb/behavioral", p, 250);
  const years = data ? Math.max(data.nmd.by_year.length, data.loans.by_year_contract.length) : 0;
  const flows = data ? Array.from({ length: years }, (_, i) => ({
    year: `${i + 1}º ano`, deposits: data.nmd.by_year[i] ?? 0,
    loans_contract: data.loans.by_year_contract[i] ?? 0, loans_static: data.loans.by_year_static[i] ?? 0,
  })) : [];

  return (
    <Lab title="Balanço com premissas contratuais × comportamentais (R$ milhões)">
      <h3 style={{ marginTop: 0 }}>Crédito prefixado (Price)</h3>
      <div className="grid">
        <NumField label="Saldo" value={p.loan_balance} onChange={set("loan_balance")} step={100} />
        <NumField label="Taxa do contrato" percent value={p.loan_rate} onChange={set("loan_rate")} step={0.5} />
        <NumField label="Prazo (meses)" value={p.loan_months} onChange={set("loan_months")} step={12} min={6} max={360} />
        <NumField label="CPR estrutural" percent value={p.base_cpr} onChange={set("base_cpr")} step={1} />
        <NumField label="Sensibilidade do CPR (β)" value={p.cpr_sensitivity} onChange={set("cpr_sensitivity")} step={0.01} hint="por ponto de incentivo" />
      </div>
      <h3>Depósitos à vista</h3>
      <div className="grid">
        <NumField label="Saldo" value={p.nmd_balance} onChange={set("nmd_balance")} step={100} />
        <SelectField label="Segmento" value={p.nmd_segment} onChange={set("nmd_segment")} options={Object.entries(SEGMENT_LABEL) as [Segment, string][]} />
        <NumField label="Parte estável" percent value={p.stable_share} onChange={set("stable_share")} step={5} />
        <NumField label="Prazo médio do núcleo (anos)" value={p.nmd_avg_maturity} onChange={set("nmd_avg_maturity")} step={0.5} min={0.5} max={10} />
      </div>
      <h3>CDB e mercado</h3>
      <div className="grid">
        <NumField label="CDB prefixado (saldo)" value={p.cdb_balance} onChange={set("cdb_balance")} step={50} />
        <NumField label="Taxa do CDB" percent value={p.cdb_rate} onChange={set("cdb_rate")} step={0.25} />
        <NumField label="Prazo do CDB (meses)" value={p.cdb_months} onChange={set("cdb_months")} step={6} min={1} />
        <NumField label="Resgate antecipado estrutural" percent value={p.cdb_redemption_base} onChange={set("cdb_redemption_base")} step={1} />
        <NumField label="Sensibilidade do resgate (γ)" value={p.cdb_redemption_sensitivity} onChange={set("cdb_redemption_sensitivity")} step={0.01} hint="por ponto de incentivo" />
        <NumField label="Taxa de mercado" percent value={p.market_rate} onChange={set("market_rate")} step={0.25} />
      </div>
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <div className="stats">
            <Stat label="Núcleo do depósito" value={fmtPct(data.nmd.core_share, 0)} sub={`teto do segmento: ${fmtPct(data.nmd.caps.core_share, 0)}`} />
            <Stat label="Prazo médio do núcleo" value={`${fmtNum(data.nmd.avg_maturity, 1)} anos`} sub={`teto: ${fmtNum(data.nmd.caps.avg_maturity, 1)} anos`} />
            <Stat label="Duration do depósito" value={`${fmtNum(data.nmd.duration_behavioral, 2)} anos`} sub="contratual: ~0" />
            <Stat label="Duration do crédito" value={`${fmtNum(data.loans.duration_static, 2)} anos`} sub={`sem pré-pagamento: ${fmtNum(data.loans.duration_contract, 2)} anos`} />
          </div>
          <div className="chart-title">Fluxos por ano: depósito comportamental e crédito com e sem pré-pagamento</div>
          <Legend items={[
            { label: "Saída do depósito (comportamental)", color: "var(--series-1)", box: true },
            { label: "Crédito sem pré-pagamento", color: "var(--series-2)", box: true },
            { label: "Crédito com CPR estrutural", color: "var(--series-3)", box: true },
          ]} />
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={flows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }} barGap={2}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="year" {...axisProps} />
              <YAxis {...axisProps} width={44} />
              <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload }) =>
                active && payload?.length ? <TooltipBox title={payload[0].payload.year} rows={[
                  { label: "Depósito", value: fmtNum(payload[0].payload.deposits, 1), color: "var(--series-1)" },
                  { label: "Crédito contratual", value: fmtNum(payload[0].payload.loans_contract, 1), color: "var(--series-2)" },
                  { label: "Crédito com CPR", value: fmtNum(payload[0].payload.loans_static, 1), color: "var(--series-3)" },
                ]} /> : null} />
              <Bar dataKey="deposits" fill="var(--series-1)" radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
              <Bar dataKey="loans_contract" fill="var(--series-2)" radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
              <Bar dataKey="loans_static" fill="var(--series-3)" radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>

          <div className="chart-title" style={{ marginTop: 16 }}>ΔEVE do balanço por choque paralelo, em cada premissa</div>
          <div className="chart-sub">Mesmo balanço; só mudam as premissas de prazo. Ativos: crédito. Passivos: depósitos e CDB.</div>
          <Legend items={ASSUMPTIONS.map((a) => ({ label: a.label, color: a.color }))} />
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.profile} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="shock_bps" type="number" domain={[-300, 300]} ticks={[-300, -200, -100, 0, 100, 200, 300]} tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}`} {...axisProps} />
              <YAxis {...axisProps} width={48} />
              <ReferenceLine y={0} stroke="var(--axis)" />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return <TooltipBox title={`Choque ${d.shock_bps > 0 ? "+" : ""}${d.shock_bps} bps`}
                  rows={ASSUMPTIONS.map((a) => ({ label: a.key, value: fmtNum(d[`delta_${a.key}`], 1), color: a.color }))} />;
              }} />
              {ASSUMPTIONS.map((a) => (
                <Line key={a.key} dataKey={`delta_${a.key}`} stroke={a.color} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="data">
              <thead><tr><th>Premissa</th><th className="num">EVE base</th><th className="num">ΔEVE −200 bps</th><th className="num">ΔEVE +200 bps</th></tr></thead>
              <tbody>
                {ASSUMPTIONS.map((a) => {
                  const down = data.profile.find((x) => x.shock_bps === -200)!;
                  const up = data.profile.find((x) => x.shock_bps === 200)!;
                  return (
                    <tr key={a.key}><td>{a.label}</td><td className="num">{fmtNum(data.base[a.key].eve, 1)}</td>
                      <td className="num">{fmtNum(down[`delta_${a.key}`], 1)}</td><td className="num">{fmtNum(up[`delta_${a.key}`], 1)}</td></tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Lab>
  );
}
