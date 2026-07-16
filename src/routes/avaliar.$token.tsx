import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, Star, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "@/components/satisfaction/StarRating";
import {
  getPublicSurvey,
  submitPublicSurveyResponse,
} from "@/lib/satisfaction/satisfaction-public.functions";

export const Route = createFileRoute("/avaliar/$token")({
  head: () => ({
    meta: [
      { title: "Avalie seu atendimento" },
      { name: "robots", content: "noindex,nofollow" },
      {
        name: "description",
        content: "Compartilhe sua experiência com nosso corretor.",
      },
    ],
  }),
  component: PublicRatingPage,
});

function PublicRatingPage() {
  const { token } = Route.useParams();
  const getFn = useServerFn(getPublicSurvey);
  const submitFn = useServerFn(submitPublicSurveyResponse);

  const surveyQuery = useQuery({
    queryKey: ["public-survey", token],
    queryFn: () => getFn({ data: { token } }),
    retry: false,
    staleTime: 60_000,
  });

  const [rating, setRating] = useState(0);
  const [comentario, setComentario] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submit = useMutation({
    mutationFn: () =>
      submitFn({
        data: { token, rating, comentario: comentario.trim() || null },
      }),
    onSuccess: (res) => {
      if (res.ok) {
        setSubmitted(true);
      } else if (res.reason === "already_answered") {
        toast.error("Esta pesquisa já foi respondida.");
        surveyQuery.refetch();
      } else if (res.reason === "expired") {
        toast.error("Este link expirou.");
        surveyQuery.refetch();
      } else {
        toast.error("Link inválido.");
      }
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-background to-primary/5 px-4 py-8 sm:py-12">
      <div className="mx-auto flex w-full max-w-md flex-col items-center">
        <div className="mb-6 grid size-14 place-items-center rounded-3xl bg-amber-100 text-amber-600 shadow-sm">
          <Star className="size-7" />
        </div>

        <div className="w-full rounded-3xl border border-border/60 bg-card p-6 shadow-lg sm:p-8">
          {surveyQuery.isLoading && (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <span>Carregando...</span>
            </div>
          )}

          {surveyQuery.isError && (
            <StatusMessage
              tone="error"
              title="Não foi possível carregar"
              description="Verifique se o link foi copiado corretamente."
            />
          )}

          {surveyQuery.data?.status === "not_found" && (
            <StatusMessage
              tone="error"
              title="Link inválido"
              description="Este link de avaliação não existe."
            />
          )}
          {surveyQuery.data?.status === "expired" && (
            <StatusMessage
              tone="warn"
              title="Link expirado"
              description="Este link não está mais disponível. Peça um novo à imobiliária."
            />
          )}
          {surveyQuery.data?.status === "already_answered" && (
            <StatusMessage
              tone="success"
              title="Já registramos sua avaliação"
              description="Obrigado por compartilhar sua experiência!"
            />
          )}

          {surveyQuery.data?.status === "ok" && !submitted && (
            <div>
              <h1 className="text-center text-xl font-bold tracking-tight sm:text-2xl">
                Como foi seu atendimento?
              </h1>
              <p className="mt-2 text-center text-sm text-muted-foreground">
                Avalie o atendimento de{" "}
                <strong className="text-foreground">{surveyQuery.data.corretorNome}</strong>
              </p>
              {surveyQuery.data.contexto && (
                <p className="mt-1 text-center text-xs text-muted-foreground">
                  {surveyQuery.data.contexto}
                </p>
              )}

              <div className="mt-6 flex justify-center">
                <StarRating value={rating} onChange={setRating} size={36} />
              </div>

              <div className="mt-6 grid gap-2">
                <label className="text-sm font-medium" htmlFor="comentario">
                  Comentário <span className="text-muted-foreground">(opcional)</span>
                </label>
                <Textarea
                  id="comentario"
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value.slice(0, 1000))}
                  placeholder="Conte-nos como foi sua experiência"
                  rows={4}
                  maxLength={1000}
                />
                <p className="text-right text-[11px] text-muted-foreground">
                  {comentario.length}/1000
                </p>
              </div>

              <Button
                onClick={() => submit.mutate()}
                disabled={rating < 1 || submit.isPending}
                className="mt-4 w-full"
                size="lg"
              >
                {submit.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Enviar avaliação
              </Button>
            </div>
          )}

          {submitted && (
            <StatusMessage
              tone="success"
              title="Obrigado!"
              description="Sua avaliação foi registrada. Ela nos ajuda a melhorar sempre."
            />
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Suas respostas são confidenciais e usadas apenas para melhoria do atendimento.
        </p>
      </div>
    </div>
  );
}

function StatusMessage({
  tone,
  title,
  description,
}: {
  tone: "success" | "warn" | "error";
  title: string;
  description: string;
}) {
  const cfg = {
    success: {
      Icon: CheckCircle2,
      wrap: "bg-emerald-100 text-emerald-700",
    },
    warn: {
      Icon: TriangleAlert,
      wrap: "bg-amber-100 text-amber-700",
    },
    error: {
      Icon: TriangleAlert,
      wrap: "bg-rose-100 text-rose-700",
    },
  }[tone];
  return (
    <div className="flex flex-col items-center py-4 text-center">
      <span className={`mb-3 grid size-12 place-items-center rounded-2xl ${cfg.wrap}`}>
        <cfg.Icon className="size-6" />
      </span>
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
