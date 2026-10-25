import { useState } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompute } from "../../api";
import { axisProps, gridProps, TooltipBox } from "../../components/chart";
import { Callout, Formula, Lab, Legend, NumField, SelectField, Stat } from "../../components/ui";
import { fmtCompact, fmtMoney, fmtPct } from "../../format";

type SwapResp = {
  legs: { fixed: { curve: number; mtm: number }; cdi: { curve: number; mtm: number } };
  receive_fixed: boolean;
  value_curve: number; value_mtm: number; unrealized: number; dv01: number;
  profile: { rate: number; mtm: number; curve: number }[];
};

export default function DerivativesPage() {
  return (
    <>
      <h1>Apreçamento de derivativos</h1>
      <p className="lead">
        Swaps, futuros, termos e opções não têm “preço pago” que rende uma taxa: o que importa é quanto o
        contrato vale hoje. Por isso, para derivativos, a marcação a mercado é a regra — e “curva” só aparece
        como conceito gerencial.
      </p>

      <h2>1. Derivativo é sempre a valor justo</h2>
      <p>
        Na contabilidade (Resolução CMN nº 4.966/2021, alinhada ao IFRS 9; antes, Circular nº 3.082/2002), todo
        derivativo fica no balanço a <strong>valor justo</strong>, com a variação no resultado. A exceção é a
        <strong> contabilidade de hedge</strong>, que muda <em>onde</em> a variação aparece, não o valor:
      </p>
      <ul>
        <li><strong>Hedge de valor justo</strong>: o item protegido também é ajustado a valor justo pelo risco protegido, e as duas variações se compensam no resultado;</li>
        <li><strong>Hedge de fluxo de caixa</strong>: a parcela efetiva da variação do derivativo vai para o patrimônio líquido e só passa ao resultado junto com o fluxo protegido.</li>
      </ul>
      <Callout title="Então um swap pode ser “marcado na curva”?">
        Contabilmente, não. Mas o “valor na curva” do swap é muito usado na gestão e no registro: é o valor de
        cada ponta corrigida pela <strong>sua própria taxa contratada</strong> até hoje — a ponta CDI pelo CDI
        realizado, a ponta pré pela taxa pré do contrato. A diferença entre esse valor e o MTM é a marcação do swap.
      </Callout>

      <h2>2. Swap DI × pré</h2>
      <p>
        No padrão brasileiro, as duas pontas são corrigidas sobre o mesmo nocional e trocadas só no vencimento.
        Quem recebe pré e paga CDI ganha se o CDI vier abaixo da taxa contratada.
      </p>
      <Formula tex={String.raw`V^{\text{curva}} = N\Big[(1+p)^{d/252} - F^{\text{CDI}}_{0,d}\Big] \qquad V^{\text{MTM}} = N\left[\frac{(1+p)^{T/252}}{(1+y)^{(T-d)/252}} - F^{\text{CDI}}_{0,d}\right]`} where={[[String.raw`N`, "nocional do swap"], [String.raw`p`, "taxa pré contratada, ao ano"], [String.raw`F^{\text{CDI}}_{0,d}`, "fator do CDI acumulado do início até hoje"], [String.raw`d`, "dias úteis decorridos"], [String.raw`T`, "prazo total do swap, em dias úteis"], [String.raw`y`, "taxa pré de mercado (DI futuro) para o prazo restante"]]} />
      <p>
        Repare na <strong>ponta CDI</strong>: ela vale o mesmo nas duas fórmulas. A mercado, o CDI futuro é
        projetado pela curva de DI futuro e descontado pela mesma curva — os dois se cancelam, e sobra o CDI já
        realizado. É isso que a sua intuição captura: o que acompanha o CDI “está sempre na curva”. Toda a
        marcação do swap vem da <strong>ponta pré</strong>, cujo fluxo final é fixo e precisa ser descontado pela
        taxa de hoje.
      </p>
      <SwapLab />
      <Callout title="O que observar">
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Com a taxa de mercado igual à contratada, curva e MTM coincidem.</li>
          <li>Recebendo pré: a alta do DI futuro derruba o MTM (DV01 negativo). Pagando pré, o contrário — é o hedge de um passivo prefixado.</li>
          <li>Mude o CDI realizado: curva e MTM se movem juntos, a marcação não muda.</li>
          <li>Leve os dias decorridos até o prazo total: a marcação some e sobra só o resultado realizado.</li>
        </ul>
      </Callout>

      <h2>3. Futuros (DI1, DOL, índice)</h2>
      <p>
        No futuro não há valor acumulado: a posição é <strong>ajustada todo dia</strong> pela B3, que paga ou
        cobra a diferença entre o preço de ajuste de hoje e o de ontem. Na prática o contrato é “zerado” todo dia
        — o valor a mercado no fim do dia é praticamente nulo, e o resultado já passou pelo caixa.
      </p>
      <Formula tex={String.raw`\text{PU} = \frac{100.000}{(1 + \text{taxa})^{du/252}} \qquad AD_t = \Big(PA_t - PA_{t-1}\,(1+\text{CDI}_{t-1})^{1/252}\Big) \times M \times n`} where={[[String.raw`\text{PU}`, "preço unitário do DI1: o valor presente de 100.000 pontos no vencimento"], [String.raw`\text{taxa}`, "taxa negociada do DI1 para o prazo do contrato"], [String.raw`du`, "dias úteis até o vencimento"], [String.raw`AD_t`, "ajuste diário de uma posição comprada em PU (vendida em taxa)"], [String.raw`PA_t,\ PA_{t-1}`, "preços de ajuste de hoje e de ontem"], [String.raw`\text{CDI}_{t-1}`, "CDI do dia anterior, que corrige o PU de ontem"], [String.raw`M`, "valor do ponto (R$ 1,00 no DI1)"], [String.raw`n`, "número de contratos"]]} />
      <p className="muted" style={{ fontSize: 14 }}>
        Comprado em taxa é vendido em PU: ganha quando a taxa sobe. É assim que tesourarias fazem hedge de carteiras
        prefixadas — o DI futuro é o derivativo de juros mais líquido do Brasil e a base da curva pré usada para
        marcar quase todo o resto.
      </p>

      <h2>4. Termo de moeda (NDF) e swap cambial</h2>
      <p>
        No termo de moeda sem entrega (NDF), compra-se o dólar para uma data futura a um preço fixado hoje. O MTM é
        a diferença entre o termo de mercado e o contratado, trazida a valor presente:
      </p>
      <Formula tex={String.raw`F_t = S_t\,\frac{(1 + y^{\text{pré}})^{du/252}}{1 + c\cdot dc/360} \qquad V^{\text{MTM}} = \frac{N_{\text{US\$}}\,(F_t - K)}{(1 + y^{\text{pré}})^{du/252}}`} where={[[String.raw`F_t`, "taxa a termo de mercado hoje para o vencimento"], [String.raw`S_t`, "dólar à vista"], [String.raw`y^{\text{pré}}`, "taxa pré em reais para o prazo"], [String.raw`c`, "cupom cambial: a taxa de juros em dólar no mercado local (linear, base 360)"], [String.raw`du,\ dc`, "dias úteis e dias corridos até o vencimento"], [String.raw`N_{\text{US\$}}`, "nocional em dólares"], [String.raw`K`, "taxa a termo contratada"]]} />
      <p>
        O swap cambial (dólar + cupom × CDI ou pré) segue a mesma lógica: a ponta em dólar é marcada pela
        variação cambial e pela curva de cupom cambial, e a ponta em reais pela curva pré ou pelo CDI.
      </p>

      <h2>5. Opções</h2>
      <p>
        Opção não tem curva: o prêmio pago não “rende” nada. O valor depende do preço do ativo-objeto, do strike,
        do prazo, dos juros e — o mais importante — da <strong>volatilidade</strong>. Opções listadas com liquidez
        usam o prêmio negociado na B3; as demais, um modelo alimentado pela volatilidade implícita de mercado:
      </p>
      <Formula tex={String.raw`C = S\,N(d_1) - K e^{-rT} N(d_2), \qquad d_{1,2} = \frac{\ln(S/K) + (r \pm \sigma^2/2)\,T}{\sigma\sqrt{T}}`} where={[[String.raw`C`, "prêmio de uma call europeia (Black-Scholes)"], [String.raw`S`, "preço do ativo-objeto"], [String.raw`K`, "preço de exercício (strike)"], [String.raw`r`, "taxa de juros contínua"], [String.raw`T`, "prazo até o vencimento, em anos"], [String.raw`\sigma`, "volatilidade implícita"], [String.raw`N(\cdot)`, "normal padrão acumulada"]]} />
      <ul>
        <li><strong>Câmbio e ações</strong>: Black-Scholes ou Black-76, com superfície de volatilidade por strike e prazo;</li>
        <li><strong>Opções sobre DI e IDI</strong>: modelos sobre a taxa, como o de Bachelier usado na <Link to="/mercado/rwa-sens">calculadora do RWA SENS</Link>;</li>
        <li><strong>Exóticas</strong> (barreira, asiáticas): simulação ou árvores — dados não observáveis empurram para o nível 3 da hierarquia de preços.</li>
      </ul>
      <p className="muted" style={{ fontSize: 14 }}>
        A não linearidade das opções é o que a Curvatura do RWA SENS mede, e a sensibilidade à volatilidade é o
        componente Vega.
      </p>
    </>
  );
}

function SwapLab() {
  const [p, setP] = useState({
    notional: 10_000_000, total_du: 504, elapsed_du: 126, fixed_rate: 0.13, cdi_realized: 0.14, market_rate: 0.145,
    receive_fixed: true,
  });
  const set = (k: keyof typeof p) => (v: number) => setP({ ...p, [k]: v });
  const { data, error } = useCompute<SwapResp>("/valuation/swap", p);

  return (
    <Lab title="Um swap DI × pré na curva e a mercado">
      <div className="grid">
        <SelectField label="Posição" value={p.receive_fixed ? "rf" : "pf"} onChange={(v) => setP({ ...p, receive_fixed: v === "rf" })}
          options={[["rf", "Recebe pré, paga CDI"], ["pf", "Paga pré, recebe CDI"]]} />
        <NumField label="Nocional" value={p.notional} onChange={set("notional")} step={1_000_000} />
        <NumField label="Prazo total (DU)" value={p.total_du} onChange={set("total_du")} step={63} min={1} />
        <NumField label="Dias úteis decorridos" value={p.elapsed_du} onChange={set("elapsed_du")} step={21} min={0} />
        <NumField label="Taxa pré contratada" percent value={p.fixed_rate} onChange={set("fixed_rate")} step={0.25} />
        <NumField label="CDI médio realizado" percent value={p.cdi_realized} onChange={set("cdi_realized")} step={0.25} />
        <NumField label="DI futuro para o prazo restante" percent value={p.market_rate} onChange={set("market_rate")} step={0.25} />
      </div>
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <div className="stats">
            <Stat label="Valor na curva" value={fmtMoney(data.value_curve)} sub="pontas pelas taxas do contrato" />
            <Stat label="Valor a mercado" value={fmtMoney(data.value_mtm)} sub="ponta pré descontada pelo DI futuro" />
            <Stat label="Marcação" value={<span className={data.unrealized < 0 ? "bad" : "good"}>{fmtMoney(data.unrealized)}</span>} />
            <Stat label="DV01" value={fmtMoney(data.dv01)} sub="variação do MTM para +1 bp no DI futuro" />
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Ponta</th><th className="num">Na curva</th><th className="num">A mercado</th><th className="num">Diferença</th></tr></thead>
              <tbody>
                <tr><td>Pré ({fmtPct(p.fixed_rate, 2)})</td><td className="num">{fmtMoney(data.legs.fixed.curve)}</td><td className="num">{fmtMoney(data.legs.fixed.mtm)}</td><td className="num">{fmtMoney(data.legs.fixed.mtm - data.legs.fixed.curve)}</td></tr>
                <tr><td>CDI</td><td className="num">{fmtMoney(data.legs.cdi.curve)}</td><td className="num">{fmtMoney(data.legs.cdi.mtm)}</td><td className="num">{fmtMoney(data.legs.cdi.mtm - data.legs.cdi.curve)}</td></tr>
              </tbody>
            </table>
          </div>
          <div className="chart-title" style={{ marginTop: 16 }}>Valor do swap conforme o DI futuro para o prazo restante</div>
          <div className="chart-sub">A curva não depende do mercado; a linha vertical marca a taxa informada.</div>
          <Legend items={[
            { label: "Na curva", color: "var(--series-1)" },
            { label: "A mercado", color: "var(--series-2)" },
          ]} />
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.profile} margin={{ top: 10, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="rate" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v) => fmtPct(v, 1)} {...axisProps} />
              <YAxis tickFormatter={fmtCompact} {...axisProps} width={64} />
              <ReferenceLine y={0} stroke="var(--axis)" />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as SwapResp["profile"][number];
                return <TooltipBox title={`DI futuro ${fmtPct(d.rate, 2)}`} rows={[
                  { label: "Curva", value: fmtMoney(d.curve), color: "var(--series-1)" },
                  { label: "Mercado", value: fmtMoney(d.mtm), color: "var(--series-2)" },
                ]} />;
              }} />
              <ReferenceLine x={p.market_rate} stroke="var(--text-2)" strokeDasharray="4 3" />
              <Line dataKey="curve" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="mtm" stroke="var(--series-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
    </Lab>
  );
}
