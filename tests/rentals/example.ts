import type { RentalWorkspaceInput } from "../../src/lib/rentals/contract-workflow";

export function rentalExample(brand: "cordial" | "morar"): RentalWorkspaceInput {
  const party = { nationality: "brasileira", maritalStatus: "solteira", rg: "DEMO-01" };
  return {
    brand,
    property: {
      data: {
        apelido: "Casa Ipê · Homologação",
        tipo: "casa",
        logradouro: "Rua das Araucárias",
        numero: "42",
        bairro: "Bairro Exemplo",
        cidade: "Santa Rosa",
        uf: "RS",
        brand,
        status: "alugado",
        proprietarioNome: "Pessoa Locadora Exemplo",
        proprietarioCpf: "000.000.000-00",
      },
    },
    tenants: [
      {
        data: {
          nome: "Pessoa Locatária Exemplo",
          telefone: "55000000000",
          cpfCnpj: "000.000.000-00",
          endereco: "Rua de Teste, 1, Santa Rosa/RS",
          profissao: "Analista",
        },
      },
    ],
    guarantees: [{ tipo: "caucao", valorCaucao: 2800 }],
    dataInicio: "2026-11-24",
    dataFim: "2027-11-24",
    diaVencimento: 10,
    valorMensal: 1400,
    status: "pendente_assinatura",
    template: {
      registration: "DEMO-184",
      signedOn: "2026-11-24",
      owner: { ...party, profession: "Professora", address: "Rua Fictícia, 2, Santa Rosa/RS" },
      tenants: [party],
    },
  };
}
