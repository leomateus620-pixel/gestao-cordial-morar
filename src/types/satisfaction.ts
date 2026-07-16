export type SatisfactionSurveyStatus = "pendente" | "respondida" | "expirada";

export type SatisfactionSurvey = {
  id: string;
  token: string;
  corretor_id: string;
  corretor_nome: string;
  corretor_iniciais: string;
  client_id: string | null;
  client_nome: string;
  client_contato: string | null;
  contexto: string | null;
  status: SatisfactionSurveyStatus;
  expires_at: string;
  responded_at: string | null;
  created_at: string;
  rating: number | null;
  comentario: string | null;
};

export type SatisfactionStats = {
  totalEnviadas: number;
  totalRespondidas: number;
  taxaResposta: number;
  mediaGeral: number;
  porCorretor: Array<{
    corretor_id: string;
    corretor_nome: string;
    corretor_iniciais: string;
    media: number;
    respostas: number;
  }>;
  evolucao: Array<{ mes: string; media: number; respostas: number }>;
  comentarios: Array<{
    id: string;
    corretor_nome: string;
    client_nome: string;
    rating: number;
    comentario: string;
    created_at: string;
  }>;
};

export type PublicSurveyView =
  | {
      status: "ok";
      surveyId: string;
      corretorNome: string;
      corretorIniciais: string;
      contexto: string | null;
    }
  | { status: "not_found" }
  | { status: "expired" }
  | { status: "already_answered" };
