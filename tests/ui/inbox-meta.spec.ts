import { test, expect } from '@playwright/test';

test('WhatsApp no Inbox: rótulos do canal, resposta incerta conferida pelo gestor, recusa do canal sem bloquear o editor', async ({ page }) => {
  await page.goto('/tests/ui/?inbox-meta');
  await expect(page.getByText(/WHATSAPP · ATD-000007/)).toBeVisible();
  await expect(page.getByText('+5531999990001').first()).toBeVisible();
  await expect(page.getByText('E-mail não disponível')).toHaveCount(0);
  await expect(page.getByText('Confira no aplicativo do canal antes de reenviar.')).toBeVisible();
  await expect(page.getByText(/caixa Microsoft 365 (antes|e da pol)/)).toHaveCount(0);
  await expect(page.getByLabel('Responder por WhatsApp')).toBeVisible();
  await page.getByRole('button', { name: 'Conferi: não foi enviada' }).click();
  await expect(page.getByText('Conferido manualmente: não foi enviada')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Você já pode responder de novo' })).toBeVisible();
  // recusa do canal: mostra o motivo e continua podendo escrever
  await page.getByLabel('Responder por WhatsApp').fill('Pode me enviar o documento?');
  await page.getByRole('button', { name: 'Revisar resposta' }).click();
  await expect(page.getByText('Assunto:')).toHaveCount(0);
  await page.getByRole('button', { name: 'Confirmar envio' }).click();
  await expect(page.getByRole('alert')).toContainText('recusou');
  await expect(page.getByText('Recusada pelo canal (HTTP 400, código 131047)')).toBeVisible();
  await expect(page.getByLabel('Responder por WhatsApp')).toBeEnabled();
  // aceito: confirma sem chamar de Microsoft
  await page.getByRole('button', { name: 'Próximo envio aceito' }).click();
  await page.getByLabel('Responder por WhatsApp').fill('Enviei agora.');
  await page.getByRole('button', { name: 'Revisar resposta' }).click();
  await page.getByRole('button', { name: 'Confirmar envio' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'aceita pela Meta' })).toBeVisible();
});
