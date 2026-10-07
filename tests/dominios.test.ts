import { describe, expect, it } from "vitest";
import { extrairHost, temSiteProprio } from "../src/dominios.js";

describe("temSiteProprio", () => {
  it.each([
    [undefined],
    [""],
    ["   "],
    ["https://www.facebook.com/barbeariaze"],
    ["http://m.facebook.com/pages/x"],
    ["https://fb.me/abc"],
    ["https://instagram.com/barbearia.ze"],
    ["https://www.instagram.com/barbearia.ze/?hl=pt"],
    ["https://booksy.com/pt-pt/12345_barbearia-ze"],
    ["https://www.fresha.com/a/salao-x"],
    ["https://www.thefork.pt/restaurante/tasca-x"],
    ["https://www.thefork.com/restaurant/x"],
    ["https://www.tripadvisor.pt/Restaurant_Review-x"],
    ["https://www.tripadvisor.com.pt/Restaurant_Review-x"],
    ["https://tripadvisor.com/x"],
    ["https://linktr.ee/barbeariaze"],
    ["https://sites.google.com/view/barbeariaze"],
    ["https://barbearia-ze.business.site/"],
    ["https://loja.negocio.site"],
    ["https://wa.me/351912345678"],
    ["https://api.whatsapp.com/send?phone=351912345678"],
    ["facebook.com/barbeariaze"],
  ])("%s NÃO conta como site", (uri) => {
    expect(temSiteProprio(uri)).toBe(false);
  });

  it.each([
    ["https://www.barbeariaze.pt"],
    ["http://barbeariaze.com/"],
    ["barbeariaze.pt"],
    ["https://ze.wixsite.com/barbearia"],
    ["https://www.google.com/maps/place/x"],
    ["https://facebook.com.barbeariaze.pt"],
    ["https://notfacebook.com"],
    ["https://instagram.com.pt.example.pt"],
  ])("%s conta como site próprio", (uri) => {
    expect(temSiteProprio(uri)).toBe(true);
  });

  it("aceita lista personalizada", () => {
    expect(temSiteProprio("https://ze.wixsite.com/x", ["wixsite.com"])).toBe(false);
  });
});

describe("extrairHost", () => {
  it("remove www e aceita URLs sem protocolo", () => {
    expect(extrairHost("www.Exemplo.PT/abc")).toBe("exemplo.pt");
    expect(extrairHost("https://www.exemplo.pt:8080/x?y")).toBe("exemplo.pt");
  });
  it("devolve null para lixo", () => {
    expect(extrairHost("não tenho")).toBeNull();
    expect(extrairHost("")).toBeNull();
  });
});
