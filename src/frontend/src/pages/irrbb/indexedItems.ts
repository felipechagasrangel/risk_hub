import type { Column } from "../../components/EditableTable";

/** Posição de balanço com indexador brasileiro, usada nas páginas de risco de base e de ΔNII dinâmico. */
export type Indexer = "pre" | "cdi" | "selic" | "poupanca" | "tr" | "ipca" | "zero";
export type IndexedItem = {
  name: string; side: "asset" | "liability"; amount: number; indexer: Indexer;
  rate: number; pct: number; spread: number; months: number; growth: number;
};

export const INDEXER_LABEL: Record<Indexer, string> = {
  pre: "Prefixado", cdi: "% do CDI", selic: "Selic", poupanca: "Poupança", tr: "TR", ipca: "IPCA", zero: "Sem remuneração",
};

const item = (name: string, side: IndexedItem["side"], amount: number, indexer: Indexer, o: Partial<IndexedItem> = {}): IndexedItem =>
  ({ name, side, amount, indexer, rate: 0, pct: 1, spread: 0, months: 12, growth: 0, ...o });

export const DEFAULT_ITEMS: IndexedItem[] = [
  item("Crédito imobiliário (TR + 10%)", "asset", 2_000, "tr", { spread: 0.10, growth: 0.12 }),
  item("Crédito pós (CDI + 4%)", "asset", 1_500, "cdi", { spread: 0.04, growth: 0.10 }),
  item("LFT", "asset", 1_000, "selic"),
  item("NTN-B (IPCA + 6,5%)", "asset", 800, "ipca", { spread: 0.065 }),
  item("Crédito prefixado", "asset", 1_200, "pre", { rate: 0.22, months: 24, growth: 0.15 }),
  item("Poupança", "liability", 2_500, "poupanca", { growth: 0.03 }),
  item("CDB 100% do CDI", "liability", 2_500, "cdi", { growth: 0.12 }),
  item("Depósitos à vista", "liability", 600, "zero", { growth: 0.02 }),
  item("CDB prefixado", "liability", 600, "pre", { rate: 0.145, months: 12, growth: 0.05 }),
];

export const newItem = () => item("Nova posição", "asset", 100, "cdi");

export const itemColumns = (withGrowth: boolean): Column<IndexedItem>[] => [
  { key: "name", label: "Posição", type: "text", width: 200 },
  { key: "side", label: "Lado", type: "select", width: 90, options: [["asset", "Ativo"], ["liability", "Passivo"]] },
  { key: "amount", label: "Saldo", type: "number", width: 80 },
  { key: "indexer", label: "Indexador", type: "select", width: 130, options: Object.entries(INDEXER_LABEL) as [string, string][] },
  { key: "rate", label: "Taxa pré", type: "percent", width: 76 },
  { key: "pct", label: "% CDI", type: "percent", width: 70 },
  { key: "spread", label: "Spread", type: "percent", width: 70 },
  { key: "months", label: "Prazo pré (meses)", type: "number", width: 80 },
  ...(withGrowth ? [{ key: "growth" as const, label: "Cresc. a.a.", type: "percent" as const, width: 76 }] : []),
];
