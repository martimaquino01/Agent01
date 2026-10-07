const cores = !process.env.NO_COLOR && process.stdout.isTTY !== false;
const c = (codigo: number) => (s: string) => (cores ? `\x1b[${codigo}m${s}\x1b[0m` : s);
export const verde = c(32);
export const amarelo = c(33);
export const vermelho = c(31);
export const cinza = c(90);
export const negrito = c(1);
export const ciano = c(36);

const hora = () => new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export const consola = {
  titulo(s: string) {
    console.log(`\n${negrito(ciano(s))}`);
  },
  info(s: string) {
    console.log(`${cinza(hora())} ${s}`);
  },
  ok(s: string) {
    console.log(`${cinza(hora())} ${verde("✔")} ${s}`);
  },
  aviso(s: string) {
    console.log(`${cinza(hora())} ${amarelo("!")} ${amarelo(s)}`);
  },
  erro(s: string) {
    console.error(`${cinza(hora())} ${vermelho("✖")} ${vermelho(s)}`);
  },
  descarte(s: string) {
    console.log(`${cinza(hora())} ${cinza("  ✗ " + s)}`);
  },
  progresso(encontrados: number, alvo: number, s: string) {
    console.log(`${cinza(hora())} ${negrito(`Encontrados ${encontrados}/${alvo}`)} – ${s}`);
  },
};
