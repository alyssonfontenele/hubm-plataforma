import { describe, it, expect } from "vitest";
import { isValidCpf, cpfToDigits } from "../auth";

// CPFs válidos conhecidos (gerados via algoritmo oficial)
const VALID_CPFS = [
  "529.982.247-25", // formatado
  "52998224725",    // só dígitos
  "111.444.777-35",
  "11144477735",
];

// CPFs com dígitos verificadores errados
const INVALID_CHECK_DIGIT_CPFS = [
  "12345678900", // segundo dígito errado (correto seria 09)
  "52998224726", // dígito final errado
  "11144477734", // dígito final errado
];

describe("isValidCpf", () => {
  describe("CPFs válidos", () => {
    it.each(VALID_CPFS)("aceita %s", (cpf) => {
      expect(isValidCpf(cpf)).toBe(true);
    });
  });

  describe("CPFs com todos os dígitos iguais", () => {
    const repeated = [
      "00000000000",
      "11111111111",
      "22222222222",
      "33333333333",
      "44444444444",
      "55555555555",
      "66666666666",
      "77777777777",
      "88888888888",
      "99999999999",
    ];
    it.each(repeated)("rejeita %s (dígitos repetidos)", (cpf) => {
      expect(isValidCpf(cpf)).toBe(false);
    });
  });

  describe("CPFs com dígitos verificadores errados", () => {
    it.each(INVALID_CHECK_DIGIT_CPFS)("rejeita %s", (cpf) => {
      expect(isValidCpf(cpf)).toBe(false);
    });
  });

  describe("CPFs com comprimento inválido", () => {
    it("rejeita CPF com menos de 11 dígitos", () => {
      expect(isValidCpf("1234567890")).toBe(false);
      expect(isValidCpf("123.456.789")).toBe(false);
    });

    it("rejeita CPF vazio", () => {
      expect(isValidCpf("")).toBe(false);
    });

    it("rejeita CPF com mais de 11 dígitos", () => {
      expect(isValidCpf("123456789012")).toBe(false);
    });
  });

  describe("CPFs formatados (com pontos e traço)", () => {
    it("aceita CPF válido formatado", () => {
      expect(isValidCpf("529.982.247-25")).toBe(true);
      expect(isValidCpf("111.444.777-35")).toBe(true);
    });

    it("rejeita CPF inválido mesmo formatado", () => {
      expect(isValidCpf("111.111.111-11")).toBe(false);
      expect(isValidCpf("123.456.789-00")).toBe(false);
    });
  });
});

describe("cpfToDigits", () => {
  it("remove pontos e traço", () => {
    expect(cpfToDigits("529.982.247-25")).toBe("52998224725");
  });

  it("retorna apenas dígitos de string já normalizada", () => {
    expect(cpfToDigits("52998224725")).toBe("52998224725");
  });
});
