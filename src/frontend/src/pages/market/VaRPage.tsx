import { useState } from "react";
import {
  Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { Link } from "react-router-dom";
import { Callout, Formula, Lab, Legend, M, NumField, RegNote, SelectField, Stat, StatusBadge } from "../../components/ui";
import { fmtCompact, fmtMoney, fmtPct } from "../../format";

type Method = { var: number; es: number };
type Zone = "verde" | "amarela" | "vermelha" | "n/a";
type VaRResponse = {
  estimates: { mu_daily: number; sigma_daily: number; sigma_annual: number };
  methods: { parametric: Method; historical: Method; monte_carlo: Method };
  histogram_historical: { x: number; count: number }[];
  backtest: {
    observations: number; expected_exceptions: number;
    exceptions_parametric: number; exceptions_historical: number;
    zone_parametric: Zone; zone_historical: Zone;
    points: { day: number; pnl: number; var_parametric: number; var_historical: number;
      breach_parametric: boolean; breach_historical: boolean }[];
  };
};

const METHODS = [
  { key: "parametric", label: "Paramétrico", color: "var(--series-1)" },
  { key: "historical", label: "Histórico", color: "var(--series-2)" },
  { key: "monte_carlo", label: "Monte Carlo", color: "var(--series-3)" },
] as const;

export default function VaRPage() {
  const [p, setP] = useState({
    value: 1_000_000, mu_annual: 0.08, sigma_annual: 0.25, distribution: "normal" as "normal" | "t",
    df: 4, confidence: 0.99, horizon: 1, n_days: 1000, n_sims: 10_000, window: 250, seed: 42,
  });
  const set = <K extends keyof typeof p>(k: K) => (v: (typeof p)[K]) => setP({ ...p, [k]: v });
  const { data, error } = useCompute<VaRResponse>("/market/var", p);

  return (
    <>
      <h1>Value at Risk (VaR) e Expected Shortfall</h1>
      <p className="lead">
        O VaR responde a uma pergunta: <em>“qual a perda que, com X% de confiança, não será
        ultrapassada em N dias?”</em>
      </p>

      <h2>1. A definição</h2>
      <p>
        Seja <M>L</M> a perda da carteira no horizonte <M>h</M> (perda positiva = prejuízo). O VaR
        ao nível de confiança <M>\alpha</M> é o quantil <M>\alpha</M> da distribuição de perdas:
      </p>
      <Formula tex={String.raw`\text{VaR}_\alpha = \inf\{\, \ell : P(L > \ell) \le 1-\alpha \,\}`} where={[[String.raw`\text{VaR}_\alpha`, "Value at Risk ao nível de confiança α"], [String.raw`L`, "perda da carteira no horizonte (positiva = prejuízo)"], [String.raw`\ell`, "um nível de perda candidato"], [String.raw`P(L > \ell)`, "probabilidade de a perda superar ℓ"], [String.raw`\alpha`, "nível de confiança, por exemplo 99%"], [String.raw`\inf`, "o menor valor de ℓ que satisfaz a condição"]]} />
      <p>
        Exemplo: um VaR 99% de 1 dia de R$ 23 mil significa que, em média, em 1 a cada 100 dias
        a perda será <strong>maior</strong> que R$ 23 mil. Note o que o VaR <strong>não</strong> diz:
        quanto se perde nesses dias ruins. É por isso que existe o Expected Shortfall.
      </p>
      <Callout title="Três ingredientes de todo VaR">
        <strong>Nível de confiança</strong> (95%, 99%…), <strong>horizonte</strong> (1 dia,
        10 dias…) e <strong>um modelo da distribuição de perdas</strong>. Os métodos abaixo
        diferem apenas no terceiro ingrediente.
      </Callout>

      <h2>2. Os três métodos</h2>
      <h3>Paramétrico (delta-normal)</h3>
      <p>
        Supõe que os retornos são normais. Basta estimar média <M>\mu</M> e volatilidade
        <M>\sigma</M> e usar o quantil da normal <M>z_\alpha</M> (2,326 para 99%; 1,645 para 95%):
      </p>
      <Formula tex={String.raw`\text{VaR}_\alpha = V \cdot \left( z_\alpha\, \sigma \sqrt{h} - \mu h \right)`} where={[[String.raw`V`, "valor da posição, em R$"], [String.raw`z_\alpha`, "quantil da normal padrão: 1,645 a 95% e 2,326 a 99%"], [String.raw`\sigma`, "volatilidade diária dos retornos"], [String.raw`\mu`, "retorno médio diário"], [String.raw`h`, "horizonte, em dias úteis"]]} />
      <p>Rápido e analítico, mas subestima o risco quando as caudas reais são mais pesadas que a normal.</p>

      <h3>Histórico</h3>
      <p>
        Não supõe distribuição: aplica à carteira atual os retornos realmente observados no passado
        e lê o quantil empírico das perdas. Se há 1.000 dias, o VaR 99% é aproximadamente a
        10ª maior perda.
      </p>
      <Formula tex={String.raw`\text{VaR}_\alpha = \text{quantil}_\alpha\{-V r_1, \dots, -V r_n\} \cdot \sqrt{h}`} where={[[String.raw`r_1, \dots, r_n`, "retornos diários observados no histórico"], [String.raw`n`, "número de dias do histórico"], [String.raw`-V r_i`, "perda que a carteira de hoje teria sofrido no dia i"], [String.raw`\text{quantil}_\alpha`, "quantil empírico α das perdas simuladas"], [String.raw`\sqrt{h}`, "escala do VaR de 1 dia para h dias (regra da raiz do tempo)"]]} />
      <p>Captura caudas gordas e assimetria, mas assume que o passado representa o futuro e depende muito da janela escolhida.</p>

      <h3>Monte Carlo</h3>
      <p>
        Simula milhares de cenários a partir de um modelo estocástico (aqui, preço log-normal) e
        reavalia a carteira em cada um. É o mais flexível — trata opções e outros instrumentos
        não lineares — mas é tão bom quanto o modelo simulado e computacionalmente caro.
      </p>
      <Formula tex={String.raw`S_h = S_0 \exp\!\left[(\mu - \tfrac{\sigma^2}{2})h + \sigma \sqrt{h}\, Z\right],\quad Z \sim N(0,1)`} where={[[String.raw`S_0`, "preço do ativo hoje"], [String.raw`S_h`, "preço simulado ao fim do horizonte h"], [String.raw`\mu`, "retorno médio diário (drift)"], [String.raw`\sigma`, "volatilidade diária"], [String.raw`\tfrac{\sigma^2}{2}`, "correção para que o preço esperado cresça à taxa μ"], [String.raw`Z`, "choque aleatório sorteado de uma normal padrão, um por cenário"], [String.raw`h`, "horizonte, em dias úteis"]]} />

      <h2>3. Laboratório</h2>
      <Lab title="Gere um histórico de retornos e compare os métodos">
        <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
          A API gera uma série sintética de retornos diários com a distribuição escolhida e calcula
          os três VaRs sobre ela. Use a t de Student para criar caudas gordas.
        </p>
        <div className="grid">
          <NumField label="Valor da posição" value={p.value} onChange={set("value")} step={100000} />
          <NumField label="Volatilidade anual" percent value={p.sigma_annual} onChange={set("sigma_annual")} step={1} />
          <NumField label="Retorno anual esperado" percent value={p.mu_annual} onChange={set("mu_annual")} step={1} />
          <NumField label="Confiança" percent value={p.confidence} onChange={set("confidence")} step={0.5} min={51} max={99.9} />
          <NumField label="Horizonte (dias)" value={p.horizon} onChange={set("horizon")} min={1} max={250} />
          <SelectField label="Distribuição dos retornos" value={p.distribution} onChange={set("distribution")}
            options={[["normal", "Normal"], ["t", "t de Student (caudas gordas)"]]} />
          {p.distribution === "t" && (
            <NumField label="Graus de liberdade" value={p.df} onChange={set("df")} min={2.1} step={0.5}
              hint="Menor = caudas mais gordas" />
          )}
          <NumField label="Dias de histórico" value={p.n_days} onChange={set("n_days")} step={100} min={300} max={5000} />
          <NumField label="Simulações Monte Carlo" value={p.n_sims} onChange={set("n_sims")} step={1000} min={100} />
          <NumField label="Semente aleatória" value={p.seed} onChange={set("seed")} />
        </div>
        {error && <p className="error">{error}</p>}
        {data && <VaRResults data={data} p={p} />}
      </Lab>

      <Callout title="O que observar">
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Com retornos <strong>normais</strong>, os três métodos convergem — a diferença é ruído amostral.</li>
          <li>Troque para <strong>t de Student com 3 graus de liberdade</strong> a 99%: o VaR histórico
            supera o paramétrico. O modelo normal “não vê” a cauda.</li>
          <li>Agora baixe a confiança para <strong>95%</strong>: a diferença quase some (ou inverte).
            Caudas gordas importam lá no extremo.</li>
          <li>Reduza as simulações de Monte Carlo para 200 e mude a semente: veja o VaR oscilar.
            O erro de Monte Carlo cai com <M>{String.raw`1/\sqrt{N}`}</M>, em que <M>N</M> é o número de simulações.</li>
        </ul>
      </Callout>

      <h2>4. Expected Shortfall (ES)</h2>
      <p>
        O ES (ou CVaR) é a <strong>perda média nos piores (1−α)% dos casos</strong> — ele olha para
        dentro da cauda, enquanto o VaR só marca sua fronteira:
      </p>
      <Formula tex={String.raw`\text{ES}_\alpha = E\left[\, L \mid L \ge \text{VaR}_\alpha \,\right]`} where={[[String.raw`\text{ES}_\alpha`, "Expected Shortfall ao nível α"], [String.raw`L`, "perda da carteira no horizonte"], [String.raw`E[\,\cdot \mid \cdot\,]`, "esperança condicional: a média de L apenas nos cenários em que a condição vale"], [String.raw`\text{VaR}_\alpha`, "Value at Risk ao mesmo nível α"]]} />
      <p>
        Na normal com média zero, <M>{String.raw`\text{ES}_\alpha = V\sigma\sqrt{h}\,\varphi(z_\alpha)/(1-\alpha)`}</M>, em que
        <M>{String.raw`\varphi`}</M> é a densidade da normal padrão — a 99%, o ES equivale a 2,665σ, contra 2,326σ do VaR.
        Duas razões para preferi-lo: (1) é <strong>subaditivo</strong> — o ES de uma carteira nunca é
        maior que a soma dos ES das partes, o que o VaR não garante; (2) é sensível ao tamanho das
        perdas extremas. Por isso o FRTB (Basileia III para a carteira de negociação) trocou o VaR 99%
        pelo <strong>ES 97,5%</strong>, que na normal tem magnitude parecida.
      </p>

      <h2>5. Regra da raiz do tempo</h2>
      <p>Se os retornos diários são independentes e identicamente distribuídos, as variâncias se somam:</p>
      <Formula tex={String.raw`\sigma_h = \sigma_1 \sqrt{h} \quad\Rightarrow\quad \text{VaR}_{10d} \approx \text{VaR}_{1d}\cdot\sqrt{10} \approx 3{,}16 \times \text{VaR}_{1d}`} where={[[String.raw`\sigma_1`, "volatilidade de 1 dia"], [String.raw`\sigma_h`, "volatilidade no horizonte de h dias"], [String.raw`h`, "horizonte, em dias úteis"], [String.raw`\text{VaR}_{1d},\ \text{VaR}_{10d}`, "VaR de 1 e de 10 dias"]]} />
      <p>
        É assim que o VaR regulatório de 10 dias era obtido a partir do de 1 dia. A regra falha com
        autocorrelação, clusters de volatilidade ou posições que mudam no período. Teste no
        laboratório mudando o horizonte para 10.
      </p>

      <h2>6. Backtesting</h2>
      <p>
        Como saber se o modelo de VaR é bom? Compara-se, dia a dia, a perda realizada com o VaR
        calculado na véspera. Cada dia em que a perda supera o VaR é uma <strong>exceção</strong>.
        Com VaR 99% em 250 dias, esperamos cerca de 2,5 exceções. O Comitê de Basileia classifica
        o modelo num <strong>semáforo</strong>: verde (0–4), amarela (5–9) e vermelha (10+), com
        multiplicador de capital crescente.
      </p>
      {data && <Backtest data={data} confidence={p.confidence} />}

      <RegNote>
        <p>
          As exposições a fatores de risco de mercado vão no <Link to="/cadocs#drm">DRM (2060)</Link>, e o RWA de
          mercado é acompanhado diariamente no <Link to="/cadocs#ddr">DDR (2011)</Link>. Importante: o capital
          regulatório de mercado no Brasil não é o VaR — hoje é a soma de componentes padronizados (RWA<sub>JUR</sub>,
          RWA<sub>ACS</sub>, RWA<sub>CAM</sub>…) e, a partir de 2027, o <Link to="/cadocs#rwasens">RWA SENS</Link>.
          O VaR continua central na gestão interna de riscos e nos limites.
        </p>
      </RegNote>
    </>
  );
}

function VaRResults({ data, p }: { data: VaRResponse; p: { value: number; confidence: number; horizon: number } }) {
  const m = data.methods;
  return (
    <>
      <div className="stats">
        {METHODS.map((x) => (
          <Stat key={x.key} label={`VaR ${x.label}`} value={fmtMoney(m[x.key].var)}
            sub={`ES: ${fmtMoney(m[x.key].es)} · ${fmtPct(m[x.key].var / p.value, 2)} da posição`} />
        ))}
        <Stat label="Volatilidade estimada" value={fmtPct(data.estimates.sigma_annual)}
          sub={`diária: ${fmtPct(data.estimates.sigma_daily, 2)}`} />
      </div>

      <div className="chart-title">Distribuição de perdas históricas ({p.horizon}d) e onde cada método coloca o VaR</div>
      <div className="chart-sub">Perda positiva = prejuízo. A área à direita de cada linha tem {fmtPct(1 - p.confidence)} de probabilidade.</div>
      <Legend items={[
        { label: "Frequência (histórico)", color: "var(--axis)", box: true },
        ...METHODS.map((x) => ({ label: `VaR ${x.label}`, color: x.color })),
      ]} />
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data.histogram_historical} margin={{ top: 10, right: 16, bottom: 4, left: 0 }} barCategoryGap={1}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} tickFormatter={fmtCompact} {...axisProps} />
          <YAxis {...axisProps} width={40} />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox title={`Perda ≈ ${fmtMoney(payload[0].payload.x)}`}
                rows={[{ label: "Dias", value: String(payload[0].payload.count) }]} />
            ) : null} />
          <Bar dataKey="count" fill="var(--axis)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          {METHODS.map((x) => (
            <ReferenceLine key={x.key} x={m[x.key].var} stroke={x.color} strokeWidth={2} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
}

function Backtest({ data, confidence }: { data: VaRResponse; confidence: number }) {
  const b = data.backtest;
  const points = b.points.map((pt, i) => ({
    ...pt,
    i: i + 1,
    breach: pt.breach_historical || pt.breach_parametric ? pt.pnl : null,
  }));
  return (
    <div className="card">
      <div className="stats">
        <Stat label="Exceções esperadas" value={b.expected_exceptions.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
          sub={`${b.observations} dias × ${fmtPct(1 - confidence)}`} />
        <Stat label="Exceções — Paramétrico" value={b.exceptions_parametric} sub={<StatusBadge zone={b.zone_parametric} />} />
        <Stat label="Exceções — Histórico" value={b.exceptions_historical} sub={<StatusBadge zone={b.zone_historical} />} />
      </div>
      {b.zone_parametric === "n/a" && (
        <p className="muted" style={{ fontSize: 13 }}>O semáforo de Basileia só é definido para VaR 99% com 250 observações.</p>
      )}
      <div className="chart-title">P&L diário dos últimos {b.observations} dias contra o VaR 1 dia do dia anterior</div>
      <div className="chart-sub">VaR reestimado a cada dia com janela móvel de 250 dias. Pontos marcam as exceções.</div>
      <Legend items={[
        { label: "P&L diário", color: "var(--axis)", box: true },
        { label: "−VaR Paramétrico", color: "var(--series-1)" },
        { label: "−VaR Histórico", color: "var(--series-2)" },
        { label: "Exceção", color: "var(--critical)", box: true },
      ]} />
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={points} margin={{ top: 10, right: 16, bottom: 4, left: 0 }} barCategoryGap={0}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="i" {...axisProps} interval={49} />
          <YAxis tickFormatter={fmtCompact} {...axisProps} width={56} />
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as (typeof points)[number];
            return (
              <TooltipBox title={`Dia ${d.i}`} rows={[
                { label: "P&L", value: fmtMoney(d.pnl) },
                { label: "−VaR Paramétrico", value: fmtMoney(d.var_parametric), color: "var(--series-1)" },
                { label: "−VaR Histórico", value: fmtMoney(d.var_historical), color: "var(--series-2)" },
              ]} />
            );
          }} />
          <ReferenceLine y={0} stroke="var(--axis)" />
          <Bar dataKey="pnl" fill="var(--axis)" isAnimationActive={false} />
          <Line dataKey="var_parametric" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="var_historical" stroke="var(--series-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="breach" stroke="none" isAnimationActive={false} activeDot={false}
            dot={(props: { cx?: number; cy?: number; value?: number | null; index?: number }) =>
              props.value == null || props.cy == null ? <g key={props.index} /> :
                <circle key={props.index} cx={props.cx} cy={props.cy} r={5} fill="var(--critical)" stroke="var(--surface)" strokeWidth={2} />} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
