import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Star } from "lucide-react";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SurveyDashboard } from "@/components/satisfaction/SurveyDashboard";
import { SurveyList } from "@/components/satisfaction/SurveyList";
import { NewSurveyDialog } from "@/components/satisfaction/NewSurveyDialog";

export const Route = createFileRoute("/_app/pesquisa-satisfacao")({
  head: () => ({
    meta: [
      { title: "Pesquisa de satisfação — Gestão Cordial" },
      {
        name: "description",
        content:
          "Colete e acompanhe avaliações dos clientes sobre o atendimento dos corretores.",
      },
    ],
  }),
  component: GuardedPage,
});

function GuardedPage() {
  return (
    <RequireModuleAccess module="pesquisa_satisfacao">
      <Page />
    </RequireModuleAccess>
  );
}

function Page() {
  const [tab, setTab] = useState("dashboard");
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-700">
            <Star className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-black tracking-tight sm:text-2xl">
              Pesquisa de satisfação
            </h1>
            <p className="truncate text-xs text-muted-foreground sm:text-sm">
              Avaliações dos clientes sobre o atendimento dos corretores.
            </p>
          </div>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="shrink-0">
          <Plus className="mr-2 size-4" /> Nova pesquisa
        </Button>
      </header>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="dashboard" className="flex-1 sm:flex-initial">
            Painel
          </TabsTrigger>
          <TabsTrigger value="links" className="flex-1 sm:flex-initial">
            Links enviados
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-0">
          <SurveyDashboard />
        </TabsContent>
        <TabsContent value="links" className="mt-0">
          <SurveyList />
        </TabsContent>
      </Tabs>

      <NewSurveyDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
