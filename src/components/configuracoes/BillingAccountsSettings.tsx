import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Banknote, Loader2, PlugZap, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  listBillingAccounts,
  releaseBillingAccount,
  runLiquidadosDia,
  saveBillingAccount,
  testBillingConnection,
  type PublicBillingAccount,
} from "@/lib/boleto/boletos.functions";
import { lastBusinessDay, todaySaoPaulo, type Encargos } from "@/lib/boleto/rules";

const fmt = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(iso))
    : "nunca";

function AccountCard({ account }: { account: PublicBillingAccount }) {
  const qc = useQueryClient();
  const test = useServerFn(testBillingConnection);
  const save = useServerFn(saveBillingAccount);
  const release = useServerFn(releaseBillingAccount);
  const liquidados = useServerFn(runLiquidadosDia);
  const [busy, setBusy] = useState<string | null>(null);
  const [apelido, setApelido] = useState(account.apelido);
  const [enc, setEnc] = useState<Encargos>(account.encargos);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [dia, setDia] = useState(() => lastBusinessDay(todaySaoPaulo()));
  const prod = account.ambiente === "producao";
  const refresh = () => qc.invalidateQueries({ queryKey: ["billing-accounts"] });
  async function run(name: string, fn: () => Promise<unknown>) {
    setBusy(name);
    try {
      await fn();
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(null);
    }
  }
  const canRelease =
    prod && account.configurado && Boolean(account.consultaOkEm) && account.ultimoTesteOk === true;
  return (
    <article className="rounded-xl border bg-card p-4">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{account.brand === "morar" ? "Morar" : "Cordial"}</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
          {prod ? "Produção" : "Homologação"}
        </span>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${
            account.emissaoHabilitada
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {prod
            ? account.emissaoHabilitada
              ? "Emissão liberada"
              : "Emissão desligada"
            : "Só testes"}
        </span>
      </header>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Credenciais</dt>
        <dd>
          {account.configurado
            ? "configuradas no servidor"
            : `faltam: ${account.segredosNecessarios.join(", ")}`}
        </dd>
        <dt className="text-muted-foreground">Beneficiário</dt>
        <dd>
          {account.beneficiario ?? "—"} · coop. {account.cooperativa ?? "—"} · posto{" "}
          {account.posto ?? "—"}
        </dd>
        <dt className="text-muted-foreground">Último teste</dt>
        <dd className={account.ultimoTesteOk === false ? "text-destructive" : undefined}>
          {fmt(account.ultimoTesteEm)}
          {account.ultimoTesteMensagem ? ` — ${account.ultimoTesteMensagem}` : ""}
        </dd>
        <dt className="text-muted-foreground">Consulta OK</dt>
        <dd>{fmt(account.consultaOkEm)}</dd>
      </dl>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Token OK não significa cobrança habilitada.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!!busy}
          onClick={() =>
            void run("test", async () => {
              const r = await test({ data: { brand: account.brand, ambiente: account.ambiente } });
              if (r.tokenOk && r.consultaOk) toast.success(r.mensagem);
              else toast.error(r.mensagem);
            })
          }
        >
          {busy === "test" ? <Loader2 className="animate-spin" /> : <PlugZap />}
          Testar conexão
        </Button>
        {prod &&
          (account.emissaoHabilitada ? (
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy}
              onClick={() =>
                void run("off", () =>
                  release({ data: { brand: account.brand, habilitar: false, confirmo: true } }),
                )
              }
            >
              Desligar emissão
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={!!busy || !canRelease}
              onClick={() => setConfirmRelease(true)}
              title={canRelease ? undefined : "Teste a conexão em produção com sucesso primeiro."}
            >
              <ShieldCheck />
              Liberar emissão
            </Button>
          ))}
      </div>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-muted-foreground">Apelido, juros e multa</summary>
        <div className="mt-2 grid gap-2">
          <Label className="text-xs">
            Apelido
            <Input
              value={apelido}
              maxLength={80}
              onChange={(e) => setApelido(e.target.value)}
              className="mt-1"
            />
          </Label>
          <label className="flex items-center gap-2">
            <Switch checked={enc.ativo} onCheckedChange={(v) => setEnc({ ...enc, ativo: v })} />
            Enviar juros e multa ao banco (a partir do dia seguinte ao vencimento)
          </label>
          <div className="grid grid-cols-3 gap-2">
            <Label className="text-xs">
              Juros
              <select
                className="mt-1 h-9 w-full rounded-md border bg-background px-2"
                value={`${enc.tipoJuros ?? "PERCENTUAL"}:${enc.tipoJurosPercentual ?? "MENSAL"}`}
                onChange={(e) => {
                  const [t, p] = e.target.value.split(":");
                  setEnc({
                    ...enc,
                    tipoJuros: t as Encargos["tipoJuros"],
                    tipoJurosPercentual: p as Encargos["tipoJurosPercentual"],
                  });
                }}
              >
                <option value="PERCENTUAL:MENSAL">% ao mês</option>
                <option value="PERCENTUAL:DIARIO">% ao dia</option>
                <option value="VALOR:MENSAL">R$ por dia</option>
              </select>
            </Label>
            <Label className="text-xs">
              Valor dos juros
              <Input
                type="number"
                min={0}
                step="0.01"
                value={enc.juros ?? 0}
                onChange={(e) => setEnc({ ...enc, juros: Number(e.target.value) })}
                className="mt-1"
              />
            </Label>
            <span />
            <Label className="text-xs">
              Multa
              <select
                className="mt-1 h-9 w-full rounded-md border bg-background px-2"
                value={enc.tipoMulta ?? "PERCENTUAL"}
                onChange={(e) =>
                  setEnc({ ...enc, tipoMulta: e.target.value as Encargos["tipoMulta"] })
                }
              >
                <option value="PERCENTUAL">%</option>
                <option value="VALOR">R$</option>
              </select>
            </Label>
            <Label className="text-xs">
              Valor da multa
              <Input
                type="number"
                min={0}
                step="0.01"
                value={enc.multa ?? 0}
                onChange={(e) => setEnc({ ...enc, multa: Number(e.target.value) })}
                className="mt-1"
              />
            </Label>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="w-fit"
            disabled={!!busy}
            onClick={() =>
              void run("save", async () => {
                await save({
                  data: {
                    brand: account.brand,
                    ambiente: account.ambiente,
                    apelido,
                    encargos: enc,
                  },
                });
                toast.success("Conta salva.");
              })
            }
          >
            {busy === "save" && <Loader2 className="animate-spin" />}
            Salvar
          </Button>
        </div>
      </details>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-muted-foreground">
          Conferir pagamentos do dia
        </summary>
        <div className="mt-2 flex items-end gap-2">
          <Label className="text-xs">
            Dia
            <Input
              type="date"
              max={todaySaoPaulo()}
              value={dia}
              onChange={(e) => setDia(e.target.value)}
              className="mt-1"
            />
          </Label>
          <Button
            size="sm"
            variant="outline"
            disabled={!!busy || !account.configurado}
            onClick={() =>
              void run("liq", async () => {
                const r = await liquidados({
                  data: { brand: account.brand, ambiente: account.ambiente, dia },
                });
                toast.success(
                  `${r.itens} pagamento(s) no banco; ${r.conciliados} boleto(s) do Gestão marcados como pagos${r.incompleto ? " (lista parcial)" : ""}.${prod ? "" : " Homologação: nada foi alterado."}`,
                );
              })
            }
          >
            {busy === "liq" && <Loader2 className="animate-spin" />}
            Conferir
          </Button>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Marca só a evidência do banco; a baixa do aluguel continua manual.
        </p>
      </details>
      <AlertDialog open={confirmRelease} onOpenChange={setConfirmRelease}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Liberar boletos reais da {account.brand === "morar" ? "Morar" : "Cordial"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              A conexão será testada de novo agora. Se passar, a administração e a secretaria
              poderão registrar boletos com valor de cobrança.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                void run("release", async () => {
                  await release({
                    data: { brand: account.brand, habilitar: true, confirmo: true },
                  });
                  toast.success("Emissão em produção liberada.");
                })
              }
            >
              Testar e liberar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}

export function BillingAccountsSettings() {
  const list = useServerFn(listBillingAccounts);
  const q = useQuery({ queryKey: ["billing-accounts"], queryFn: () => list() });
  return (
    <section className="mb-5 rounded-xl border bg-card p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <Banknote className="size-5 text-emission-boleto" />
        Boletos Sicredi
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Contas de cobrança por marca. A produção só emite depois de um teste de conexão bem-sucedido
        e da sua liberação.
      </p>
      {q.isLoading && <Loader2 className="mt-3 size-4 animate-spin" />}
      {q.isError && (
        <p role="alert" className="mt-3 text-xs text-destructive">
          Não foi possível carregar as contas.{" "}
          <Button variant="link" size="sm" onClick={() => void q.refetch()}>
            Tentar novamente
          </Button>
        </p>
      )}
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {q.data?.map((a) => (
          <AccountCard
            key={`${a.brand}-${a.ambiente}-${a.ultimoTesteEm ?? ""}-${a.emissaoHabilitada}`}
            account={a}
          />
        ))}
      </div>
    </section>
  );
}
