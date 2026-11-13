import { test, expect } from '@playwright/test';

test('sector execution prevents early resolution, records result and retains history', async ({ page }) => {
  await page.goto('/tests/ui/?demands');
  await page.getByRole('button', { name: /Revisar contrato do cliente/ }).click();
  const detail = page.getByRole('complementary', { name: 'Detalhes da demanda' });
  const tasks = detail.getByRole('region', { name: 'Tarefas por setor' });
  await tasks.getByRole('button', { name: 'Nova tarefa' }).click();
  await tasks.getByLabel('Título da tarefa').fill('Analisar cobrança fiscal');
  await tasks.getByLabel('Setor', { exact: true }).selectOption('LEGAL');
  await tasks.getByLabel('Executor', { exact: true }).selectOption('user-one');
  await tasks.getByLabel('Prazo da tarefa').fill('2026-11-20T14:00');
  await tasks.getByRole('button', { name: 'Salvar tarefa', exact: true }).click();
  await expect(tasks.getByText('Analisar cobrança fiscal', { exact: true })).toBeVisible();
  await detail.getByLabel('Estado', { exact: true }).selectOption('RESOLVED');
  await detail.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(detail.getByRole('alert')).toContainText('tarefas obrigatórias');
  await detail.getByLabel('Estado', { exact: true }).selectOption('OPEN');
  await tasks.getByRole('button', { name: 'Editar tarefa' }).click();
  await tasks.getByLabel('Situação da tarefa').selectOption('DONE');
  await tasks.getByLabel('Resultado ou justificativa').fill('Cobrança analisada e parecer validado.');
  await tasks.getByRole('button', { name: 'Salvar tarefa', exact: true }).click();
  await expect(tasks.getByText('Cobrança analisada e parecer validado.')).toBeVisible();
  await detail.getByLabel('Estado', { exact: true }).selectOption('RESOLVED');
  await detail.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(tasks.getByText('Reabra a demanda para alterar tarefas.')).toBeVisible();
});

test('lost task response reuses stable task id and payload', async ({ page }) => {
  await page.goto('/tests/ui/?demands');
  await page.getByRole('button', { name: /Revisar contrato do cliente/ }).click();
  const tasks = page.getByRole('region', { name: 'Tarefas por setor' });
  await tasks.getByRole('button', { name: 'Nova tarefa' }).click();
  await tasks.getByLabel('Título da tarefa').fill('Conferir documentos');
  await tasks.getByLabel('Executor', { exact: true }).selectOption('user-one');
  await tasks.getByLabel('Prazo da tarefa').fill('2026-11-20T14:00');
  await page.getByRole('button', { name: 'Interromper retorno', exact: true }).click();
  await tasks.getByRole('button', { name: 'Salvar tarefa', exact: true }).click();
  await expect(tasks.getByLabel('Título da tarefa')).toBeDisabled();
  await tasks.getByRole('button', { name: 'Conferir registro da tarefa' }).click();
  await expect(tasks.getByText('Conferir documentos', { exact: true })).toHaveCount(1);
});

test('client report is explicit about current backlog and updates after company switch', async ({ page }) => {
  await page.goto('/tests/ui/?demands');
  await page.getByRole('button', { name: 'Relatório mensal do cliente', exact: true }).click();
  const report = page.getByRole('region', { name: 'Relatório mensal do cliente' });
  await report.getByLabel('Cliente do relatório').selectOption('lead-one');
  await expect(report.getByText('Pendentes agora', { exact: true })).toBeVisible();
  await expect(report.getByText(/não é o saldo histórico/)).toBeVisible();
  await page.getByRole('button', { name: 'Outra empresa', exact: true }).click();
  await page.getByRole('button', { name: 'Relatório mensal do cliente', exact: true }).click();
  await expect(report.getByLabel('Cliente do relatório')).toHaveValue('');
  await expect(report.getByText('Revisar contrato do cliente', { exact: true })).toHaveCount(0);
});
