import { useState } from "react";
import { useCompute } from "../../api";
import { EditableTable } from "../../components/EditableTable";
import { Link } from "react-router-dom";
import { Callout, Formula, Lab, PassBadge, RegNote, Stat } from "../../components/ui";
import { fmtMoney, fmtPct } from "../../format";

type HQLA = { name: string; amount: number; level: "1" | "2A" | "2B" };
type Flow = { name: string; amount: number; rate: number };
type Resp = {
  hqla: { level1: number; level2a: number; level2b: number; cap_adjustment_2b: number; cap_adjustment_level2: number; total: number };
  outflows: (Flow & { weighted: number })[];
  inflows: (Flow & { weighted: number })[];
  total_outflows: number; total_inflows: number; capped_inflows: number; net_outflows: number;
  lcr: number | null;
};

export default function LCRPage() {
  const [hqla, setHqla] = useState<HQLA[]>([
    { name: "Reservas no Banco Central", amount: 400_000, level: "1" },
    { name: "Títulos públicos federais", amount: 1_200_000, level: "1" },
    { name: "Debêntures AA- ou melhor", amount: 300_000, level: "2A" },
    { name: "Ações do Ibovespa", amount: 200_000, level: "2B" },
  ]);
  const [outflows, setOutflows] = useState<Flow[]>([
    { name: "Depósitos de varejo estáveis", amount: 3_000_000, rate: 0.05 },
    { name: "Depósitos de varejo menos estáveis", amount: 2_000_000, rate: 0.10 },
    { name: "Atacado não financeiro (operacional)", amount: 1_500_000, rate: 0.25 },
    { name: "Atacado financeiro", amount: 800_000, rate: 1.0 },
    { name: "Limites de crédito a empresas", amount: 1_000_000, rate: 0.10 },
  ]);
  const [inflows, setInflows] = useState<Flow[]>([
    { name: "Crédito a empresas vencendo em 30d", amount: 600_000, rate: 0.5 },
    { name: "Aplicações em outros bancos", amount: 300_000, rate: 1.0 },
  ]);
  const { data, error } = useCompute<Resp>("/liquidity/lcr", { hqla, outflows, inflows });

  return (
    <>
      <h1>LCR — Liquidity Coverage Ratio</h1>
      <p className="lead">
        Se começasse hoje uma crise de confiança severa, o banco teria ativos líquidos suficientes
        para sobreviver aos próximos 30 dias sem ajuda?
      </p>

      <h2>1. A fórmula</h2>
      <Formula tex={String.raw`\text{LCR} = \frac{\text{Estoque de HQLA}}{\text{Saídas líquidas de caixa em 30 dias de estresse}} \ge 100\%`} where={[[String.raw`\text{HQLA}`, "ativos líquidos de alta qualidade, após haircuts e limites"], [String.raw`\text{Saídas líquidas}`, "saídas de caixa ponderadas menos entradas ponderadas (limitadas) em 30 dias de estresse"]]} />
      <p>
        O numerador é o “colchão”; o denominador é quanto dinheiro sai num cenário de estresse
        padronizado, que combina um rebaixamento do banco com uma corrida parcial de depósitos.
      </p>
      <RegNote>
        <p>
          O LCR (obrigatório para o S1, conforme a Resolução CMN nº 4.401/2015) e as informações de exposição ao
          risco de liquidez são enviados mensalmente no <Link to="/cadocs#drl">DRL (2160)</Link>: estoque de ativos
          líquidos, saídas e entradas de caixa.
        </p>
      </RegNote>

      <h2>2. O numerador: HQLA</h2>
      <p>
        <strong>High Quality Liquid Assets</strong> são ativos que podem virar caixa rapidamente,
        sem grande perda de valor, mesmo em crise. Têm níveis com descontos (haircuts) e limites:
      </p>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Nível</th><th>Exemplos</th><th className="num">Haircut</th><th>Limite</th></tr></thead>
          <tbody>
            <tr><td>1</td><td>Caixa, reservas no BC, títulos soberanos</td><td className="num">0%</td><td>sem limite</td></tr>
            <tr><td>2A</td><td>Títulos corporativos AA−, covered bonds</td><td className="num">15%</td><td rowSpan={2}>Nível 2 ≤ 40% do total</td></tr>
            <tr><td>2B</td><td>Corporativos A+ a BBB−, ações de índices</td><td className="num">50%</td></tr>
          </tbody>
        </table>
      </div>
      <p>Além disso, o Nível 2B não pode passar de 15% do estoque. Os limites evitam que o colchão dependa de ativos que podem secar justo na crise.</p>

      <h2>3. O denominador: saídas e entradas</h2>
      <p>Cada passivo recebe uma <strong>taxa de saída (run-off)</strong> que reflete sua probabilidade de fugir:</p>
      <Formula tex={String.raw`\text{Saídas líquidas} = \sum_i S_i \cdot r_i \;-\; \min\!\Big(\sum_j E_j \cdot e_j,\; 75\% \cdot \sum_i S_i \cdot r_i\Big)`} where={[[String.raw`S_i`, "saldo do passivo ou compromisso i"], [String.raw`r_i`, "taxa de saída (run-off) de i no estresse"], [String.raw`E_j`, "saldo do recebível j que vence em 30 dias"], [String.raw`e_j`, "taxa de entrada do recebível j"], [String.raw`75\%`, "limite das entradas: no máximo 75% das saídas"]]} />
      <p>
        Depósitos de varejo segurados são “pegajosos” (3–10%); funding de outros bancos foge
        integralmente (100%). As entradas são limitadas a 75% das saídas, de modo que o banco
        sempre precise manter pelo menos 25% das saídas em HQLA.
      </p>

      <h2>4. Laboratório</h2>
      <Lab title="Monte o balanço de liquidez">
        <h3 style={{ marginTop: 0 }}>Ativos líquidos (HQLA)</h3>
        <EditableTable<HQLA>
          rows={hqla} onChange={setHqla}
          newRow={() => ({ name: "Novo ativo", amount: 100_000, level: "1" })}
          columns={[
            { key: "name", label: "Ativo", type: "text" },
            { key: "amount", label: "Valor de mercado", type: "number" },
            { key: "level", label: "Nível", type: "select", options: [["1", "Nível 1"], ["2A", "Nível 2A"], ["2B", "Nível 2B"]], width: 120 },
          ]}
        />
        <h3>Saídas em 30 dias</h3>
        <EditableTable<Flow>
          rows={outflows} onChange={setOutflows}
          newRow={() => ({ name: "Novo passivo", amount: 100_000, rate: 0.1 })}
          columns={[
            { key: "name", label: "Passivo / compromisso", type: "text" },
            { key: "amount", label: "Saldo", type: "number" },
            { key: "rate", label: "Run-off", type: "percent", width: 100 },
          ]}
          computed={data && data.outflows.length === outflows.length ? [{ label: "Saída ponderada", values: data.outflows.map((o) => fmtMoney(o.weighted)) }] : []}
        />
        <h3>Entradas em 30 dias</h3>
        <EditableTable<Flow>
          rows={inflows} onChange={setInflows}
          newRow={() => ({ name: "Nova entrada", amount: 100_000, rate: 0.5 })}
          columns={[
            { key: "name", label: "Recebível", type: "text" },
            { key: "amount", label: "Saldo", type: "number" },
            { key: "rate", label: "Taxa de entrada", type: "percent", width: 100 },
          ]}
          computed={data && data.inflows.length === inflows.length ? [{ label: "Entrada ponderada", values: data.inflows.map((o) => fmtMoney(o.weighted)) }] : []}
        />
        {error && <p className="error">{error}</p>}
        {data && (
          <>
            <div className="stats">
              <Stat label="HQLA após haircuts e limites" value={fmtMoney(data.hqla.total)}
                sub={`N1 ${fmtMoney(data.hqla.level1)} · N2A ${fmtMoney(data.hqla.level2a)} · N2B ${fmtMoney(data.hqla.level2b)}`} />
              <Stat label="Saídas ponderadas" value={fmtMoney(data.total_outflows)} />
              <Stat label="Entradas consideradas" value={fmtMoney(data.capped_inflows)}
                sub={data.capped_inflows < data.total_inflows ? `limitadas a 75% (de ${fmtMoney(data.total_inflows)})` : "abaixo do limite de 75%"} />
              <Stat label="Saídas líquidas" value={fmtMoney(data.net_outflows)} />
              <Stat label="LCR" value={fmtPct(data.lcr, 1)} sub={<PassBadge ok={(data.lcr ?? Infinity) >= 1} label="mínimo 100%" />} />
            </div>
            {(data.hqla.cap_adjustment_2b > 0 || data.hqla.cap_adjustment_level2 > 0) && (
              <p className="muted" style={{ fontSize: 14 }}>
                Ajuste por limites: −{fmtMoney(data.hqla.cap_adjustment_2b)} (2B ≤ 15%) e
                −{fmtMoney(data.hqla.cap_adjustment_level2)} (Nível 2 ≤ 40%).
              </p>
            )}
          </>
        )}
      </Lab>
      <Callout title="O que observar">
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Aumente as ações (Nível 2B) para R$ 2 milhões: o HQLA quase não sobe, por causa do haircut de 50% e do limite de 15%.</li>
          <li>Troque R$ 800 mil de funding interbancário (100%) por depósitos de varejo estáveis (5%): o LCR melhora muito. Por isso bancos disputam varejo.</li>
          <li>Aumente muito as entradas: o LCR para de melhorar quando as entradas chegam a 75% das saídas.</li>
        </ul>
      </Callout>
    </>
  );
}
