import { useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { CodeSnippet } from "../../components/CodeSnippet";
import { Callout, Formula, Lab, Legend, M, NumField, SelectField, Stat } from "../../components/ui";
import { fmtNum, fmtPct } from "../../format";

type PathsResp = {
  times: number[];
  samples: number[][];
  bands: { p5: number[]; p25: number[]; p50: number[]; p75: number[]; p95: number[] };
  check: { label: string; analytic: number; convergence: { n: number; estimate: number; std_error: number }[] };
};

export default function MonteCarloPage() {
  return (
    <>
      <h1>Monte Carlo e modelos de difusão</h1>
      <p className="lead">
        XVA depende de saber quanto um derivativo <em>pode</em> valer em cada data futura. Não há fórmula fechada
        para isso numa carteira real: simulam-se milhares de cenários dos fatores de risco e reavalia-se a carteira em
        cada um. Esta página apresenta o método e os três modelos mais citados.
      </p>

      <h2>1. A ideia do Monte Carlo</h2>
      <p>
        Quase tudo em apreçamento é uma esperança: o valor de um derivativo é a média, sob a medida neutra ao risco,
        do seu fluxo descontado. Monte Carlo troca a integral por uma média de cenários sorteados:
      </p>
      <Formula tex={String.raw`\mathbb{E}[\,g(X)\,] \approx \hat g_N = \frac{1}{N}\sum_{k=1}^{N} g(X^{(k)}), \qquad \text{erro padrão} = \frac{s}{\sqrt N}`} where={[[String.raw`X^{(k)}`, "k-ésimo cenário simulado dos fatores de risco (uma trajetória)"], [String.raw`g(\cdot)`, "o que se quer medir em cada cenário: um fluxo descontado, uma exposição"], [String.raw`N`, "número de trajetórias"], [String.raw`\hat g_N`, "a estimativa de Monte Carlo"], [String.raw`s`, "desvio padrão amostral de g entre as trajetórias"]]} />
      <ul>
        <li><strong>Lei dos grandes números</strong>: a média converge para a esperança verdadeira.</li>
        <li><strong>Teorema central do limite</strong>: o erro cai com <M>{String.raw`1/\sqrt{N}`}</M> — para dividir o erro por 10 é preciso 100 vezes mais trajetórias.</li>
        <li><strong>Discretização</strong>: o tempo é simulado em passos (aqui, semanais). Quando o modelo tem transição exata, como GBM e Hull-White, os passos não introduzem erro.</li>
        <li><strong>Redução de variância</strong>: variáveis antitéticas, variáveis de controle e números quase aleatórios (Sobol) reduzem o erro sem aumentar N.</li>
      </ul>

      <h2>2. GBM: câmbio e ações</h2>
      <p>O movimento browniano geométrico é o modelo do Black-Scholes: retornos normais e preços log-normais, sempre positivos.</p>
      <Formula tex={String.raw`dS_t = \mu S_t\,dt + \sigma S_t\,dW_t \quad\Rightarrow\quad S_{t+\Delta} = S_t\,\exp\!\Big[\big(\mu - \tfrac{\sigma^2}{2}\big)\Delta + \sigma\sqrt{\Delta}\,Z\Big]`} where={[[String.raw`S_t`, "preço do ativo (o dólar, por exemplo) na data t"], [String.raw`\mu`, "drift; na medida neutra ao risco, para câmbio, é r_doméstico − r_externo"], [String.raw`\sigma`, "volatilidade anual"], [String.raw`W_t`, "movimento browniano: o choque aleatório acumulado"], [String.raw`\Delta`, "tamanho do passo, em anos"], [String.raw`Z`, "sorteio de uma normal padrão"]]} />
      <CodeSnippet name="simulate_gbm" caption="trajetórias de GBM com a solução exata" />

      <h2>3. Hull-White: a taxa curta com reversão à média</h2>
      <p>
        Para juros, o GBM não serve: taxas não crescem indefinidamente, tendem a voltar a um patamar. O
        <strong> Hull-White de 1 fator</strong> modela a taxa curta com reversão à média e um termo dependente do
        tempo que faz o modelo <strong>reprecificar exatamente a curva de juros de hoje</strong>.
      </p>
      <Formula tex={String.raw`dr_t = \big(\theta(t) - a\,r_t\big)\,dt + \sigma\,dW_t`} where={[[String.raw`r_t`, "taxa curta (instantânea), em capitalização contínua"], [String.raw`a`, "velocidade de reversão à média: quanto maior, mais rápido a taxa volta"], [String.raw`\theta(t)`, "termo de deriva calibrado para reproduzir a curva de juros inicial"], [String.raw`\sigma`, "volatilidade da taxa curta, em pontos por ano (normal, não log-normal)"]]} />
      <p>A grande vantagem prática: o preço de um zero-cupom em qualquer data futura tem fórmula fechada, então não é preciso simular dentro da simulação.</p>
      <Formula tex={String.raw`P(t,T) = A(t,T)\,e^{-B(t,T)\,r_t}, \qquad B(t,T) = \frac{1 - e^{-a(T-t)}}{a}`} where={[[String.raw`P(t,T)`, "preço em t de R$ 1 pago em T"], [String.raw`A(t,T)`, "termo que depende só da curva inicial e dos parâmetros"], [String.raw`B(t,T)`, "sensibilidade do zero-cupom à taxa curta, parecida com uma duration"]]} />
      <CodeSnippet name="simulate_hull_white" caption="taxa curta e sua integral" />
      <CodeSnippet name="hw_zero_bond" caption="zero-cupom fechado no Hull-White" />
      <Callout title="Taxas negativas e volatilidade normal">
        Como a volatilidade é normal (em pontos), o Hull-White permite taxas negativas. Isso foi visto como defeito
        por muito tempo e virou vantagem quando juros negativos apareceram na Europa e no Japão.
      </Callout>

      <h2>4. HJM: modelando a curva inteira</h2>
      <p>
        O arcabouço de Heath, Jarrow e Morton modela diretamente as <strong>taxas a termo</strong> de todos os
        prazos, e não só a taxa curta. A descoberta central: para não haver arbitragem, o drift das taxas a termo é
        totalmente determinado pela sua volatilidade.
      </p>
      <Formula tex={String.raw`df(t,T) = \alpha(t,T)\,dt + \sigma(t,T)\,dW_t, \qquad \alpha(t,T) = \sigma(t,T)\int_t^T \sigma(t,u)\,du`} where={[[String.raw`f(t,T)`, "taxa a termo instantânea, vista em t, para a data T"], [String.raw`\sigma(t,T)`, "volatilidade da taxa a termo do prazo T — a escolha que define o modelo"], [String.raw`\alpha(t,T)`, "drift: imposto pela condição de não arbitragem, não é livre"], [String.raw`W_t`, "movimento browniano (um ou vários fatores)"]]} />
      <ul>
        <li>O <strong>Hull-White é um caso particular do HJM</strong>, com <M>{String.raw`\sigma(t,T) = \sigma\,e^{-a(T-t)}`}</M>.</li>
        <li>Com vários fatores, o HJM gera movimentos de nível, inclinação e curvatura da curva — essencial para produtos que dependem da forma da curva.</li>
        <li>O custo: em geral o HJM não é markoviano, então a simulação é mais pesada. Na prática usam-se versões com estrutura especial ou o LMM (Libor Market Model), seu primo em tempo discreto.</li>
      </ul>

      <h2>5. Laboratório</h2>
      <PathsLab />
      <Callout title="O que observar">
        <ul>
          <li>No GBM o leque se abre como <M>{String.raw`\sqrt t`}</M> e é assimétrico (log-normal): a cauda de alta é mais longa.</li>
          <li>No Hull-White a reversão à média “fecha” o leque: aumente <M>a</M> e veja as faixas pararem de crescer.</li>
          <li>A checagem compara a simulação com o valor teórico. No Hull-White, a média dos fatores de desconto simulados reproduz o zero-cupom da curva de hoje.</li>
          <li>Na tabela de convergência, o erro padrão cai cerca de 3,2 vezes (√10) a cada 10 vezes mais trajetórias.</li>
        </ul>
      </Callout>
    </>
  );
}

function PathsLab() {
  const [p, setP] = useState({ model: "hw" as "gbm" | "hw", maturity: 5, s0: 5, drift: 0.04, sigma: 0.02, r0: 0.14, a: 0.15, n_paths: 10_000, seed: 7 });
  const set = <K extends keyof typeof p>(k: K) => (v: (typeof p)[K]) => setP({ ...p, [k]: v });
  const { data, error } = useCompute<PathsResp>("/xva/paths", p, 300);
  const isHw = p.model === "hw";
  const fmtY = (v: number) => (isHw ? fmtPct(v, 1) : fmtNum(v, 2));

  const rows = data?.times.map((t, i) => ({
    t,
    band90: [data.bands.p5[i], data.bands.p95[i]],
    band50: [data.bands.p25[i], data.bands.p75[i]],
    p50: data.bands.p50[i],
    ...Object.fromEntries(data.samples.map((s, j) => [`s${j}`, s[i]])),
  }));

  return (
    <Lab title="Simule trajetórias">
      <div className="grid">
        <SelectField label="Modelo" value={p.model}
          onChange={(v) => setP({ ...p, model: v, sigma: v === "hw" ? 0.02 : 0.15 })}
          options={[["hw", "Hull-White (taxa curta)"], ["gbm", "GBM (dólar)"]]} />
        <NumField label="Horizonte (anos)" value={p.maturity} onChange={set("maturity")} step={1} min={0.5} max={30} />
        {isHw ? (
          <>
            <NumField label="Taxa inicial (base 252)" percent value={p.r0} onChange={set("r0")} step={0.25} />
            <NumField label="Reversão à média a" value={p.a} onChange={set("a")} step={0.05} min={0.01} />
            <NumField label="Volatilidade σ" percent value={p.sigma} onChange={set("sigma")} step={0.25} />
          </>
        ) : (
          <>
            <NumField label="Preço inicial" value={p.s0} onChange={set("s0")} step={0.1} />
            <NumField label="Drift μ" percent value={p.drift} onChange={set("drift")} step={0.5} />
            <NumField label="Volatilidade σ" percent value={p.sigma} onChange={set("sigma")} step={1} />
          </>
        )}
        <NumField label="Trajetórias" value={p.n_paths} onChange={set("n_paths")} step={1000} min={100} max={50000} />
        <NumField label="Semente" value={p.seed} onChange={set("seed")} />
      </div>
      {error && <p className="error">{error}</p>}
      {data && rows && (
        <>
          <div className="chart-title" style={{ marginTop: 14 }}>{isHw ? "Taxa curta simulada (contínua)" : "Dólar simulado"}</div>
          <div className="chart-sub">Faixas: percentis 5–95 e 25–75 em cada data. Linhas finas: 12 trajetórias individuais.</div>
          <Legend items={[
            { label: "Faixa 5–95%", color: "color-mix(in srgb, var(--series-1) 18%, transparent)", box: true },
            { label: "Faixa 25–75%", color: "color-mix(in srgb, var(--series-1) 38%, transparent)", box: true },
            { label: "Mediana", color: "var(--series-1)" },
            { label: "Trajetórias", color: "var(--axis)" },
          ]} />
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="t" type="number" domain={[0, "dataMax"]} tickFormatter={(v) => `${fmtNum(v, 1)}a`} {...axisProps} />
              <YAxis tickFormatter={fmtY} {...axisProps} width={56} domain={["auto", "auto"]} />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as (typeof rows)[number];
                return <TooltipBox title={`${fmtNum(d.t, 2)} anos`} rows={[
                  { label: "P95", value: fmtY(d.band90[1]) },
                  { label: "P75", value: fmtY(d.band50[1]) },
                  { label: "Mediana", value: fmtY(d.p50), color: "var(--series-1)" },
                  { label: "P25", value: fmtY(d.band50[0]) },
                  { label: "P5", value: fmtY(d.band90[0]) },
                ]} />;
              }} />
              <Area dataKey="band90" stroke="none" fill="var(--series-1)" fillOpacity={0.14} isAnimationActive={false} />
              <Area dataKey="band50" stroke="none" fill="var(--series-1)" fillOpacity={0.26} isAnimationActive={false} />
              {data.samples.map((_, j) => (
                <Line key={j} dataKey={`s${j}`} stroke="var(--axis)" strokeWidth={1} dot={false} isAnimationActive={false} />
              ))}
              <Line dataKey="p50" stroke="var(--series-1)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>

          <h3>Checagem: simulação × teoria</h3>
          <div className="stats">
            <Stat label="Grandeza checada" value={<span style={{ fontSize: 16 }}>{data.check.label}</span>} />
            <Stat label="Valor analítico" value={fmtNum(data.check.analytic, 4)} />
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th className="num">Trajetórias</th><th className="num">Estimativa</th><th className="num">Erro padrão</th><th className="num">Diferença para o analítico</th></tr></thead>
              <tbody>
                {data.check.convergence.map((c) => (
                  <tr key={c.n}>
                    <td className="num">{fmtNum(c.n, 0)}</td>
                    <td className="num">{fmtNum(c.estimate, 4)}</td>
                    <td className="num">{fmtNum(c.std_error, 4)}</td>
                    <td className="num">{fmtNum(c.estimate - data.check.analytic, 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Lab>
  );
}
