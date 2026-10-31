// Portal Mowig (J661) — fluxos do lojista ponta a ponta contra o dublê. Roda em 375 e 1440 px.
// Dados 100% sintéticos; as capturas vão para docs/capturas/j661/ (repo público, POR-H11).
import { expect, test, type Page } from "@playwright/test";

const FAKE = "http://127.0.0.1:4399";
const SENHA = "senha-de-teste-123";

test.beforeEach(async ({ request }) => {
  await request.post(`${FAKE}/__test/reset`);
});

async function entrar(page: Page, email = "gestor@loja-teste.example", senha = SENHA) {
  await page.goto("/portal/entrar");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
}

async function captura(page: Page, nome: string, vp: string) {
  await page.screenshot({ path: `docs/capturas/j661/${nome}-${vp}.png`, fullPage: true });
}

async function semRolagemHorizontal(page: Page) {
  const { sw, cw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(sw, "a página não pode rolar na horizontal").toBeLessThanOrEqual(cw);
}

test("login: senha errada mostra a mensagem; login correto abre o quadro de 7 colunas", async ({
  page,
}, info) => {
  const vp = info.project.name;
  await entrar(page, "gestor@loja-teste.example", "senha-errada-123");
  await expect(page.getByRole("alert")).toHaveText("E-mail ou senha incorretos.");
  await captura(page, "01-login-erro", vp);

  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Pedidos", level: 1 })).toBeVisible();
  await expect(page.getByTestId("quadro").getByRole("heading", { level: 3 })).toHaveCount(7);
  await expect(page.getByText("Loja Teste", { exact: true }).first()).toBeVisible();
  // valores aparecem para o GESTOR
  await expect(page.getByTestId("pedido-5102")).toContainText("R$");
  await semRolagemHorizontal(page);
  await captura(page, "02-pedidos-gestor", vp);
});

test("quadro: 7 colunas lado a lado a partir de 1100 px, empilhadas no celular, sem rolagem horizontal", async ({
  page,
}, info) => {
  await entrar(page);
  await expect(page.getByTestId("quadro")).toBeVisible();
  const caixas = await page.locator("[data-testid^='coluna-']").evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) };
    }),
  );
  expect(caixas).toHaveLength(7);
  if (info.project.name === "1440") {
    expect(new Set(caixas.map((c) => c.y)).size, "todas na mesma linha").toBe(1);
    expect(Math.min(...caixas.map((c) => c.w))).toBeGreaterThan(120);
  } else {
    expect(new Set(caixas.map((c) => c.x)).size, "empilhadas: mesma coluna de tela").toBe(1);
    expect(caixas[0].w).toBeGreaterThan(300);
  }
  await semRolagemHorizontal(page);
});

test("papel CONSULTA: sem valores, sem menu Cobranças, sem botão Pagar", async ({ page }, info) => {
  await entrar(page, "consulta@loja-teste.example");
  await expect(page.getByTestId("quadro")).toBeVisible();
  await expect(page.getByRole("link", { name: "Cobranças" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Pagar" })).toHaveCount(0);
  await expect(page.getByTestId("quadro")).not.toContainText("R$");
  await captura(page, "03-pedidos-consulta", info.project.name);

  // entrar direto na URL de cobranças: aviso humano, sem chamar nada
  await page.goto("/portal/cobrancas");
  await expect(page.getByText("Seu perfil não tem acesso às cobranças da loja.")).toBeVisible();
});

test("pedido: detalhe com linha do tempo e valores (gestor); pedido inexistente = mensagem", async ({
  page,
}, info) => {
  await entrar(page);
  await page.getByTestId("pedido-5105").getByRole("link", { name: "Ver" }).click();
  await expect(page.getByRole("heading", { name: "Pedido", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "5105" })).toBeVisible();
  await expect(page.getByText("Pedido recebido")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Valores" })).toBeVisible();
  await semRolagemHorizontal(page);
  await captura(page, "04-pedido-detalhe", info.project.name);

  await page.goto("/portal/pedido/999999");
  await expect(page.getByText("Pedido não encontrado.")).toBeVisible();
});

test("PAGAR por PIX: monta a cobrança com crédito, gera o PIX e só comemora quando a API diz PAGA", async ({
  page,
  request,
}, info) => {
  const vp = info.project.name;
  await entrar(page);
  await page.getByTestId("pedido-5102").getByRole("link", { name: "Pagar" }).click();

  await expect(page.getByRole("heading", { name: "Montar cobrança" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /5102/ })).toBeChecked();
  await page.getByRole("checkbox", { name: /5103/ }).check();
  await expect(page.getByTestId("total-liquido")).toContainText("1.500,50");
  await page.getByLabel(/crédito a usar/i).fill("100,50");
  await expect(page.getByTestId("total-liquido")).toContainText("1.400,00");
  await semRolagemHorizontal(page);
  await captura(page, "05-cobranca-montar", vp);

  await page.getByRole("button", { name: "Criar cobrança" }).click();
  await expect(page.getByText(/criada — R\$\s*1\.400,00/)).toBeVisible();
  await captura(page, "06-cobranca-criada", vp);

  await page.getByRole("link", { name: "Pagar agora" }).click();
  await expect(page.getByRole("heading", { name: "Pagamento", level: 1 })).toBeVisible();
  await expect(page.getByTestId("total-pagar")).toContainText("1.400,00");
  await page.getByRole("button", { name: "Pagar com PIX" }).click();
  await expect(page.getByAltText("QR Code do PIX")).toBeVisible();
  await expect(page.getByTestId("codigo-pix")).toContainText("00020126");
  await semRolagemHorizontal(page);
  await captura(page, "07-pagamento-pix", vp);

  // copiar o código
  await page
    .context()
    .grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:4398" })
    .catch(() => {});
  await page.getByRole("button", { name: "Copiar código" }).click();
  await expect(page.getByText("Código copiado.")).toBeVisible();

  // enquanto o gateway não confirmou: nenhuma mensagem de sucesso
  await expect(page.getByText(/pagamento confirmado/i)).toHaveCount(0);

  // o gateway confirma; a tela descobre sozinha na próxima consulta (10 s)
  const id = Number(new URL(page.url()).pathname.split("/").pop());
  await request.post(`${FAKE}/__test/confirmar?id=${id}&como=PAGA`);
  await expect(page.getByText(/pagamento confirmado/i)).toBeVisible({ timeout: 25_000 });
  await captura(page, "08-pagamento-confirmado", vp);
});

test("PAGAR por boleto: linha digitável e BAIXAR BOLETO; CONFIRMED não libera nem comemora", async ({
  page,
  request,
}, info) => {
  const vp = info.project.name;
  await entrar(page);
  await page.getByRole("link", { name: "Cobranças" }).click();
  await page.getByRole("button", { name: "Montar cobrança" }).click();
  await page.getByRole("checkbox", { name: /5104/ }).check();
  await page.getByRole("button", { name: "Criar cobrança" }).click();
  await page.getByRole("link", { name: "Pagar agora" }).click();
  await page.getByRole("button", { name: "Pagar com boleto" }).click();

  await expect(page.getByTestId("linha-digitavel")).toContainText("00190.00009");
  const baixar = page.getByRole("link", { name: "Baixar boleto" });
  await expect(baixar).toHaveAttribute(
    "href",
    /^https:\/\/sandbox\.exemplo\.test\/boleto\/\d+\.pdf$/,
  );
  await expect(baixar).toHaveAttribute("rel", /noopener/);
  await semRolagemHorizontal(page);
  await captura(page, "09-pagamento-boleto", vp);

  const id = Number(new URL(page.url()).pathname.split("/").pop());
  await request.post(`${FAKE}/__test/confirmar?id=${id}&como=BOLETO_CONFIRMED`);
  await expect(page.getByText(/recebemos a confirmação do boleto/i)).toBeVisible({
    timeout: 25_000,
  });
  await expect(page.getByText(/pagamento confirmado/i)).toHaveCount(0);
  await expect(page.getByText(/pedidos foram liberados/i)).toHaveCount(0);
});

test("recarregar a tela de pagamento recupera o PIX já emitido; nova versão substitui a cobrança", async ({
  page,
}, info) => {
  const vp = info.project.name;
  await entrar(page);
  await page.getByRole("link", { name: "Cobranças" }).click();
  await page.getByRole("button", { name: "Montar cobrança" }).click();
  await page.getByRole("checkbox", { name: /5102/ }).check();
  await page.getByRole("button", { name: "Criar cobrança" }).click();
  await page.getByRole("link", { name: "Pagar agora" }).click();
  await page.getByRole("button", { name: "Pagar com PIX" }).click();
  const codigo = await page.getByTestId("codigo-pix").textContent();

  await page.reload();
  await expect(page.getByTestId("codigo-pix")).toHaveText(codigo ?? "");
  await expect(page.getByRole("button", { name: "Pagar com PIX" })).toHaveCount(0);

  // volta às cobranças e cria nova versão incluindo outro pedido
  await page.getByRole("link", { name: "Cobranças" }).first().click();
  await expect(page.getByTestId(/^cobranca-/).first()).toBeVisible();
  await page.getByRole("button", { name: "Alterar" }).click();
  await expect(page.getByRole("heading", { name: /Nova versão de P-2026-/ })).toBeVisible();
  await page.getByRole("checkbox", { name: /5103/ }).check();
  await page.getByRole("button", { name: "Criar nova versão" }).click();
  await expect(page.getByText(/criada — R\$\s*1\.500,50/)).toBeVisible();
  await expect(page.getByTestId(/^cobranca-/).first()).toContainText("v2");
  await captura(page, "10-cobrancas-lista", vp);
});

test("crédito acima do disponível é barrado antes de enviar", async ({ page }, info) => {
  await entrar(page);
  await page.getByRole("link", { name: "Cobranças" }).click();
  await page.getByRole("button", { name: "Montar cobrança" }).click();
  await page.getByRole("checkbox", { name: /5102/ }).check();
  await page.getByLabel(/crédito a usar/i).fill("300,01");
  await expect(page.getByRole("alert")).toContainText("crédito disponível");
  await expect(page.getByRole("button", { name: "Criar cobrança" })).toBeDisabled();
  await captura(page, "11-credito-invalido", info.project.name);
});

test("usuário: dados da loja e papel; Sair volta ao login", async ({ page }, info) => {
  await entrar(page);
  await page.getByRole("link", { name: "Usuário" }).click();
  await expect(page.getByRole("heading", { name: "Usuário", level: 1 })).toBeVisible();
  await expect(page.getByText("Loja Teste Comércio Ltda")).toBeVisible();
  await expect(page.getByText("gestor@loja-teste.example")).toBeVisible();
  await expect(page.getByText("Gestor", { exact: true })).toBeVisible();
  await semRolagemHorizontal(page);
  await captura(page, "12-usuario", info.project.name);
  await page.getByRole("button", { name: "Sair" }).last().click();
  await expect(page.getByRole("heading", { name: "Portal Mowig" })).toBeVisible();
  await expect(page).toHaveURL(/\/portal\/entrar/);
});

test("sem sessão, qualquer tela do portal manda para o login", async ({ page }) => {
  await page.goto("/portal/cobrancas");
  await expect(page).toHaveURL(/\/portal\/entrar/);
});

test("esqueci a senha: a tela abre e confirma o envio sem revelar se o e-mail existe", async ({
  page,
}, info) => {
  await page.goto("/portal/esqueci");
  await page.getByLabel("E-mail").fill("qualquer@loja-teste.example");
  await page.getByRole("button", { name: /enviar|redefinir|recuperar/i }).click();
  await expect(page.getByRole("status").or(page.locator(".portal-aviso-ok"))).toBeVisible();
  await captura(page, "13-esqueci-senha", info.project.name);
});
