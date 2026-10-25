import { useState } from "react";
import { useCompute } from "../../api";
import { EditableTable } from "../../components/EditableTable";
import { Callout, Formula, Lab, PassBadge, Stat } from "../../components/ui";
import { fmtMoney, fmtPct } from "../../format";

type Item = { name: string; amount: number; factor: number };
type Resp = {
  asf: (Item & { weighted: number })[]; rsf: (Item & { weighted: number })[];
  total_asf: number; total_rsf: number; nsfr: number | null;
};

export default function NSFRPage() {
  const [asf, setAsf] = useState<Item[]>([
    { name: "Patrimônio e dívida > 1 ano", amount: 1_500_000, factor: 1.0 },
    { name: "Depósitos de varejo estáveis", amount: 3_000_000, factor: 0.95 },
    { name: "Depósitos de varejo menos estáveis", amount: 2_000_000, factor: 0.90 },
    { name: "Atacado não financeiro < 1 ano", amount: 1_500_000, factor: 0.50 },
    { name: "Atacado financeiro < 6 meses", amount: 800_000, factor: 0.0 },
  ]);
  const [rsf, setRsf] = useState<Item[]>([
    { name: "Caixa e reservas", amount: 400_000, factor: 0.0 },
    { name: "Títulos públicos", amount: 1_200_000, factor: 0.05 },
    { name: "Crédito a empresas < 1 ano", amount: 1_500_000, factor: 0.50 },
    { name: "Financiamento imobiliário (FPR ≤ 35%)", amount: 2_000_000, factor: 0.65 },
    { name: "Outros créditos > 1 ano", amount: 2_500_000, factor: 0.85 },
    { name: "Ativo imobilizado", amount: 300_000, factor: 1.0 },
  ]);
  const { data, error } = useCompute<Resp>("/liquidity/nsfr", { asf, rsf });

  return (
    <>
      <h1>NSFR — Net Stable Funding Ratio</h1>
      <p className="lead">
        O LCR olha 30 dias. O NSFR olha 1 ano e pergunta: os ativos de longo prazo e ilíquidos
        estão financiados por fontes estáveis?
      </p>

      <h2>1. A fórmula</h2>
      <Formula tex={String.raw`\text{NSFR} = \frac{\text{ASF (funding estável disponível)}}{\text{RSF (funding estável requerido)}} = \frac{\sum_i P_i\, f^{\text{ASF}}_i}{\sum_j A_j\, f^{\text{RSF}}_j} \ge 100\%`} where={[[String.raw`\text{ASF}`, "funding estável disponível"], [String.raw`\text{RSF}`, "funding estável requerido"], [String.raw`P_i`, "saldo do passivo ou patrimônio i"], [String.raw`f^{\text{ASF}}_i`, "fator ASF: fração de i que é estável por mais de 1 ano"], [String.raw`A_j`, "saldo do ativo j"], [String.raw`f^{\text{RSF}}_j`, "fator RSF: fração de j que precisa de funding estável"]]} />
      <p>
        Cada <strong>passivo</strong> recebe um fator ASF: quanto dele é confiável por mais de um
        ano (capital = 100%; varejo estável = 95%; funding de bancos de curto prazo = 0%). Cada
        <strong> ativo</strong> recebe um fator RSF: quanto dele precisa de funding estável (caixa =
        0%; crédito de longo prazo = 65–85%; ativos fixos = 100%).
      </p>
      <Callout title="Por que existe">
        Em 2008, vários bancos financiavam carteiras ilíquidas de longo prazo com captação de
        curtíssimo prazo no atacado. Quando esse mercado travou, não havia como rolar a dívida.
        O NSFR limita esse <strong>descasamento estrutural</strong> de prazos e liquidez.
      </Callout>

      <h2>2. Laboratório</h2>
      <Lab title="Compare a estabilidade das fontes e dos usos">
        <h3 style={{ marginTop: 0 }}>Passivos e patrimônio (ASF)</h3>
        <EditableTable<Item>
          rows={asf} onChange={setAsf}
          newRow={() => ({ name: "Novo passivo", amount: 100_000, factor: 0.5 })}
          columns={[
            { key: "name", label: "Fonte de funding", type: "text" },
            { key: "amount", label: "Saldo", type: "number" },
            { key: "factor", label: "Fator ASF", type: "percent", width: 100 },
          ]}
          computed={data && data.asf.length === asf.length ? [{ label: "ASF", values: data.asf.map((r) => fmtMoney(r.weighted)) }] : []}
        />
        <h3>Ativos (RSF)</h3>
        <EditableTable<Item>
          rows={rsf} onChange={setRsf}
          newRow={() => ({ name: "Novo ativo", amount: 100_000, factor: 0.5 })}
          columns={[
            { key: "name", label: "Ativo", type: "text" },
            { key: "amount", label: "Saldo", type: "number" },
            { key: "factor", label: "Fator RSF", type: "percent", width: 100 },
          ]}
          computed={data && data.rsf.length === rsf.length ? [{ label: "RSF", values: data.rsf.map((r) => fmtMoney(r.weighted)) }] : []}
        />
        {error && <p className="error">{error}</p>}
        {data && (
          <div className="stats">
            <Stat label="ASF total" value={fmtMoney(data.total_asf)} />
            <Stat label="RSF total" value={fmtMoney(data.total_rsf)} />
            <Stat label="NSFR" value={fmtPct(data.nsfr, 1)} sub={<PassBadge ok={(data.nsfr ?? Infinity) >= 1} label="mínimo 100%" />} />
          </div>
        )}
      </Lab>
      <Callout title="O que observar">
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Transforme o atacado financeiro em dívida de 2 anos (fator 100%): o NSFR sobe — alongar o passivo custa mais caro, mas dá estabilidade.</li>
          <li>Troque crédito de longo prazo por títulos públicos: o RSF despenca. Liquidez tem custo de oportunidade (rentabilidade menor).</li>
        </ul>
      </Callout>
    </>
  );
}
