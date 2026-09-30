import { test, expect } from '@playwright/test';

test('Radar informa falta de créditos sem expor o erro técnico e preserva a lista', async ({ page }) => {
  await page.route('**/rest/v1/**', route => {
    const req = route.request();
    const name = new URL(req.url()).pathname.split('/').pop();
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers });
    if (name === 'mining_jobs') return route.fulfill({ headers, json: [{
      id: 'job-a', status: 'Failed', created_at: '2026-09-30T12:00:00Z', updated_at: '2026-09-30T12:00:00Z',
      dados: { name: 'Transporte de Cargas', foundCount: 4, targetCount: 100,
        filters: { segment: 'Transporte de Cargas', city: '', state: 'MG', size: 'all', taxRegime: '' },
        lastError: 'provider 400: Your credit balance is too low to access the Anthropic API' },
    }] });
    return route.fulfill({ headers, json: [] });
  });
  await page.goto('/tests/ui/?radar-error');
  await expect(page.getByRole('heading', { name: 'Transporte de Cargas' })).toBeVisible();
  await expect(page.getByText('4 / 100')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('saldo da IA insuficiente');
  await expect(page.getByRole('link', { name: /Abrir faturamento da Anthropic/ })).toBeVisible();
  await expect(page.getByText('provider 400')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retomar busca' })).toBeVisible();
});

test('Radar mostra fontes verificáveis dos resultados sem aceitar link inseguro', async ({ page }) => {
  await page.route('**/rest/v1/**', route => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, headers });
    if (name === 'mining_jobs') return route.fulfill({ headers, json: [{ id: 'job-a', status: 'Completed', created_at: '2026-09-30T12:00:00Z', updated_at: '2026-09-30T12:00:00Z', dados: { name: 'Empresas QA', foundCount: 1, targetCount: 10, filters: { segment: 'Consultoria', city: '', state: '', size: 'all', taxRegime: '' } } }] });
    if (name === 'mining_leads') return route.fulfill({ headers, json: [{ id: 'lead-a', job_id: 'job-a', imported: false, cnpj_raw: '12345678000195', created_at: '2026-09-30T12:00:00Z', dados: { name: 'Empresa QA', tradeName: 'Empresa QA', cnpj: '12.345.678/0001-95', phoneCompany: '', emailCompany: '', partners: [], contactName: '', contactPhone: '', sources: ['https://empresa.example/fonte', 'javascript:alert(1)'] } }] });
    return route.fulfill({ headers, json: [] });
  });
  await page.goto('/tests/ui/?radar-error');
  await page.getByRole('button', { name: 'Inspecionar Resultados' }).click();
  await expect(page.getByRole('link', { name: 'Fonte 1' })).toHaveAttribute('href', 'https://empresa.example/fonte');
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
});
