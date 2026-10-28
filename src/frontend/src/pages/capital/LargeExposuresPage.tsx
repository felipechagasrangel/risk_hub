import { useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { CodeSnippet } from "../../components/CodeSnippet";
import { EditableTable } from "../../components/EditableTable";
import { Callout, Formula, Lab, Legend, NumField, PassBadge, RegNote, Stat } from "../../components/ui";
import { fmtNum, fmtPct } from "../../format";

type Exposure = { name: string; group: string; gross: number; mitigation: number; exempt: boolean };
type Group = { group: string; members: string[]; gross: number; mitigation: number; net: number; pct_tier1: number; exempt: boolean; status: string };
type Resp = {
  groups: Group[]; tier1: number; limit: number; threshold: number;
  concentrated_total: number; concentrated_pct: number; aggregate_limit: number; breaches: number;
};

const STATUS_COLOR: Record<string, string> = {
  "acima do limite": "var(--critical)", concentrada: "var(--warning)", ok: "var(--series-1)", isenta: "var(--muted)",
};

export default function LargeExposuresPage() {
  return (
    <>
      <h1>Grandes exposições</h1>
      <p className="lead">
        O RWA mede o risco da carteira como se ela fosse bem diversificada. Se um único cliente quebra e ele representa
        um terço do capital, nenhum índice de Basileia salva o banco. O limite de exposição por cliente fecha essa lacuna.
      </p>

      <h2>1. A regra</h2>
      <Formula tex={String.raw`E_g = \sum_{c\,\in\,g} \big(\text{EAD}_c - \text{CRM}_c\big) \le 25\% \times \text{Nível I}`} where={[
        [String.raw`g`, "cliente ou grupo de clientes conectados (controle comum ou dependência econômica)"],
        [String.raw`\text{EAD}_c`, "exposição do cliente c: crédito, títulos, garantias prestadas e derivativos (EAD do SA-CCR)"],
        [String.raw`\text{CRM}_c`, "mitigadores elegíveis: colateral financeiro e garantias de terceiros"],
        [String.raw`\text{Nível I}`, "Capital Principal + Complementar"],
      ]} />
      <ul>
        <li><strong>Limite individual:</strong> 25% do Nível I por cliente ou grupo econômico (Res. CMN 4.677/2018, para S1 a S4).</li>
        <li><strong>Exposição concentrada:</strong> 10% do Nível I ou mais; a soma das concentradas tem limite de 600% do Nível I.</li>
        <li><strong>Isenções:</strong> exposições ao Tesouro Nacional e ao Banco Central, entre outras, ficam fora do limite.</li>
        <li><strong>Grupo econômico:</strong> o ponto mais trabalhoso na prática. Empresas com controle comum, ou que dependem uma da outra para pagar, são um cliente só.</li>
      </ul>
      <CodeSnippet name="large_exposures" />

      <h2>2. Laboratório</h2>
      <LargeExposuresLab />
      <Callout title="O que observar">
        <ul>
          <li>Alfa Energia (16%) e Alfa Logística (9%) cabem no limite sozinhas; como grupo, passam de 25%. Apague o grupo de uma delas para ver a diferença.</li>
          <li>Colateral elegível reduz a exposição líquida: adicionar garantia ao Grupo Alfa é uma forma de enquadrar sem cortar o crédito.</li>
          <li>O Tesouro é a maior exposição de qualquer banco brasileiro, mas é isento.</li>
          <li>Um prejuízo que reduz o Nível I aumenta todas as razões ao mesmo tempo: o banco pode desenquadrar sem conceder nenhum crédito novo.</li>
        </ul>
      </Callout>
      <RegNote>As maiores exposições por cliente aparecem no <Link to="/cadocs#ddr">DDR</Link> e nas informações de concentração enviadas ao BCB.</RegNote>
    </>
  );
}

function LargeExposuresLab() {
  const [tier1, setTier1] = useState(1_220);
  const [rows, setRows] = useState<Exposure[]>([
    { name: "Tesouro Nacional", group: "", gross: 3_000, mitigation: 0, exempt: true },
    { name: "Alfa Energia", group: "Grupo Alfa", gross: 200, mitigation: 0, exempt: false },
    { name: "Alfa Logística", group: "Grupo Alfa", gross: 130, mitigation: 20, exempt: false },
    { name: "Banco Beta", group: "", gross: 260, mitigation: 0, exempt: false },
    { name: "Varejista Gama", group: "", gross: 140, mitigation: 0, exempt: false },
    { name: "Construtora Delta", group: "", gross: 90, mitigation: 30, exempt: false },
    { name: "Épsilon Holding", group: "Grupo Épsilon", gross: 210, mitigation: 50, exempt: false },
    { name: "Épsilon Agro", group: "Grupo Épsilon", gross: 120, mitigation: 0, exempt: false },
    { name: "Mineradora Zeta", group: "", gross: 100, mitigation: 0, exempt: false },
  ]);
  const { data, error } = useCompute<Resp>("/capital/large-exposures", { tier1, exposures: rows });
  const chart = data ? data.groups.filter((g) => !g.exempt) : [];

  return (
    <Lab title="Carteira por cliente (R$ milhões)">
      <div className="grid"><NumField label="Nível I" value={tier1} onChange={setTier1} step={50} min={1} /></div>
      <EditableTable<Exposure> rows={rows} onChange={setRows}
        newRow={() => ({ name: "Novo cliente", group: "", gross: 50, mitigation: 0, exempt: false })}
        columns={[
          { key: "name", label: "Cliente", type: "text", width: 170 },
          { key: "group", label: "Grupo econômico", type: "text", width: 150 },
          { key: "gross", label: "Exposição", type: "number", width: 100 },
          { key: "mitigation", label: "Mitigadores", type: "number", width: 100 },
          { key: "exempt", label: "Isenta", type: "check", width: 60 },
        ]} />
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <div className="stats">
            <Stat label="Limite por grupo" value={`${fmtNum(data.limit * data.tier1, 0)} mi`} sub="25% do Nível I" />
            <Stat label="Grupos acima do limite" value={<PassBadge ok={data.breaches === 0} label={String(data.breaches)} />} />
            <Stat label="Soma das concentradas" value={fmtPct(data.concentrated_pct, 0)} sub={`limite: ${fmtPct(data.aggregate_limit, 0)} do Nível I`} />
          </div>
          <div className="chart-title">Exposição líquida por grupo, em % do Nível I</div>
          <Legend items={[
            { label: "Acima do limite", color: "var(--critical)", box: true }, { label: "Concentrada (≥ 10%)", color: "var(--warning)", box: true },
            { label: "Abaixo de 10%", color: "var(--series-1)", box: true },
          ]} />
          <ResponsiveContainer width="100%" height={Math.max(160, chart.length * 34 + 40)}>
            <BarChart data={chart} layout="vertical" margin={{ top: 8, right: 24, bottom: 4, left: 8 }}>
              <CartesianGrid {...gridProps} horizontal={false} vertical />
              <XAxis type="number" tickFormatter={(v) => fmtPct(v, 0)} domain={[0, (max: number) => Math.max(0.3, max)]} {...axisProps} />
              <YAxis type="category" dataKey="group" width={140} {...axisProps} />
              <ReferenceLine x={0.25} stroke="var(--critical)" strokeDasharray="4 4" />
              <ReferenceLine x={0.10} stroke="var(--warning)" strokeDasharray="4 4" />
              <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload }) => active && payload?.length ? (
                <TooltipBox title={payload[0].payload.group} rows={[
                  { label: "Membros", value: payload[0].payload.members.join(", ") },
                  { label: "Bruta", value: `${fmtNum(payload[0].payload.gross, 0)} mi` },
                  { label: "Líquida", value: `${fmtNum(payload[0].payload.net, 0)} mi` },
                  { label: "% do Nível I", value: fmtPct(payload[0].payload.pct_tier1, 1) },
                ]} />
              ) : null} />
              <Bar dataKey="pct_tier1" radius={[0, 3, 3, 0]} maxBarSize={22} isAnimationActive={false}>
                {chart.map((g) => <Cell key={g.group} fill={STATUS_COLOR[g.status]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </Lab>
  );
}
