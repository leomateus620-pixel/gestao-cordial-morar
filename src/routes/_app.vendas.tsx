import { createFileRoute } from "@tanstack/react-router";
import { FilePlus2, History, ReceiptText } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptySalesState } from "@/components/vendas/EmptySalesState";
import { SaleDetailsDrawer } from "@/components/vendas/SaleDetailsDrawer";
import { SaleForm } from "@/components/vendas/SaleForm";
import { SaleRecordCard } from "@/components/vendas/SaleRecordCard";
import { SalesFilters } from "@/components/vendas/SalesFilters";
import { SalesKpiCards } from "@/components/vendas/SalesKpiCards";
import { buildSaleRecords, getSalesKpis } from "@/services/sales";
import { useApp, useFiltered } from "@/store/app-store";
import type { AgencyId } from "@/lib/mock/data";
import type { SaleRecord, SaleRecordInput, SalesFilter } from "@/types/sale";

export const Route = createFileRoute("/_app/vendas")({
  head: () => ({ meta: [{ title: "Vendas — Gestão Cordial" }] }),
  component: Page,
});

function Page() {
  const agency = useApp((state) => state.agency);
  const vendas = useFiltered(useApp((state) => state.vendas));
  const imoveis = useFiltered(useApp((state) => state.imoveis));
  const contratos = useFiltered(useApp((state) => state.contratos));
  const clientes = useFiltered(useApp((state) => state.clientes));
  const corretores = useFiltered(useApp((state) => state.corretores));
  const addVenda = useApp((state) => state.addVenda);
  const updateVenda = useApp((state) => state.updateVenda);
  const cancelVenda = useApp((state) => state.cancelVenda);

  const [filter, setFilter] = useState<SalesFilter>("todos");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null);
  const [editingSale, setEditingSale] = useState<SaleRecord | null>(null);

  const records = useMemo(
    () =>
      buildSaleRecords({
        vendas,
        imoveis,
        contratos,
        clientes,
        corretores,
      }),
    [vendas, imoveis, contratos, clientes, corretores],
  );

  const kpis = useMemo(() => getSalesKpis(records), [records]);
  const filteredRecords = useMemo(
    () => filterSales(records, filter, search),
    [records, filter, search],
  );

  const defaultAgency: AgencyId = agency === "todas" ? "cordial" : agency;

  function openCreateForm() {
    setEditingSale(null);
    setFormOpen(true);
  }

  function openDetails(sale: SaleRecord) {
    setSelectedSale(sale);
    setDetailsOpen(true);
  }

  function openEditForm(sale: SaleRecord) {
    setDetailsOpen(false);
    setEditingSale(sale);
    setFormOpen(true);
  }

  function handleCancelSale(sale: SaleRecord) {
    cancelVenda(sale.id);
    setDetailsOpen(false);
    setSelectedSale(null);
  }

  async function handleSubmit(input: SaleRecordInput, id?: string) {
    if (id) updateVenda(id, input);
    else addVenda(input);
  }

  return (
    <>
      <section className="relative mb-5 overflow-hidden rounded-[2rem] border border-white/60 bg-white/[0.62] p-5 shadow-[0_22px_60px_-38px_rgba(23,27,33,0.38)] backdrop-blur-xl sm:p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent" />
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-primary ring-1 ring-primary/10">
              <History className="size-3.5" />
              Histórico comercial
            </p>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
              Vendas realizadas
            </h1>
            <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-foreground/60">
              Cadastre imóveis vendidos, anexe contratos e mantenha o histórico comercial
              organizado.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <HeaderChip label="Registro de vendas" />
              <HeaderChip label="Contratos e valores vendidos" />
              <HeaderChip label="Arquivo operacional" />
            </div>
          </div>
          <button
            type="button"
            onClick={openCreateForm}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-black text-primary-foreground shadow-xl shadow-primary/25 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.98] sm:self-start lg:self-auto"
          >
            <FilePlus2 className="size-4" />
            Cadastrar venda
          </button>
        </div>
      </section>

      <div className="space-y-5">
        <SalesKpiCards kpis={kpis} />
        <SalesFilters
          filter={filter}
          onFilterChange={setFilter}
          search={search}
          onSearchChange={setSearch}
        />

        <section className="space-y-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-primary/70">
                Histórico de vendas
              </p>
              <h2 className="text-lg font-black tracking-tight text-foreground">
                Registros comerciais concluídos
              </h2>
            </div>
            <p className="inline-flex items-center gap-2 text-xs font-bold text-foreground/52">
              <ReceiptText className="size-4 text-primary/70" />
              {filteredRecords.length} registro{filteredRecords.length === 1 ? "" : "s"}
            </p>
          </div>

          {records.length === 0 ? (
            <EmptySalesState onCreate={openCreateForm} />
          ) : filteredRecords.length === 0 ? (
            <section className="glass-panel rounded-3xl p-6 text-center">
              <h3 className="text-lg font-black tracking-tight text-foreground">
                Nenhuma venda encontrada
              </h3>
              <p className="mx-auto mt-2 max-w-lg text-sm font-medium leading-6 text-foreground/58">
                Ajuste a busca ou os filtros para localizar comprador, imóvel, endereço, valor ou
                responsável.
              </p>
            </section>
          ) : (
            <div className="space-y-3">
              {filteredRecords.map((sale) => (
                <SaleRecordCard key={sale.id} sale={sale} onOpen={openDetails} />
              ))}
            </div>
          )}
        </section>
      </div>

      <button
        type="button"
        onClick={openCreateForm}
        className="fab-safe-bottom fixed right-4 z-30 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-black text-primary-foreground shadow-2xl shadow-primary/30 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.98] sm:hidden"
      >
        <FilePlus2 className="size-4" />
        Cadastrar
      </button>

      <SaleForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingSale(null);
        }}
        properties={imoveis}
        agents={corretores}
        defaultAgency={defaultAgency}
        initialRecord={editingSale}
        onSubmit={handleSubmit}
      />
      <SaleDetailsDrawer
        sale={selectedSale}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        onEdit={openEditForm}
        onReplaceContract={openEditForm}
        onCancel={handleCancelSale}
      />
    </>
  );
}

function HeaderChip({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-white/64 px-3 py-1.5 text-xs font-bold text-foreground/58 ring-1 ring-white/70">
      {label}
    </span>
  );
}

function filterSales(records: SaleRecord[], filter: SalesFilter, search: string) {
  const query = search.trim().toLowerCase();
  const queryDigits = query.replace(/\D/g, "");

  const searched = query
    ? records.filter((sale) => {
        const haystack = [
          sale.buyerName,
          sale.propertyName,
          sale.propertyAddress,
          sale.propertyNeighborhood,
          sale.propertyCityState,
          sale.responsibleAgent,
          sale.paymentMethod,
          sale.saleStatus,
          sale.documentStatus,
          sale.saleValue.toString(),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        const valueDigits = Math.round(sale.saleValue).toString();
        return (
          haystack.includes(query) || Boolean(queryDigits && valueDigits.includes(queryDigits))
        );
      })
    : records;

  const filtered = searched.filter((sale) => {
    if (filter === "mes") return isCurrentMonth(sale.saleDate);
    if (filter === "com_contrato") return sale.documentStatus === "contrato_anexado";
    if (filter === "sem_contrato") return sale.documentStatus === "contrato_pendente";
    if (filter === "concluidas") return sale.saleStatus === "concluida";
    if (filter === "em_analise") {
      return sale.saleStatus === "em_analise" || sale.documentStatus === "em_analise";
    }
    return true;
  });

  return [...filtered].sort((a, b) => {
    if (filter === "maior_valor") return b.saleValue - a.saleValue;
    return (
      new Date(`${b.saleDate}T12:00:00`).getTime() - new Date(`${a.saleDate}T12:00:00`).getTime()
    );
  });
}

function isCurrentMonth(date: string) {
  const value = new Date(`${date}T12:00:00`);
  const now = new Date();
  return value.getFullYear() === now.getFullYear() && value.getMonth() === now.getMonth();
}
