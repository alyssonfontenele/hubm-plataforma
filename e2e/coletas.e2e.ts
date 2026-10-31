// Portal Mowig (J664) — coletas do lojista ponta a ponta contra o dublê (e2e/servidor-fake.mjs). Roda em 375 e 1440 px.
// Dados 100% sintéticos; as capturas vão para docs/capturas/j664/ (repo público, POR-H11).
import { expect, test, type Page } from "@playwright/test";

const FAKE = "http://127.0.0.1:4399";
const SENHA = "senha-de-teste-123";

test.beforeEach(async ({ request }) => {
  await request.post(`${FAKE}/__test/reset`);
});

async function entrar(page: Page, email = "gestor@loja-teste.example") {
  await page.goto("/portal/entrar");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByTestId("quadro")).toBeVisible();
}

async function captura(page: Page, nome: string, vp: string) {
  await page.screenshot({ path: `docs/capturas/j664/${nome}-${vp}.png`, fullPage: true });
}

async function semRolagemHorizontal(page: Page) {
  const { sw, cw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(sw, "a página não pode rolar na horizontal").toBeLessThanOrEqual(cw);
}

const horarios = (page: Page) =>
  page.getByRole("radiogroup", { name: "Horário da coleta" }).getByRole("radio");

test("AGENDAR COLETA: seleciona pedidos prontos, escolhe horário e transportadora e a coleta fica SOLICITADA", async ({
  page,
}, info) => {
  const vp = info.project.name;
  await entrar(page);

  // sem seleção o botão fica desligado; as 7 colunas continuam as da J661
  await expect(page.getByTestId("quadro").getByRole("heading", { level: 3 })).toHaveCount(7);
  await expect(page.getByTestId("agendar-coleta")).toBeDisabled();
  await page.getByRole("checkbox", { name: /pedido 5109 para coleta/ }).check();
  await page.getByRole("checkbox", { name: /pedido 5110 para coleta/ }).check();
  await expect(page.getByTestId("agendar-coleta")).toHaveText("AGENDAR COLETA (2)");
  await semRolagemHorizontal(page);
  await captura(page, "01-quadro-selecao", vp);

  await page.getByTestId("agendar-coleta").click();
  await expect(page.getByRole("heading", { name: "Agendar coleta", level: 1 })).toBeVisible();
  await expect(page.getByTestId("pedidos-da-coleta")).toContainText("5109");
  await expect(page.getByTestId("pedidos-da-coleta")).toContainText("5110");
  // enquanto falta horário e transportadora, não envia
  await expect(page.getByRole("button", { name: "Solicitar coleta" })).toBeDisabled();
  await expect(horarios(page).first()).toBeVisible();
  await horarios(page).first().check();
  await page.locator("select").selectOption("T1");
  await page.getByLabel(/Algo que a logística/).fill("Doca dos fundos");
  await semRolagemHorizontal(page);
  await captura(page, "02-agendar", vp);

  await page.getByRole("button", { name: "Solicitar coleta" }).click();
  await expect(page.getByRole("heading", { name: /^Coleta \d+$/, level: 1 })).toBeVisible();
  await expect(page.getByText("Solicitada", { exact: true })).toBeVisible();
  await expect(page.getByText("Transportes Exemplo")).toBeVisible();
  await expect(page.getByText("Doca dos fundos")).toBeVisible();
  await expect(page.getByText("A logística da Mowig ainda vai confirmar")).toBeVisible();
  await semRolagemHorizontal(page);
  await captura(page, "03-coleta-solicitada", vp);

  // de volta ao quadro: os pedidos seguem em AGUARDANDO COLETA com a marca e sem caixa de seleção
  await page.goto("/portal");
  const cartao = page.getByTestId("coluna-AGUARDANDO_COLETA").getByTestId("pedido-5109");
  await expect(cartao).toContainText("COLETA SOLICITADA");
  await expect(cartao.getByRole("checkbox")).toHaveCount(0);
});

test("veículo próprio: placa inválida mostra a mensagem da API; placa certa agenda", async ({
  page,
}) => {
  await entrar(page);
  await page.goto("/portal/agendar?pedidos=5111");
  await horarios(page).first().check();
  await page.getByRole("radio", { name: "Veículo próprio" }).check();
  await page.getByLabel("Placa (opcional)").fill("12-345");
  await page.getByRole("button", { name: "Solicitar coleta" }).click();
  await expect(page.getByRole("alert")).toHaveText("Placa inválida. Confira e tente de novo.");

  await page.getByLabel("Placa (opcional)").fill("abc-1d23");
  await page.getByLabel("Motorista (opcional)").fill("Motorista Teste");
  await page.getByRole("button", { name: "Solicitar coleta" }).click();
  await expect(page.getByText("ABC1D23", { exact: false })).toBeVisible();
  await expect(page.getByText("Solicitada", { exact: true })).toBeVisible();
});

test("último lugar tomado por outra pessoa: 409 sem_vaga com a mensagem da API e a lista se atualiza", async ({
  page,
  request,
}, info) => {
  await entrar(page);
  await page.goto("/portal/agendar?pedidos=5112");
  const ultimo = page.locator('input[name="slot"][value="52"]');
  await ultimo.check();
  await page.locator("select").selectOption("T2");
  // enquanto a pessoa decide, outra loja leva a última vaga
  await request.post(`${FAKE}/__test/ocupar?slot=52`);
  await page.getByRole("button", { name: "Solicitar coleta" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Este horário acabou de ficar sem vaga. Escolha outro.",
  );
  await expect(page.locator('input[name="slot"][value="52"]')).toHaveCount(0);
  await semRolagemHorizontal(page);
  await captura(page, "04-sem-vaga", info.project.name);
});

test("COLETA AGENDADA: REMARCAR e CANCELAR só dentro da janela que a API autoriza", async ({
  page,
}, info) => {
  await entrar(page);
  const agendada = page.getByTestId("coluna-COLETA_AGENDADA");
  // 5113: coleta com folga -> botões; 5114: coleta para amanhã (< 24 h) -> sem botões, só a explicação
  await expect(
    agendada.getByTestId("pedido-5113").getByRole("link", { name: "REMARCAR" }),
  ).toBeVisible();
  await expect(
    agendada.getByTestId("pedido-5113").getByRole("button", { name: "CANCELAR" }),
  ).toBeVisible();
  await expect(
    agendada.getByTestId("pedido-5114").getByRole("link", { name: "REMARCAR" }),
  ).toHaveCount(0);
  await expect(
    agendada.getByTestId("pedido-5114").getByRole("button", { name: "CANCELAR" }),
  ).toHaveCount(0);
  await expect(agendada.getByTestId("pedido-5114")).toContainText("menos de 24 h");
  await semRolagemHorizontal(page);
  await captura(page, "05-coleta-agendada", info.project.name);
});

test("REMARCAR: escolhe outro horário e a coleta volta a SOLICITADA", async ({ page }, info) => {
  const vp = info.project.name;
  await entrar(page);
  await page.getByTestId("pedido-5113").getByRole("link", { name: "REMARCAR" }).click();
  await expect(page.getByRole("heading", { name: /^Remarcar coleta/, level: 1 })).toBeVisible();
  await expect(page.getByText("horário atual", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remarcar coleta" })).toBeDisabled();
  await horarios(page).last().check();
  await semRolagemHorizontal(page);
  await captura(page, "06-remarcar", vp);
  await page.getByRole("button", { name: "Remarcar coleta" }).click();
  await expect(page.getByRole("heading", { name: "Coleta 301", level: 1 })).toBeVisible();
  await expect(page.getByText("Solicitada", { exact: true })).toBeVisible();
});

test("CANCELAR pede confirmação; Voltar mantém; confirmar devolve os pedidos para AGUARDANDO COLETA", async ({
  page,
}, info) => {
  await entrar(page);
  const cartao = page.getByTestId("pedido-5113");
  await cartao.getByRole("button", { name: "CANCELAR" }).click();
  await expect(cartao.getByText(/Cancelar esta coleta\?/)).toBeVisible();
  await semRolagemHorizontal(page);
  await captura(page, "07-cancelar-confirmacao", info.project.name);

  await cartao.getByRole("button", { name: "Voltar" }).click();
  await expect(page.getByTestId("coluna-COLETA_AGENDADA").getByTestId("pedido-5113")).toBeVisible();

  await cartao.getByRole("button", { name: "CANCELAR" }).click();
  await cartao.getByRole("button", { name: "Confirmar cancelamento" }).click();
  const prontos = page.getByTestId("coluna-AGUARDANDO_COLETA");
  await expect(prontos.getByTestId("pedido-5113")).toBeVisible();
  await expect(prontos.getByRole("checkbox", { name: /pedido 5113 para coleta/ })).toBeVisible();
  await expect(page.getByTestId("coluna-COLETA_AGENDADA").getByTestId("pedido-5113")).toHaveCount(
    0,
  );
});

test("DESPACHADO: documentos para baixar (NF-e ligada pela chave e arquivo anexado)", async ({
  page,
}, info) => {
  const vp = info.project.name;
  await entrar(page);
  await page.getByTestId("documentos-5115").click();
  await expect(page.getByRole("heading", { name: "Coleta 303", level: 1 })).toBeVisible();
  await expect(page.getByText("Despachada", { exact: true })).toBeVisible();
  await expect(page.getByTestId("documento-3001")).toContainText("nº 1234");
  await expect(page.getByTestId("documento-3001")).toContainText("Ligada pela chave");
  await expect(page.getByTestId("documento-3001").getByRole("button")).toHaveCount(0);
  await semRolagemHorizontal(page);
  await captura(page, "08-despachado-documentos", vp);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /Baixar romaneio-303\.pdf/ }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("romaneio-303.pdf");
  // sem botões de alteração em coleta despachada
  await expect(page.getByRole("button", { name: "CANCELAR" })).toHaveCount(0);
});

test("papel CONSULTA (capacidade coleta ausente): vê coletas e baixa documentos, mas nada de agendar/remarcar/cancelar", async ({
  page,
}, info) => {
  await entrar(page, "consulta@loja-teste.example");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByTestId("agendar-coleta")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "REMARCAR" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "CANCELAR" })).toHaveCount(0);
  // acompanhar continua valendo
  await expect(page.getByTestId("coluna-COLETA_AGENDADA").getByTestId("pedido-5113")).toContainText(
    "Ver coleta",
  );
  await captura(page, "09-consulta-quadro", info.project.name);

  await page.getByTestId("documentos-5115").click();
  await expect(page.getByTestId("documento-3002")).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /Baixar romaneio-303\.pdf/ }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("romaneio-303.pdf");

  // URL direta de agendar: aviso humano, nada é chamado
  await page.goto("/portal/agendar?pedidos=5109");
  await expect(page.getByText(/Seu perfil só acompanha as coletas/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Solicitar coleta" })).toHaveCount(0);
});

test("papel FINANCEIRO (coleta: false) não agenda; IMPLANTADOR (coleta: true) agenda", async ({
  page,
}) => {
  await entrar(page, "financeiro@loja-teste.example");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByTestId("agendar-coleta")).toHaveCount(0);
  await page.getByRole("button", { name: "Sair" }).click();

  await entrar(page, "implantador@loja-teste.example");
  await expect(page.getByRole("checkbox", { name: /pedido 5111 para coleta/ })).toBeVisible();
  await page.getByRole("checkbox", { name: /pedido 5111 para coleta/ }).check();
  await page.getByTestId("agendar-coleta").click();
  await horarios(page).first().check();
  await page.locator("select").selectOption("T1");
  await page.getByRole("button", { name: "Solicitar coleta" }).click();
  await expect(page.getByText("Solicitada", { exact: true })).toBeVisible();
});

test("coleta de outra loja ou inexistente: mesma mensagem humana", async ({ page }) => {
  await entrar(page);
  await page.goto("/portal/coleta/999999");
  await expect(page.getByText("Coleta não encontrada.")).toBeVisible();
});
