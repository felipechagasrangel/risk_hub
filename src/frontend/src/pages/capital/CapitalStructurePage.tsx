import { useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { CodeSnippet } from "../../components/CodeSnippet";
import { EditableTable } from "../../components/EditableTable";
import { Callout, Formula, Lab, NumField, PassBadge, RegNote, Stat } from "../../components/ui";
import { fmtNum, fmtPct } from "../../format";

type OffBalance = { name: string; amount: number; ccf: number };
type Resp = {
  cet1: { gross: number; cet1: number; steps: { label: string; value: number }[]; weighted_250: number; deducted: number };
  tier1: number; total_capital: number; rwa: number;
  ratios: { cet1: number; tier1: number; total: number };
  leverage: { on_balance: number; derivatives: number; sft: number; off_balance: number; total: number; ratio: number; minimum: number };
};

const mi = (v: number) => `${fmtNum(v, 0)} mi`;

export default function CapitalStructurePage() {
  return (
    <>
      <h1>Composição do capital e razão de alavancagem</h1>
      <p className="lead">
        O índice de Basileia divide o capital pelo RWA — mas de onde vem esse capital? E por que, além dele, existe uma
        segunda regra que ignora o risco? Esta página monta o Capital Principal a partir do balanço e calcula a razão
        de alavancagem.
      </p>

      <h2>1. As camadas do Patrimônio de Referência</h2>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Camada</th><th>O que entra</th><th>Absorve perdas</th></tr></thead>
          <tbody>
            <tr><td><strong>Capital Principal (CET1)</strong></td><td>Capital social, reservas, lucros retidos e ajustes de avaliação patrimonial, menos ajustes prudenciais</td><td>Sempre, com o banco funcionando</td></tr>
            <tr><td><strong>Capital Complementar (AT1)</strong></td><td>Instrumentos perpétuos, sem incentivo a resgate, com cláusula de conversão ou extinção</td><td>Com o banco funcionando, quando acionados</td></tr>
            <tr><td><strong>Nível II</strong></td><td>Dívida subordinada de longo prazo</td><td>Só na liquidação (gone concern)</td></tr>
          </tbody>
        </table>
      </div>

      <h2>2. Ajustes prudenciais: do patrimônio ao CET1</h2>
      <p>
        Nem todo patrimônio contábil absorve perdas numa crise. Os ajustes prudenciais (no Brasil, na Resolução CMN nº
        4.955/2021) retiram do CET1 os ativos que não valeriam nada num cenário de liquidação:
      </p>
      <ul>
        <li><strong>Dedução integral</strong>: ágio, intangíveis, créditos tributários de prejuízo fiscal, ativos atuariais de fundos de pensão, ações em tesouraria.</li>
        <li><strong>Dedução por limite</strong>: créditos tributários de diferenças temporárias e participações relevantes em instituições não consolidadas — só o que passa de <strong>10%</strong> do CET1 cada um, e de <strong>15%</strong> no conjunto. O que fica abaixo é ponderado a <strong>250%</strong> no RWA.</li>
      </ul>
      <Formula tex={String.raw`\text{CET1} = \text{PL elegível} - \sum \text{deduções integrais} - \max(\text{DTA} - 10\%\,B,\ 0) - \max(\text{PR}_{rel} - 10\%\,B,\ 0) - \text{excesso sobre }15\%`} where={[[String.raw`\text{PL elegível}`, "capital social + reservas + lucros retidos + ajustes de avaliação − ações em tesouraria"], [String.raw`B`, "base do limite: o CET1 depois das deduções integrais"], [String.raw`\text{DTA}`, "créditos tributários de diferenças temporárias"], [String.raw`\text{PR}_{rel}`, "participações relevantes em instituições financeiras não consolidadas"]]} />
      <CodeSnippet name="cet1_build" caption="o CET1 passo a passo" />

      <h2>3. Razão de alavancagem</h2>
      <p>
        O RWA depende de pesos de risco — que podem estar errados. A razão de alavancagem é um <strong>limite de segurança
        sem ponderação</strong>: o Nível I precisa ser pelo menos 3% de toda a exposição, inclusive a de fora do balanço.
      </p>
      <Formula tex={String.raw`\text{RA} = \frac{\text{Nível I}}{\text{ativos} - \text{deduções} + 1{,}4\,(\text{RC} + \text{PFE}) + \text{compromissadas} + \sum \text{CCF}_i\,F_i} \ \ge\ 3\%`} where={[[String.raw`\text{Nível I}`, "CET1 + AT1"], [String.raw`\text{ativos} - \text{deduções}`, "ativos do balanço, sem o que já foi deduzido do capital"], [String.raw`1{,}4\,(\text{RC} + \text{PFE})`, "exposição de derivativos pelo SA-CCR"], [String.raw`F_i,\ \text{CCF}_i`, "itens fora do balanço (limites, garantias) e o fator de conversão: 10% para limites canceláveis, até 100% para garantias"]]} />
      <p className="muted" style={{ fontSize: 14 }}>
        A exposição de derivativos vem do <Link to="/credito/sa-ccr">SA-CCR</Link>. A razão de alavancagem está na Resolução CMN nº
        4.615/2017 e é informada no DLO.
      </p>
      <CodeSnippet name="leverage_exposure" />

      <h2>4. Laboratório</h2>
      <StructureLab />
      <Callout title="O que observar">
        <ul>
          <li>Aumente os créditos tributários temporários: até 10% da base eles só pesam no RWA (250%); acima disso, saem direto do CET1.</li>
          <li>Uma aquisição com ágio grande reduz o CET1 na mesma medida — o ágio não absorve perdas.</li>
          <li>Aumente os ativos sem mudar o capital: o índice de Basileia pode continuar confortável (se os ativos têm FPR baixo, como títulos públicos), mas a RA cai. É para isso que ela existe.</li>
          <li>Limites de crédito canceláveis pesam pouco (CCF de 10%); garantias prestadas pesam inteiras.</li>
        </ul>
      </Callout>
      <RegNote>
        <p>
          PR, índices e razão de alavancagem são informados no <Link to="/cadocs#dlo">DLO (2061)</Link>. Composição do PR:
          Resolução CMN nº 4.955/2021; razão de alavancagem: Resolução CMN nº 4.615/2017. Simplificação: o limite agregado
          de 15% é aplicado sobre a mesma base do limite individual.
        </p>
      </RegNote>
    </>
  );
}

function StructureLab() {
  const [p, setP] = useState({
    share_capital: 800, reserves: 300, retained_earnings: 150, oci: -20, treasury_shares: 10,
    goodwill: 60, intangibles: 40, dta_tax_losses: 30, pension_assets: 5, other_deductions: 0,
    dta_temporary: 150, significant_investments: 70, at1: 100, tier2: 150, rwa_before_thresholds: 9000,
    total_assets: 18000, derivatives_rc: 150, derivatives_pfe: 250, sft: 600,
  });
  const [offBalance, setOffBalance] = useState<OffBalance[]>([
    { name: "Limites de cartão (canceláveis)", amount: 2000, ccf: 0.1 },
    { name: "Limites de crédito a empresas", amount: 1500, ccf: 0.4 },
    { name: "Fianças e garantias prestadas", amount: 800, ccf: 1.0 },
  ]);
  const set = (k: keyof typeof p) => (v: number) => setP({ ...p, [k]: v });
  const { data, error } = useCompute<Resp>("/capital/structure", { ...p, off_balance: offBalance }, 250);

  const field = (k: keyof typeof p, label: string, step = 10) => <NumField key={k} label={label} value={p[k]} onChange={set(k)} step={step} />;

  return (
    <Lab title="Do balanço ao CET1 e à razão de alavancagem (R$ milhões)">
      <h3 style={{ marginTop: 0 }}>Patrimônio</h3>
      <div className="grid">
        {field("share_capital", "Capital social")}{field("reserves", "Reservas")}{field("retained_earnings", "Lucros retidos")}
        {field("oci", "Ajustes de avaliação (ORA)")}{field("treasury_shares", "Ações em tesouraria")}
      </div>
      <h3>Deduções</h3>
      <div className="grid">
        {field("goodwill", "Ágio")}{field("intangibles", "Intangíveis")}{field("dta_tax_losses", "Créd. tributário de prejuízo fiscal")}
        {field("pension_assets", "Ativos atuariais")}{field("dta_temporary", "Créd. tributário temporário (limite)")}
        {field("significant_investments", "Participações relevantes (limite)")}
      </div>
      <h3>Outras camadas, RWA e exposição</h3>
      <div className="grid">
        {field("at1", "Capital complementar (AT1)")}{field("tier2", "Nível II")}{field("rwa_before_thresholds", "RWA (antes dos 250%)", 500)}
        {field("total_assets", "Ativo total", 500)}{field("derivatives_rc", "Derivativos: RC")}{field("derivatives_pfe", "Derivativos: PFE")}
        {field("sft", "Compromissadas")}
      </div>
      <div style={{ marginTop: 12 }}>
        <EditableTable<OffBalance> rows={offBalance} onChange={setOffBalance}
          newRow={() => ({ name: "Novo item", amount: 100, ccf: 0.5 })}
          columns={[{ key: "name", label: "Fora do balanço", type: "text" }, { key: "amount", label: "Valor", type: "number", width: 110 }, { key: "ccf", label: "CCF", type: "percent", width: 90 }]} />
      </div>
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <div className="stats">
            <Stat label="CET1" value={mi(data.cet1.cet1)} sub={`${fmtPct(data.ratios.cet1, 2)} do RWA`} />
            <Stat label="Nível I" value={mi(data.tier1)} sub={`${fmtPct(data.ratios.tier1, 2)} do RWA`} />
            <Stat label="PR" value={mi(data.total_capital)} sub={`${fmtPct(data.ratios.total, 2)} do RWA`} />
            <Stat label="RWA" value={mi(data.rwa)} sub={`inclui ${mi(data.cet1.weighted_250 * 2.5)} de itens a 250%`} />
            <Stat label="Razão de alavancagem" value={fmtPct(data.leverage.ratio, 2)}
              sub={<PassBadge ok={data.leverage.ratio >= data.leverage.minimum} label="mínimo 3%" />} />
          </div>
          <div className="chart-title">Do patrimônio líquido ao CET1</div>
          <ResponsiveContainer width="100%" height={60 + data.cet1.steps.length * 34}>
            <BarChart data={[...data.cet1.steps, { label: "Capital Principal (CET1)", value: data.cet1.cet1 }]} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
              <CartesianGrid {...gridProps} vertical horizontal={false} />
              <XAxis type="number" {...axisProps} />
              <YAxis type="category" dataKey="label" {...axisProps} width={250} />
              <ReferenceLine x={0} stroke="var(--axis)" />
              <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload }) =>
                active && payload?.length ? <TooltipBox title={payload[0].payload.label} rows={[{ label: "Valor", value: mi(payload[0].payload.value) }]} /> : null} />
              <Bar dataKey="value" radius={4} maxBarSize={22} isAnimationActive={false}>
                {[...data.cet1.steps, null].map((s, i) => <Cell key={i} fill={s === null ? "var(--series-1)" : s.value >= 0 ? "var(--axis)" : "var(--neg)"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <h3>Exposição da razão de alavancagem</h3>
          <div className="table-wrap">
            <table className="data">
              <tbody>
                <tr><td>Ativos do balanço (sem as deduções)</td><td className="num">{mi(data.leverage.on_balance)}</td></tr>
                <tr><td>Derivativos: 1,4 × (RC + PFE)</td><td className="num">{mi(data.leverage.derivatives)}</td></tr>
                <tr><td>Compromissadas</td><td className="num">{mi(data.leverage.sft)}</td></tr>
                <tr><td>Fora do balanço × CCF</td><td className="num">{mi(data.leverage.off_balance)}</td></tr>
                <tr><td><strong>Exposição total</strong></td><td className="num"><strong>{mi(data.leverage.total)}</strong></td></tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </Lab>
  );
}
