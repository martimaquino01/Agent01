import { describe, expect, it } from "vitest";
import { eTelemovel, normalizarTelefone } from "../src/telefone.js";

describe("normalizarTelefone", () => {
  it.each([
    ["+351 912 345 678", "912345678"],
    ["+351912345678", "912345678"],
    ["00351 912 345 678", "912345678"],
    ["351912345678", "912345678"],
    ["912 345 678", "912345678"],
    ["912-345-678", "912345678"],
    ["(+351) 962 697 356", "962697356"],
    ["253 123 456", "253123456"],
    ["+351 21 123 4567", "211234567"],
  ])("%s -> %s", (entrada, nacional) => {
    const t = normalizarTelefone(entrada)!;
    expect(t.nacional).toBe(nacional);
    expect(t.internacional).toBe(`+351${nacional}`);
  });

  it("formata de forma legível", () => {
    expect(normalizarTelefone("+351912345678")!.legivel).toBe("912 345 678");
  });

  it.each([null, undefined, "", "12345", "+34 612 345 678", "0034612345678", "+351 812 345 678", "9123456789", "abc"])(
    "rejeita %s",
    (entrada) => {
      expect(normalizarTelefone(entrada as string)).toBeNull();
    },
  );
});

describe("eTelemovel", () => {
  it.each(["911111111", "921111111", "931111111", "961111111"])("%s é telemóvel", (n) => {
    expect(eTelemovel(normalizarTelefone(n))).toBe(true);
  });
  it.each(["253123456", "211234567", "808200200", "941111111", "951111111", "971111111"])("%s não é telemóvel", (n) => {
    expect(eTelemovel(normalizarTelefone(n))).toBe(false);
  });
  it("número inválido não é telemóvel", () => {
    expect(eTelemovel(null)).toBe(false);
  });
});
