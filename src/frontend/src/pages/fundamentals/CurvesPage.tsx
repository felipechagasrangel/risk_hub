import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Scatter, ComposedChart, Tooltip, XAxis, YAxis } from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { CodeSnippet } from "../../components/CodeSnippet";
import { EditableTable } from "../../components/EditableTable";
import { Callout, Formula, Lab, Legend, M, NumField, Stat } from "../../components/ui";
import { fmtMoney, fmtNum, fmtPct } from "../../format";

type Method = "flat_forward" | "linear" | "spline";
type Contract = { label: string; du: number; rate: number };
type Future = { label: string; du: number; dc: number; price: number };
type Resp = {
  pre: {
    curve: ({ du: number } & Record<Method, number>)[];
    forwards: ({ du: number } & Record<Method, number>)[];
    fras: { from: string; to: string; du_from: number; du_to: number; forward: number }[];
    contracts: (Contract & { pu: number })[];
  };
  cupom: (Future & { pre: number; clean: number; dirty: number; frc: number | null })[];
};

const METHODS: { key: Method; label: string; color: string }[] = [
  { key: "flat_forward", label: "Flat-forward 252", color: "var(--series-1)" },
  { key: "linear", label: "Linear nas taxas", color: "var(--series-2)" },
  { key: "spline", label: "Spline cúbica", color: "var(--series-3)" },
];

const years = (du: number) => `${fmtNum(du / 252, 1)}a`;

export default function CurvesPage() {
  // A curva pré é compartilhada: o laboratório de cupom usa a mesma curva montada no laboratório do DI1
  const [contracts, setContracts] = useState<Contract[]>(DEFAULT_CONTRACTS);
  const [cdi, setCdi] = useState(0.149);
  return (
    <>
      <h1>Construção da curva de juros</h1>
      <p className="lead">
        Para marcar qualquer coisa a mercado é preciso uma taxa para <em>cada</em> prazo — mas o mercado só negocia
        alguns vencimentos. Construir a curva é transformar esses poucos pontos numa função contínua, sem criar
        arbitragem nem formatos estranhos no meio do caminho.
      </p>

      <h2>1. Curva pré a partir do DI1</h2>
      <p>
        O <strong>DI1</strong>, contrato futuro da B3, é o derivativo de juros mais líquido do Brasil. Ele vale 100.000
        pontos no vencimento (primeiro dia útil do mês do contrato) e é negociado em <strong>taxa</strong>; o preço
        (PU) é essa taxa trazida a valor presente:
      </p>
      <Formula tex={String.raw`\text{PU} = \frac{100.000}{(1 + r)^{DU/252}}`} where={[[String.raw`\text{PU}`, "preço unitário do contrato hoje"], [String.raw`r`, "taxa negociada, ao ano, base 252"], [String.raw`DU`, "dias úteis de hoje até o vencimento, pelo calendário de feriados nacionais"]]} />
      <p>
        Como o contrato remunera o <strong>CDI acumulado</strong> até o vencimento, a taxa negociada já é a taxa zero
        (spot) daquele prazo — diferente de títulos com cupom ou swaps com fluxos, aqui não é preciso bootstrapping. A
        ponta curta é ancorada no <strong>CDI de hoje</strong>, no vértice de 1 dia útil. Os vencimentos de janeiro (letra
        F) concentram a liquidez nos prazos longos.
      </p>
      <CodeSnippet name="di1_pu" />

      <h2>2. Interpolação: o que acontece entre os vértices</h2>
      <p>O padrão para a curva de DI é a interpolação <strong>flat-forward 252</strong>:</p>
      <Formula tex={String.raw`(1 + r_{du})^{\frac{du}{252}} = (1 + r_1)^{\frac{du_1}{252}} \left[\frac{(1 + r_2)^{du_2/252}}{(1 + r_1)^{du_1/252}}\right]^{\frac{du - du_1}{du_2 - du_1}}, \qquad du_1 \le du \le du_2`} where={[[String.raw`du_1,\ du_2`, "prazos (DU) dos vértices vizinhos"], [String.raw`r_1,\ r_2`, "taxas desses vértices"], [String.raw`r_{du}`, "taxa interpolada no prazo du"]]} />
      <p>
        Ela equivale a supor uma <strong>taxa a termo constante</strong> entre dois vencimentos — ou seja, um CDI diário
        constante nesse intervalo. É coerente com a forma como o CDI se acumula e não cria oportunidades de arbitragem
        entre vértices. Fora do último vértice, mantém-se a última taxa a termo.
      </p>
      <ul>
        <li><strong>Linear nas taxas</strong>: simples, mas o termo implícito sobe e desce em dente de serra entre vértices.</li>
        <li><strong>Spline cúbica</strong>: a curva de taxas fica suave, mas o termo pode oscilar e até ficar negativo perto de vértices muito juntos.</li>
        <li><strong>Modelos paramétricos</strong> (Nelson-Siegel, Svensson): ajustam uma forma funcional a todos os pontos sem passar exatamente por eles. A ANBIMA usa o Svensson na estrutura a termo dos títulos públicos.</li>
      </ul>
      <CodeSnippet name="flat_forward" caption="interpolação flat-forward 252" />

      <h2>3. Taxas a termo: a curva fala sobre o futuro</h2>
      <p>Entre dois vencimentos, a curva implica uma taxa a termo — quanto o CDI deve render, em média, naquele intervalo:</p>
      <Formula tex={String.raw`(1 + f_{1,2})^{\frac{du_2 - du_1}{252}} = \frac{(1 + r_2)^{du_2/252}}{(1 + r_1)^{du_1/252}}`} where={[[String.raw`f_{1,2}`, "taxa a termo entre du₁ e du₂, ao ano base 252"], [String.raw`r_1,\ r_2`, "taxas spot dos dois vencimentos"]]} />
      <p>
        Comprar um DI1 longo e vender um curto trava exatamente esse termo — é o “FRA” entre dois contratos. Como o CDI
        acompanha a Selic, os termos entre vencimentos que cercam uma reunião do Copom mostram o que o mercado espera
        da decisão (descontado um prêmio de risco).
      </p>
      <CodeSnippet name="forward_rate" />

      <h2>4. Laboratório: curva pré</h2>
      <PreLab contracts={contracts} setContracts={setContracts} cdi={cdi} setCdi={setCdi} />
      <Callout title="O que observar">
        <ul>
          <li>As três curvas de taxas quase coincidem; a diferença aparece nos <strong>termos</strong>: degraus na flat-forward, serra na linear e ondas na spline.</li>
          <li>Aumente a taxa de um vértice do meio em 50 bps: na flat-forward, só os termos vizinhos mudam; na spline, a perturbação se espalha pela curva toda.</li>
          <li>Os termos entre os primeiros contratos são a leitura do mercado sobre os próximos Copoms.</li>
        </ul>
      </Callout>

      <h2>5. Cupom cambial</h2>
      <p>
        O cupom cambial é o juro em dólar no mercado brasileiro. Ele não vem de uma taxa americana: sai da
        <strong> paridade coberta de juros</strong> entre o dólar à vista, o dólar futuro e a curva pré — se não fosse assim,
        haveria arbitragem entre aplicar em reais e aplicar em dólar com hedge:
      </p>
      <Formula tex={String.raw`1 + c\,\frac{DC}{360} = (1 + r_{\text{pré}})^{\frac{DU}{252}}\,\frac{S}{F}`} where={[[String.raw`c`, "cupom cambial, linear base 360"], [String.raw`DC`, "dias corridos até o vencimento"], [String.raw`r_{\text{pré}}`, "taxa pré interpolada no mesmo vencimento (DU)"], [String.raw`S`, "dólar à vista (ou a PTAX de D−1, no cupom sujo)"], [String.raw`F`, "dólar futuro (DOL) do vencimento"]]} />
      <ul>
        <li><strong>Cupom limpo × cupom sujo</strong>: o DDI, o futuro de cupom da B3, é referenciado na PTAX do dia anterior. Usando a PTAX de D−1 no lugar do dólar à vista obtém-se o cupom “sujo”, que embute a variação cambial de um dia; o “limpo” usa o dólar de hoje e é o que se usa para apreçar.</li>
        <li><strong>FRC</strong>: o FRA de cupom da B3 negocia o cupom a termo entre o primeiro vencimento e os seguintes. A parte longa da curva de cupom é montada encadeando o curto com os FRCs:</li>
      </ul>
      <Formula tex={String.raw`1 + c_2\,\frac{DC_2}{360} = \Big(1 + c_1\,\frac{DC_1}{360}\Big)\Big(1 + \text{FRC}_{1,2}\,\frac{DC_2 - DC_1}{360}\Big)`} where={[[String.raw`c_1,\ c_2`, "cupom do vencimento curto e do longo"], [String.raw`\text{FRC}_{1,2}`, "cupom a termo entre os dois vencimentos"], [String.raw`DC_1,\ DC_2`, "dias corridos até cada vencimento"]]} />
      <CodeSnippet name="implied_cupom" />

      <h2>6. Laboratório: cupom cambial</h2>
      <p className="muted" style={{ fontSize: 14 }}>Os dados de mercado padrão são ilustrativos. A curva pré usada é a do laboratório anterior.</p>
      <CupomLab contracts={contracts} cdi={cdi} />
      <Callout title="O que observar">
        <ul>
          <li>Suba o dólar futuro de um vencimento: o cupom implícito cai — dólar a termo mais caro significa juro em dólar mais baixo para a mesma pré.</li>
          <li>A diferença entre o cupom sujo e o limpo é grande nos vencimentos curtos (poucos dias para diluir a variação de um dia do dólar) e some nos longos.</li>
          <li>O FRC mostra o cupom a termo: é ele que a mesa negocia para montar a parte longa da curva.</li>
        </ul>
      </Callout>
    </>
  );
}

const DEFAULT_CONTRACTS: Contract[] = [
  { label: "DI1F27", du: 44, rate: 0.1485 }, { label: "DI1J27", du: 105, rate: 0.147 },
  { label: "DI1N27", du: 168, rate: 0.1445 }, { label: "DI1F28", du: 296, rate: 0.141 },
  { label: "DI1F29", du: 547, rate: 0.137 }, { label: "DI1F30", du: 797, rate: 0.136 },
  { label: "DI1F31", du: 1046, rate: 0.1365 }, { label: "DI1F33", du: 1546, rate: 0.138 },
  { label: "DI1F35", du: 2046, rate: 0.139 },
];
const DEFAULT_FX: Future[] = [
  { label: "DOLZ26", du: 23, dc: 34, price: 5.445 }, { label: "DOLF27", du: 44, dc: 65, price: 5.4856 },
  { label: "DOLJ27", du: 105, dc: 155, price: 5.5994 }, { label: "DOLN27", du: 168, dc: 246, price: 5.7094 },
  { label: "DOLF28", du: 296, dc: 430, price: 5.9229 },
];

function PreLab({ contracts, setContracts, cdi, setCdi }: {
  contracts: Contract[]; setContracts: (c: Contract[]) => void; cdi: number; setCdi: (v: number) => void;
}) {
  const { data, error } = useCompute<Resp>("/curves/build", { cdi, contracts, fx: [] }, 300);
  const nodes = data?.pre.contracts.map((c) => ({ du: c.du, node: c.rate })) ?? [];

  return (
    <Lab title="Monte a curva pré a partir dos DI1">
      <div className="grid-2">
        <div>
          <EditableTable<Contract>
            rows={contracts} onChange={setContracts}
            newRow={() => ({ label: "DI1", du: 2546, rate: 0.14 })}
            columns={[
              { key: "label", label: "Contrato", type: "text" },
              { key: "du", label: "DU", type: "number", width: 80 },
              { key: "rate", label: "Taxa", type: "percent", width: 90 },
            ]}
            computed={data && data.pre.contracts.length === contracts.length ? [
              { label: "PU", values: [...contracts].map((c) => fmtNum(data.pre.contracts.find((x) => x.label === c.label && x.du === c.du)?.pu ?? 0, 2)) },
            ] : []}
          />
        </div>
        <div>
          <div className="grid">
            <NumField label="CDI de hoje (vértice 1 DU)" percent value={cdi} onChange={setCdi} step={0.05} />
          </div>
          {data && (
            <>
              <h3>Termos entre vencimentos</h3>
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>De → até</th><th className="num">Prazo (DU)</th><th className="num">Taxa a termo</th></tr></thead>
                  <tbody>
                    {data.pre.fras.map((f) => (
                      <tr key={f.to}><td>{f.from} → {f.to}</td><td className="num">{f.du_from}–{f.du_to}</td><td className="num">{fmtPct(f.forward, 2)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <div className="chart-title" style={{ marginTop: 18 }}>Taxa spot por prazo</div>
          <div className="chart-sub">Pontos: os vértices do DI1. Linhas: a curva interpolada por cada método.</div>
          <Legend items={[...METHODS.map((m) => ({ label: m.label, color: m.color })), { label: "Vértices (DI1)", color: "var(--text)", box: true }]} />
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="du" type="number" domain={[0, "dataMax"]} tickFormatter={years} {...axisProps} allowDuplicatedCategory={false} />
              <YAxis tickFormatter={(v) => fmtPct(v, 1)} {...axisProps} width={56} domain={["auto", "auto"]} />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as Resp["pre"]["curve"][number];
                if (!("linear" in d)) return null;
                return <TooltipBox title={`${d.du} DU (${years(d.du)})`} rows={METHODS.map((m) => ({ label: m.label, value: fmtPct(d[m.key], 3), color: m.color }))} />;
              }} />
              {METHODS.map((m) => (
                <Line key={m.key} data={data.pre.curve} dataKey={m.key} stroke={m.color} strokeWidth={2} dot={false} isAnimationActive={false} />
              ))}
              <Scatter data={nodes} dataKey="node" fill="var(--text)" isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>

          <div className="chart-title" style={{ marginTop: 14 }}>Taxa a termo de curto prazo ao longo da curva</div>
          <div className="chart-sub">Termo de 5 dias úteis em cada ponto: é aqui que os métodos se separam.</div>
          <Legend items={METHODS.map((m) => ({ label: m.label, color: m.color }))} />
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.pre.forwards} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="du" type="number" domain={[0, "dataMax"]} tickFormatter={years} {...axisProps} />
              <YAxis tickFormatter={(v) => fmtPct(v, 1)} {...axisProps} width={56} domain={["auto", "auto"]} />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as Resp["pre"]["forwards"][number];
                return <TooltipBox title={`${d.du} DU (${years(d.du)})`} rows={METHODS.map((m) => ({ label: m.label, value: fmtPct(d[m.key], 3), color: m.color }))} />;
              }} />
              {METHODS.map((m) => (
                <Line key={m.key} dataKey={m.key} type={m.key === "flat_forward" ? "stepAfter" : "linear"} stroke={m.color} strokeWidth={2} dot={false} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
    </Lab>
  );
}

function CupomLab({ contracts, cdi }: { contracts: Contract[]; cdi: number }) {
  const [fx, setFx] = useState<Future[]>(DEFAULT_FX);
  const [spot, setSpot] = useState(5.4);
  const [ptax, setPtax] = useState(5.38);
  const { data, error } = useCompute<Resp>("/curves/build", { cdi, contracts, fx, spot, ptax }, 300);

  return (
    <Lab title="Cupom cambial implícito no dólar futuro">
      <div className="grid">
        <NumField label="Dólar à vista" value={spot} onChange={setSpot} step={0.01} />
        <NumField label="PTAX de D−1" value={ptax} onChange={setPtax} step={0.01} />
      </div>
      <div style={{ marginTop: 14 }}>
        <EditableTable<Future>
          rows={fx} onChange={setFx}
          newRow={() => ({ label: "DOL", du: 547, dc: 795, price: 6.2 })}
          columns={[
            { key: "label", label: "Contrato", type: "text" },
            { key: "du", label: "DU", type: "number", width: 70 },
            { key: "dc", label: "DC", type: "number", width: 70 },
            { key: "price", label: "Dólar futuro", type: "number", width: 100 },
          ]}
          computed={data && data.cupom.length === fx.length ? [
            { label: "Pré interpolada", values: data.cupom.map((c) => fmtPct(c.pre, 2)) },
            { label: "Cupom limpo", values: data.cupom.map((c) => fmtPct(c.clean, 2)) },
            { label: "Cupom sujo", values: data.cupom.map((c) => fmtPct(c.dirty, 2)) },
            { label: "FRC", values: data.cupom.map((c) => (c.frc == null ? "—" : fmtPct(c.frc, 2))) },
          ] : []}
        />
      </div>
      {error && <p className="error">{error}</p>}
      {data && data.cupom.length > 0 && (
        <>
          <div className="stats">
            <Stat label="Cupom limpo — mais curto" value={fmtPct(data.cupom[0].clean, 2)} sub={`sujo: ${fmtPct(data.cupom[0].dirty, 2)}`} />
            <Stat label="Cupom limpo — mais longo" value={fmtPct(data.cupom[data.cupom.length - 1].clean, 2)} sub={`sujo: ${fmtPct(data.cupom[data.cupom.length - 1].dirty, 2)}`} />
            <Stat label="Dólar à vista − PTAX" value={fmtMoney((spot - ptax) * 1000)} sub="por US$ 1.000" />
          </div>
          <div className="chart-title">Cupom cambial por vencimento</div>
          <Legend items={[
            { label: "Cupom limpo (dólar à vista)", color: "var(--series-1)" },
            { label: "Cupom sujo (PTAX D−1)", color: "var(--series-2)" },
          ]} />
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data.cupom} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="du" type="number" domain={[0, "dataMax"]} tickFormatter={years} {...axisProps} />
              <YAxis tickFormatter={(v) => fmtPct(v, 1)} {...axisProps} width={56} domain={["auto", "auto"]} />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as Resp["cupom"][number];
                return <TooltipBox title={d.label} rows={[
                  { label: "Limpo", value: fmtPct(d.clean, 3), color: "var(--series-1)" },
                  { label: "Sujo", value: fmtPct(d.dirty, 3), color: "var(--series-2)" },
                ]} />;
              }} />
              <Line dataKey="clean" stroke="var(--series-1)" strokeWidth={2} isAnimationActive={false} />
              <Line dataKey="dirty" stroke="var(--series-2)" strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
    </Lab>
  );
}
