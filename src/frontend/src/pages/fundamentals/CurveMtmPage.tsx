import { useState } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { Callout, Formula, Lab, Legend, NumField, Stat } from "../../components/ui";
import { fmtCompact, fmtMoney, fmtNum, fmtPct } from "../../format";
import BondLab from "./BondLab";

type FloatingResp = {
  cdi_factor: number; curve: number; mtm: number; unrealized: number;
  profile: { spread: number; mtm: number; curve: number }[];
};

export default function CurveMtmPage() {
  return (
    <>
      <h1>Na curva × a mercado</h1>
      <p className="lead">
        “Quanto vale esta posição?” tem duas respostas legítimas. Entender a diferença — e por que ela é enorme
        para um prefixado e quase nula para um pós-fixado — resolve boa parte da confusão sobre apreçamento.
      </p>

      <h2>1. As duas perguntas</h2>
      <div className="grid-2">
        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Na curva (accrual)</h3>
          <p>
            O valor parte do preço pago e cresce todo dia pelas <strong>taxas do contrato</strong>. O mercado não
            entra na conta: só o tempo e os indexadores já realizados.
          </p>
          <Formula tex={String.raw`V^{\text{curva}}_t = P_0\,(1 + y_0)^{t}`} where={[[String.raw`V^{\text{curva}}_t`, "valor na curva na data t"], [String.raw`P_0`, "preço pago na compra (ou valor emprestado)"], [String.raw`y_0`, "taxa contratada (taxa efetiva da operação), ao ano"], [String.raw`t`, "tempo decorrido, em anos (dias úteis ÷ 252)"]]} />
          <p style={{ marginBottom: 0 }}>Pergunta: <em>quanto o contrato me deve hoje, pelas regras dele?</em></p>
        </div>
        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>A mercado (MTM)</h3>
          <p>
            Os fluxos <strong>futuros</strong> são projetados e trazidos a valor presente pelas <strong>taxas de
            mercado de hoje</strong>. Se o mercado muda, o valor muda.
          </p>
          <Formula tex={String.raw`V^{\text{MTM}}_t = \sum_{j} \frac{\mathbb{E}_t[CF_j]}{(1 + y^{\text{mercado}}_{t,j})^{\tau_j}}`} where={[[String.raw`V^{\text{MTM}}_t`, "valor a mercado na data t"], [String.raw`CF_j`, "fluxo de caixa futuro j (fixo ou projetado pelo indexador)"], [String.raw`\mathbb{E}_t[\cdot]`, "projeção com a informação de hoje, por exemplo o CDI implícito no DI futuro"], [String.raw`y^{\text{mercado}}_{t,j}`, "taxa de mercado de hoje para o prazo do fluxo j"], [String.raw`\tau_j`, "prazo até o fluxo j, em anos"]]} />
          <p style={{ marginBottom: 0 }}>Pergunta: <em>por quanto eu encerraria ou venderia esta posição agora?</em></p>
        </div>
      </div>
      <p>
        A diferença entre os dois é a <strong>marcação</strong> (resultado não realizado). No vencimento ela some:
        curva e mercado convergem para o mesmo valor final.
      </p>

      <h2>2. O que “na curva” significa em cada tipo de instrumento</h2>
      <p>
        A sua intuição — “só faz sentido falar em curva para o que recebe CDI” — tem um fundo correto, mas
        invertido: é justamente no pós-fixado que <strong>curva e mercado quase coincidem</strong>, porque o
        indexador se ajusta todo dia. A distância entre os dois vem sempre da parte <strong>fixa</strong> do
        contrato.
      </p>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Instrumento</th><th>Valor na curva</th><th>Valor a mercado</th><th>De onde vem a marcação</th></tr></thead>
          <tbody>
            <tr><td><strong>Prefixado</strong> (LTN, CDB pré, crédito pré)</td><td>Preço pago corrigido pela taxa contratada</td><td>Fluxo fixo descontado pela taxa pré de mercado</td><td>Toda a variação da taxa pré — marcação grande</td></tr>
            <tr><td><strong>Pós-fixado em CDI</strong> (CDB % CDI, LF, capital de giro)</td><td>Principal × CDI acumulado × spread contratado</td><td>CDI futuro projetado e descontado pela mesma curva: os dois se cancelam; sobra o spread</td><td>Só a mudança do spread de crédito — marcação pequena</td></tr>
            <tr><td><strong>Selic</strong> (LFT)</td><td>VNA (Selic acumulada)</td><td>VNA × cotação de mercado (ágio ou deságio)</td><td>Só o ágio/deságio sobre a Selic</td></tr>
            <tr><td><strong>IPCA</strong> (NTN-B)</td><td>VNA corrigido pelo IPCA × taxa real contratada</td><td>Fluxos descontados pela taxa real de mercado</td><td>A variação do juro real — marcação grande</td></tr>
            <tr><td><strong>Swap DI × pré</strong></td><td>Cada ponta corrigida pela sua taxa contratada (conceito gerencial e de registro)</td><td>Ponta CDI ≈ curva; ponta pré descontada pela taxa de mercado</td><td>Só a ponta pré — veja <Link to="/fundamentos/derivativos">Derivativos</Link></td></tr>
            <tr><td><strong>Opção</strong></td><td>Não existe: não há taxa contratada a acumular</td><td>Prêmio de mercado ou modelo (volatilidade, preço do ativo, prazo)</td><td>Tudo</td></tr>
          </tbody>
        </table>
      </div>

      <h2>3. Laboratório: prefixado</h2>
      <BondLab title="Um prefixado na curva e a mercado" />
      <Callout title="O que observar">
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Com alta de juros, o MTM cai abaixo da curva no dia do choque e depois converge para o valor de face (<em>pull to par</em>).</li>
          <li>Aumente o prazo para 10 anos: o mesmo choque produz uma marcação muito maior (duration maior).</li>
        </ul>
      </Callout>

      <h2>4. Laboratório: pós-fixado em CDI</h2>
      <p>
        Um CDB ou letra financeira que paga CDI + spread. O CDI já realizado entra igual nas duas visões, e o CDI
        futuro é projetado pela curva de DI futuro e descontado por ela mesma — os dois efeitos se anulam. O que
        resta para marcar é o <strong>spread</strong>: se o mercado passa a exigir um spread maior desse emissor, o
        papel vale menos.
      </p>
      <Formula tex={String.raw`V^{\text{MTM}}_t = V^{\text{curva}}_t \cdot \left(\frac{1 + s_0}{1 + s^{\text{mercado}}_t}\right)^{(T-t)}, \qquad V^{\text{curva}}_t = N \cdot F^{\text{CDI}}_{0,t} \cdot (1 + s_0)^{t}`} where={[[String.raw`N`, "valor aplicado (principal)"], [String.raw`F^{\text{CDI}}_{0,t}`, "fator do CDI acumulado da emissão até hoje"], [String.raw`s_0`, "spread contratado sobre o CDI, ao ano"], [String.raw`s^{\text{mercado}}_t`, "spread que o mercado exige hoje para o mesmo emissor e prazo"], [String.raw`T - t`, "prazo restante, em anos"]]} />
      <FloatingLab />
      <Callout title="O que observar">
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Com o spread de mercado igual ao contratado, MTM = curva, qualquer que seja o CDI.</li>
          <li>Mude o CDI realizado: curva e MTM sobem juntos, e a marcação quase não muda.</li>
          <li>Compare com o prefixado: lá, a marcação reage à taxa pré inteira; aqui, só ao spread de crédito, que se move bem menos. Uma alta de 200 bps no CDI não marca nada neste papel.</li>
        </ul>
      </Callout>

      <p>
        Onde cada visão é usada — contabilidade, carteiras, preços — está nas próximas páginas:
        {" "}<Link to="/fundamentos/derivativos">Derivativos</Link>, <Link to="/fundamentos/contabil">Contabilidade e preços</Link>,
        {" "}<Link to="/fundamentos/carteiras">Carteiras</Link> e <Link to="/fundamentos/instrumentos">Catálogo de instrumentos</Link>.
      </p>
    </>
  );
}

function FloatingLab() {
  const [p, setP] = useState({
    notional: 1_000_000, total_du: 756, elapsed_du: 252, cdi_realized: 0.14, spread_contract: 0.01, spread_market: 0.015,
  });
  const set = (k: keyof typeof p) => (v: number) => setP({ ...p, [k]: v });
  const { data, error } = useCompute<FloatingResp>("/valuation/floating", p);

  return (
    <Lab title="Um CDI + spread na curva e a mercado">
      <div className="grid">
        <NumField label="Valor aplicado" value={p.notional} onChange={set("notional")} step={100000} />
        <NumField label="Prazo total (DU)" value={p.total_du} onChange={set("total_du")} step={63} min={1} />
        <NumField label="Dias úteis decorridos" value={p.elapsed_du} onChange={set("elapsed_du")} step={21} min={0} />
        <NumField label="CDI médio realizado" percent value={p.cdi_realized} onChange={set("cdi_realized")} step={0.25} />
        <NumField label="Spread contratado" percent value={p.spread_contract} onChange={set("spread_contract")} step={0.1} />
        <NumField label="Spread de mercado hoje" percent value={p.spread_market} onChange={set("spread_market")} step={0.1} />
      </div>
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <div className="stats">
            <Stat label="Fator CDI acumulado" value={fmtNum(data.cdi_factor, 4)} />
            <Stat label="Na curva" value={fmtMoney(data.curve)} />
            <Stat label="A mercado" value={fmtMoney(data.mtm)} />
            <Stat label="Marcação" value={<span className={data.unrealized < 0 ? "bad" : "good"}>{fmtMoney(data.unrealized)}</span>}
              sub={`${fmtPct(data.unrealized / data.curve, 2)} do valor na curva`} />
          </div>
          <div className="chart-title">Valor a mercado conforme o spread que o mercado exige hoje</div>
          <div className="chart-sub">A curva não depende do spread de mercado; a linha vertical marca o spread informado.</div>
          <Legend items={[
            { label: "Na curva", color: "var(--series-1)" },
            { label: "A mercado", color: "var(--series-2)" },
          ]} />
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data.profile} margin={{ top: 10, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="spread" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v) => fmtPct(v, 1)} {...axisProps} />
              <YAxis tickFormatter={fmtCompact} {...axisProps} width={64} domain={["auto", "auto"]} />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as FloatingResp["profile"][number];
                return <TooltipBox title={`Spread de mercado ${fmtPct(d.spread, 2)}`} rows={[
                  { label: "Curva", value: fmtMoney(d.curve), color: "var(--series-1)" },
                  { label: "Mercado", value: fmtMoney(d.mtm), color: "var(--series-2)" },
                ]} />;
              }} />
              <ReferenceLine x={p.spread_market} stroke="var(--text-2)" strokeDasharray="4 3" />
              <Line dataKey="curve" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="mtm" stroke="var(--series-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
    </Lab>
  );
}
