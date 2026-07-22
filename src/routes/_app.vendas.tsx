import { createFileRoute } from "@tanstack/react-router";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { ReceiptText } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptySalesState } from "@/components/vendas/EmptySalesState";
import { SaleDetailsDrawer } from "@/components/vendas/SaleDetailsDrawer";
import { SaleForm } from "@/components/vendas/SaleForm";
import { SaleRecordCard, SaleRecordSkeleton } from "@/components/vendas/SaleRecordCard";
import { SalesFilters } from "@/components/vendas/SalesFilters";
import { SalesHeader } from "@/components/vendas/SalesHeader";
import { SalesKpiCards } from "@/components/vendas/SalesKpiCards";
import { useSales, uploadSaleDocument } from "@/hooks/useSales";
import { useSession } from "@/lib/auth-mock";
import { useApp, useFiltered } from "@/store/app-store";
import { DEFAULT_SALES_FILTERS } from "@/types/sale";
import type { AgencyId } from "@/lib/mock/data";
import type { SaleRecord, SaleRecordInput, SalesFiltersState } from "@/types/sale";

export const Route = createFileRoute("/_app/vendas")({
  head: () => ({ meta: [{ title: "Vendas — Gestão Cordial" }] }),
  component: GuardedPage,
});

function GuardedPage() {
  return (
    <RequireModuleAccess module="vendas">
      <Page />
    </RequireModuleAccess>
  );
}

function Page() {
  const session = useSession();
  const isAdmin = session?.perfil === "admin_owner";
  const agency = useApp((state) => state.agency);
  const imoveis = useFiltered(useApp((state) => state.imoveis));
  const corretores = useFiltered(useApp((state) => state.corretores));

  const {
    sales,
    kpis,
    isLoading,
    isError,
    error,
    isKpisLoading,
    isKpisError,
    createSale,
    updateSale,
    cancelSale,
    openContract,
    setPaymentPaid,
    isCreating,
    isUpdating,
  } = useSales();

  const [filters, setFilters] = useState<SalesFiltersState>(DEFAULT_SALES_FILTERS);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null);
  const [editingSale, setEditingSale] = useState<SaleRecord | null>(null);

  const scopedSales = useMemo(
    () => (agency === "todas" ? sales : sales.filter((s) => s.imobiliaria === agency)),
    [sales, agency],
  );

  const filteredRecords = useMemo(
    () => filterSales(scopedSales, filters, search),
    [scopedSales, filters, search],
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

  async function handleCancelSale(sale: SaleRecord) {
    try {
      await cancelSale(sale.id);
      toast.success("Venda cancelada.");
      setDetailsOpen(false);
      setSelectedSale(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível cancelar a venda.");
    }
  }

  async function handleReplaceContract(sale: SaleRecord) {
    // Reuses the edit flow — user can attach a new contract in the form
    openEditForm(sale);
  }

  async function handleOpenContract() {
    if (!selectedSale?.contractFilePath) {
      toast.error("Contrato não disponível.");
      return;
    }
    try {
      await openContract(selectedSale.contractFilePath);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível abrir o contrato.");
    }
  }

  async function handleSubmit(
    input: SaleRecordInput,
    files: { contract?: File; support?: File },
    id?: string,
  ) {
    try {
      let finalInput: SaleRecordInput = { ...input };

      if (files.contract) {
        const folder = id ?? "new";
        const path = await uploadSaleDocument(files.contract, folder);
        finalInput = {
          ...finalInput,
          contractFilePath: path,
          contractFileName: files.contract.name,
        };
      }

      if (files.support) {
        finalInput = {
          ...finalInput,
          supportingDocumentFileName: files.support.name,
        };
      }

      let savedId = id;
      if (id) {
        await updateSale({ id, input: finalInput });
        toast.success("Venda atualizada.");
      } else {
        const created = await createSale(finalInput);
        savedId = (created as { id?: string } | undefined)?.id;
        toast.success("Venda registrada.");
      }

      // Persist supporting document as a real attachment so it's actually accessible.
      if (files.support && savedId) {
        try {
          const path = await uploadSaleDocument(files.support, savedId);
          await addAttachment({
            saleId: savedId,
            filePath: path,
            fileName: files.support.name,
            mimeType: files.support.type || null,
            sizeBytes: files.support.size ?? null,
          });
        } catch (err) {
          toast.error(
            err instanceof Error ? err.message : "Não foi possível anexar o documento auxiliar.",
          );
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível salvar a venda.";
      toast.error(message);
      throw err;
    }
  }


  const isSaving = isCreating || isUpdating;

  return (
    <>
      <div className="mx-auto w-full max-w-[84rem] space-y-4 pb-3 sm:space-y-5">
        <SalesHeader onCreate={openCreateForm} />
        <SalesKpiCards
          kpis={kpis}
          showAverageTicket={isAdmin}
          isLoading={isKpisLoading}
          isUnavailable={isKpisError}
        />
        <SalesFilters
          filters={filters}
          onFiltersChange={setFilters}
          search={search}
          onSearchChange={setSearch}
        />

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-4 px-1">
            <h2 className="text-lg font-black tracking-[-0.02em] text-foreground sm:text-xl">
              Histórico de vendas
            </h2>
            <p
              className="inline-flex shrink-0 items-center gap-2 text-xs font-bold text-foreground/52"
              aria-live="polite"
            >
              <ReceiptText className="size-4 text-primary/65" aria-hidden="true" />
              {isLoading
                ? "Carregando registros"
                : `${filteredRecords.length} registro${filteredRecords.length === 1 ? "" : "s"}`}
            </p>
          </div>

          {isLoading ? (
            <div className="space-y-3" role="status" aria-label="Carregando vendas">
              <span className="sr-only">Carregando vendas…</span>
              <SaleRecordSkeleton />
              <SaleRecordSkeleton />
            </div>
          ) : isError ? (
            <section
              className="rounded-[1.5rem] border border-rose-500/15 bg-white/[0.66] p-6 text-center shadow-[0_18px_46px_-36px_rgba(23,27,33,0.4)]"
              role="alert"
            >
              <h3 className="text-lg font-black tracking-tight text-rose-700">
                Erro ao carregar vendas
              </h3>
              <p className="mx-auto mt-2 max-w-lg text-sm font-medium leading-6 text-foreground/58">
                {error instanceof Error ? error.message : "Tente novamente em instantes."}
              </p>
            </section>
          ) : scopedSales.length === 0 ? (
            <EmptySalesState onCreate={openCreateForm} />
          ) : filteredRecords.length === 0 ? (
            <section className="rounded-[1.5rem] border border-white/70 bg-white/[0.64] p-6 text-center shadow-[0_18px_46px_-36px_rgba(23,27,33,0.4)]">
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
        isSaving={isSaving}
      />
      <SaleDetailsDrawer
        sale={selectedSale}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        onEdit={openEditForm}
        onReplaceContract={handleReplaceContract}
        onCancel={handleCancelSale}
        onOpenContract={handleOpenContract}
        onMarkPaymentPaid={(paymentId, paid) =>
          setPaymentPaid({ id: paymentId, paid }).catch(() => undefined)
        }
      />
    </>
  );
}

function filterSales(records: SaleRecord[], filters: SalesFiltersState, search: string) {
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
          sale.ownerName,
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
    const matchesPeriod = filters.period === "todos" || isCurrentMonth(sale.saleDate);
    const matchesContract =
      filters.contract === "todos" ||
      (filters.contract === "com_contrato"
        ? Boolean(sale.contractFilePath)
        : !sale.contractFilePath);
    const matchesStatus =
      filters.status === "todos" ||
      (filters.status === "concluidas"
        ? sale.saleStatus === "concluida"
        : sale.saleStatus === "em_analise" || sale.documentStatus === "em_analise");

    return matchesPeriod && matchesContract && matchesStatus;
  });

  return [...filtered].sort((a, b) => {
    if (filters.sort === "maior_valor") return b.saleValue - a.saleValue;
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
