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
