import { test, expect } from '@playwright/test';

test('demand lifecycle, assignment, history, contact and closed queue', async ({ page }) => {
  await page.goto('/tests/ui/?demands');
  await expect(page.getByRole('heading', { name: 'Central de demandas' })).toBeVisible();
  await page.getByRole('button', { name: /Revisar contrato do cliente/ }).click();
  const detail = page.getByRole('complementary', { name: 'Detalhes da demanda' });
  await expect(detail.getByLabel('Cliente ou contato')).toBeDisabled();
  await detail.getByRole('button', { name: 'Abrir cadastro do contato' }).click();
  await expect(page.getByText('Cadastro aberto: lead-one')).toBeVisible();
  await detail.getByRole('button', { name: 'Atribuir a mim' }).click();
  await detail.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(detail.getByLabel('Responsável')).toHaveValue('user-one');
  await expect(detail.getByLabel('Estado', { exact: true })).toHaveValue('IN_PROGRESS');
  await detail.getByLabel('Nota interna', { exact: true }).fill('Aguardando documento do cliente.');
  await detail.getByRole('button', { name: 'Adicionar nota' }).click();
  await expect(detail.getByText('Aguardando documento do cliente.', { exact: true })).toBeVisible();
  await expect(detail.getByText('Responsável: Não definido → Diego')).toBeVisible();
  await detail.getByLabel('Estado', { exact: true }).selectOption('RESOLVED');
  await detail.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByText('Nenhuma demanda nesta visão.')).toBeVisible();
  await page.getByRole('button', { name: 'Encerradas', exact: true }).click();
  await expect(page.getByRole('button', { name: /Revisar contrato do cliente/ })).toBeVisible();
  await detail.getByLabel('Estado', { exact: true }).selectOption('OPEN');
  await detail.getByRole('button', { name: 'Salvar alterações' }).click();
  await page.getByRole('button', { name: 'Atrasadas', exact: true }).click();
  await expect(page.getByRole('button', { name: /Revisar contrato do cliente/ })).toBeVisible();
});

test('creation, interruption retry and cancel do not duplicate or create accidentally', async ({ page }) => {
  await page.goto('/tests/ui/?demands');
  await page.getByRole('button', { name: 'Nova demanda', exact: false }).click();
  let modal = page.getByRole('dialog', { name: 'Nova demanda' });
  await modal.getByLabel('Título', { exact: true }).fill('Rascunho descartado');
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  await page.getByRole('button', { name: 'Interromper retorno' }).click();
  await page.getByRole('button', { name: 'Nova demanda', exact: false }).click();
  modal = page.getByRole('dialog', { name: 'Nova demanda' });
  await modal.getByLabel('Título', { exact: true }).fill('Preparar proposta de serviço');
  await modal.getByLabel('Cliente ou contato').selectOption('lead-one');
  await modal.getByRole('button', { name: 'Registrar demanda' }).click();
  await expect(modal.getByRole('alert')).toContainText('Resposta interrompida');
  await expect(modal.getByLabel('Título', { exact: true })).toHaveValue('Preparar proposta de serviço');
  await expect(modal.getByLabel('Título', { exact: true })).toBeDisabled();
  await modal.getByRole('button', { name: 'Registrar demanda' }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Preparar proposta de serviço/ })).toHaveCount(1);
  await page.getByRole('button', { name: 'Contar gravações' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-write-count', '1');
});

test('explicit rejections keep creation and note drafts editable without duplicates', async ({ page }) => {
  await page.goto('/tests/ui/?demands');
  await page.getByRole('button', { name: 'Rejeitar próximo registro', exact: true }).click();
  await page.getByRole('button', { name: 'Nova demanda', exact: false }).click();
  const modal = page.getByRole('dialog', { name: 'Nova demanda' });
  await modal.getByLabel('Título', { exact: true }).fill('Rascunho para corrigir');
  await modal.getByRole('button', { name: 'Registrar demanda' }).click();
  await expect(modal.getByRole('alert')).toContainText('Nada foi registrado nesta tentativa');
  await expect(modal.getByLabel('Título', { exact: true })).toBeEnabled();
  await modal.getByLabel('Título', { exact: true }).fill('Demanda corrigida');
  await modal.getByRole('button', { name: 'Registrar demanda' }).click();
  await expect(modal).toHaveCount(0);
  const detail = page.getByRole('complementary', { name: 'Detalhes da demanda' });
  await expect(detail.getByLabel('Título', { exact: true })).toHaveValue('Demanda corrigida');
  await page.getByRole('button', { name: 'Rejeitar próximo registro', exact: true }).click();
  await detail.getByLabel('Nota interna', { exact: true }).fill('Nota para corrigir');
  await detail.getByRole('button', { name: 'Adicionar nota' }).click();
  await expect(detail.getByRole('alert')).toContainText('Responsável inválido');
  await expect(detail.getByLabel('Nota interna', { exact: true })).toBeEnabled();
  await detail.getByLabel('Nota interna', { exact: true }).fill('Nota corrigida');
  await detail.getByRole('button', { name: 'Adicionar nota' }).click();
  await expect(detail.getByText('Nota corrigida', { exact: true })).toBeVisible();
  await expect(detail.getByText('Nota para corrigir', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Contar gravações' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-write-count', '2');
});

test('a rejection after an uncertain result never unlocks the original payload', async ({ page }) => {
  await page.goto('/tests/ui/?demands');
  await page.getByRole('button', { name: 'Interromper e rejeitar repetição', exact: true }).click();
  await page.getByRole('button', { name: 'Nova demanda', exact: false }).click();
  const modal = page.getByRole('dialog', { name: 'Nova demanda' });
  await modal.getByLabel('Título', { exact: true }).fill('Conteúdo original confirmado depois');
  await modal.getByRole('button', { name: 'Registrar demanda' }).click();
  await expect(modal.getByRole('alert')).toContainText('Resposta interrompida');
  await modal.getByRole('button', { name: 'Registrar demanda' }).click();
  await expect(modal.getByRole('alert')).toContainText('Responsável inválido');
  await expect(modal.getByLabel('Título', { exact: true })).toBeDisabled();
  await expect(modal.getByRole('alert')).not.toContainText('Nada foi registrado');
  await modal.getByRole('button', { name: 'Registrar demanda' }).click();
  await expect(modal).toHaveCount(0);
  await page.getByRole('button', { name: 'Contar gravações' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-write-count', '1');
});

test('history uses fixed pages so older events remain reachable under an API row limit', async ({ page }) => {
  await page.goto('/tests/ui/?demands');
  await page.getByRole('button', { name: 'Popular histórico', exact: true }).click();
  await page.getByRole('button', { name: /Revisar contrato do cliente/ }).click();
  const history = page.getByRole('region', { name: 'Histórico da demanda' });
  await expect(history.getByRole('listitem')).toHaveCount(25);
  await expect(history.getByText('Registro histórico 60', { exact: true })).toBeVisible();
  await history.getByRole('button', { name: 'Carregar histórico anterior' }).click();
  await expect(history.getByRole('listitem')).toHaveCount(50);
  await history.getByRole('button', { name: 'Carregar histórico anterior' }).click();
  await expect(history.getByRole('listitem')).toHaveCount(61);
  await expect(history.getByText('Registro histórico 1', { exact: true })).toBeVisible();
  await expect(history.getByText('Demanda criada', { exact: true })).toBeVisible();
  await expect(history.getByRole('button', { name: 'Carregar histórico anterior' })).toHaveCount(0);
  await history.getByRole('button', { name: 'Atualizar histórico' }).click();
  await expect(history.getByRole('listitem')).toHaveCount(25);
});

test('conflict preserves draft until explicit reload; workspace switch clears notes and selection', async ({ page }) => {
  await page.goto('/tests/ui/?demands');
  await page.getByRole('button', { name: /Revisar contrato do cliente/ }).click();
  const detail = page.getByRole('complementary', { name: 'Detalhes da demanda' });
  await detail.getByLabel('Título', { exact: true }).fill('Meu rascunho');
  await page.getByRole('button', { name: 'Simular edição simultânea' }).click();
  await detail.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(detail.getByRole('alert')).toContainText('Outra pessoa atualizou');
  await expect(detail.getByLabel('Título', { exact: true })).toHaveValue('Meu rascunho');
  await detail.getByRole('button', { name: 'Recarregar dados e descartar' }).click();
  await expect(detail.getByLabel('Título', { exact: true })).toHaveValue('Atualizado por colega');
  await detail.getByLabel('Nota interna', { exact: true }).fill('Rascunho confidencial desta empresa');
  await page.getByRole('button', { name: 'Respostas lentas' }).click();
  await page.getByRole('button', { name: 'Outra empresa', exact: true }).click();
  await expect(detail).toHaveCount(0);
  await expect(page.getByText('Nenhuma demanda nesta visão.')).toBeVisible();
  await expect(page.getByText('Rascunho confidencial desta empresa')).toHaveCount(0);
  await expect(page.getByText('Atualizado por colega')).toHaveCount(0);
});

test('pagination, literal search and priority filters cover the full queue', async ({ page }) => {
  await page.goto('/tests/ui/?demands');
  await page.getByRole('button', { name: 'Popular fila' }).click();
  await page.getByRole('button', { name: 'Atualizar lista' }).click();
  await expect(page.getByText('27 demandas', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Próxima', exact: true }).click();
  await expect(page.getByText('Página 2')).toBeVisible();
  await page.getByLabel('Buscar por título').fill('Extra 25');
  await expect(page.getByText('1 demanda', { exact: true })).toBeVisible();
  await expect(page.getByText('Página 1')).toBeVisible();
  await page.getByLabel('Prioridade', { exact: true }).selectOption('URGENT');
  await expect(page.getByText('Nenhuma demanda nesta visão.')).toBeVisible();
});

test('phone layout and cancel return focus without leaving a modal behind', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tests/ui/?demands');
  const create = page.getByRole('button', { name: 'Nova demanda', exact: false });
  await create.click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(create).toBeFocused();
  await page.getByRole('button', { name: /Revisar contrato do cliente/ }).click();
  await expect(page.getByLabel('Título', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Fechar detalhes' }).click();
  await expect(page.getByRole('complementary', { name: 'Detalhes da demanda' })).toHaveCount(0);
});

test('painel de atendimento, fila sem responsável e demanda confidencial', async ({ page }) => {
  await page.goto('/tests/ui/?demands');
  const panel = page.getByRole('region', { name: 'Painel de atendimento' });
  await expect(panel.getByRole('list', { name: 'Resumo das demandas' })).toBeVisible();
  await expect(panel.getByText('Atrasadas', { exact: true })).toBeVisible();
  await expect(panel.getByText('Nenhum aviso por enquanto.')).toBeVisible();
  await panel.getByText('Prazos e responsável de triagem').click();
  await expect(panel.getByLabel('Responsável pela triagem')).toBeVisible();
  await expect(panel.getByLabel('Prazo Urgente (horas)')).toHaveValue('4');
  await panel.getByLabel('Prazo Normal (horas)').fill('abc');
  await panel.getByRole('button', { name: 'Salvar configuração' }).click();
  await expect(panel.getByRole('alert')).toContainText('números inteiros');
  await panel.getByLabel('Prazo Normal (horas)').fill('48');
  await panel.getByRole('button', { name: 'Salvar configuração' }).click();
  await expect(panel.getByRole('status')).toContainText('Configuração salva');
  await page.getByRole('button', { name: 'Sem responsável', exact: true }).click();
  await expect(page.getByRole('button', { name: /Revisar contrato do cliente/ })).toBeVisible();
  await page.getByRole('button', { name: /Nova demanda/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova demanda' });
  await expect(dialog.getByText('usa o prazo da prioridade')).toBeVisible();
  await expect(dialog.getByLabel(/Demanda confidencial/)).not.toBeChecked();
});

test('avisos além dos 20 primeiros ficam acessíveis e só os exibidos são marcados como lidos', async ({ page }) => {
  await page.goto('/tests/ui/?demands');
  await page.getByRole('button', { name: 'Popular avisos' }).click();
  await page.getByRole('button', { name: 'Alternar tela' }).click();
  await page.getByRole('button', { name: 'Alternar tela' }).click();
  const panel = page.getByRole('region', { name: 'Painel de atendimento' });
  const alerts = panel.getByRole('button', { name: /^Atrasada Aviso/ });
  await expect(alerts).toHaveCount(20);
  await expect(panel.getByRole('heading', { name: /Meus avisos/ })).toContainText('45');
  await panel.getByRole('button', { name: 'Marcar exibidos como lidos' }).click();
  await page.getByRole('button', { name: 'Contar marcados' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-marked-count', '20');
  await expect(panel.getByRole('heading', { name: /Meus avisos/ })).toContainText('25');
  await expect(panel.getByRole('button', { name: /Mostrar mais avisos \(20 de 45\)/ })).toBeVisible();
  await panel.getByRole('button', { name: /Mostrar mais avisos/ }).click();
  await expect(alerts).toHaveCount(40);
  await panel.getByRole('button', { name: /Mostrar mais avisos \(40 de 45\)/ }).click();
  await expect(alerts).toHaveCount(45);
  await expect(panel.getByRole('button', { name: /Mostrar mais avisos/ })).toHaveCount(0);
});
