import { z } from "zod";
const district = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .refine(
    (v) => !/[@\d]|\b(rua|avenida|cpf|telefone|propriet[aá]rio)\b/i.test(v),
    "Informe somente o nome de um bairro, sem dados pessoais.",
  );
export const memoryPreferences = z
  .object({
    tone: z.enum(["curto", "acolhedor", "formal"]).default("curto"),
    focusNeighborhoods: z.array(district).max(10).default([]),
    preferredStart: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
      .default("08:00"),
    preferredEnd: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
      .default("18:00"),
  })
  .strict()
  .refine((v) => v.preferredStart < v.preferredEnd, "O horário final deve vir após o inicial.");
export const defaultAssistantMemory = () => memoryPreferences.parse({});
