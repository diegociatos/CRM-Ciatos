import { test, expect } from '@playwright/test';

test('importa planilha de clientes e monta comunicado com público e teste', async ({ page }) => {
  test.setTimeout(60000);
  const uid = '11111111-1111-4111-8111-111111111111', a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const companies = [{ id: a, nome: 'Ciatos Contabilidade', operating_role: 'ADMIN', can_manage: true, can_platform: false, is_master: true, registration: {} }];
  const user = { id: uid, email: 'test@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const token = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: uid, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })).toString('base64url') + '.test';
  await page.addInitScript(({ user, token }) => { localStorage.setItem('ciatos_crm_auth', JSON.stringify({ access_token: token, refresh_token: 'test', expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user })); }, { user, token });
  const calls: { name: string; body: any }[] = [];
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
  await page.route('**/auth/v1/**', route => route.fulfill({ json: user }));
  await page.route('**/functions/v1/crm-ms365', route => route.fulfill({ headers, json: { appConfigurado: true, conectado: true, conta_email: 'envio@grupociatos.com.br', envia_como: 'envio@grupociatos.com.br' } }));
  await page.route('**/functions/v1/crm-mail', route => { calls.push({ name: 'crm-mail', body: route.request().postDataJSON() }); return route.fulfill({ headers, json: { ok: true, para: 'test@example.test' } }); });
  await page.route('**/rest/v1/**', async route => {
    const req = route.request(), url = new URL(req.url()), name = url.pathname.split('/').pop()!;
    if (req.method() === 'OPTIONS') return route.fulfill({ headers, status: 200 });
    if (url.pathname.includes('/rpc/')) {
      const body = req.postDataJSON(); calls.push({ name, body });
      const json: any = name === 'my_companies' ? companies : name === 'tenant_member' || name === 'pode_administrar' ? true
        : name === 'import_leads' ? { inseridos: body.linhas.length, atualizados: 0, ignorados: 0, erros: [] }
        : name === 'import_radar_sheet' ? { job_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', inseridos: body.linhas.length, ignorados: 0, erros: [] }
        : name === 'broadcast_audience_count' ? { total: body.aud.tags?.length ? 1 : 2, exemplos: ['Alfa'] }
        : name === 'save_broadcast' ? 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' : name === 'broadcast_stats' ? [] : null;
      return route.fulfill({ headers, json });
    }
    if (name === 'profiles') return route.fulfill({ headers, json: { id: uid, nome: 'Pessoa', email: 'test@example.test', papel: 'ADMIN', departamento: 'Comercial', ativo: true } });
    if (name === 'config') return route.fulfill({ headers, json: { dados: {} } });
    if (name === 'outreach_policy') return route.fulfill({ headers, json: { organization_id: a, live_enabled: false, daily_limit: 25 } });
    if (name === 'leads' && url.searchParams.get('select') === 'tags') return route.fulfill({ headers, json: [{ tags: ['VIP', 'Newsletter'] }] });
    return route.fulfill({ headers, json: [] });
  });

  await page.goto('/tests/ui/?companies');
  await page.getByRole('button', { name: 'Importar contatos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Importar contatos' })).toBeVisible();
  const csv = 'Razão social;Nome fantasia;CNPJ;Contato;E-mail;Cidade;UF\r\nAlfa Ltda;Alfa;11.222.333/0001-81;Ana;ana@alfa.test;BH;MG\r\nBeta SA;;;Bruno;invalido;;\r\n';
  await page.getByLabel('Arquivo da planilha').setInputFiles({ name: 'clientes.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
  await expect(page.getByText('1 com e-mail válido')).toBeVisible();
  await expect(page.getByText(/1 com e-mail inválido/)).toBeVisible();
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Importar 2 contato(s)' }).click();
  await expect(page.getByText('2 novo(s)')).toBeVisible();
  const imp = calls.find(c => c.name === 'import_leads')!.body;
  expect(imp.tipo).toBe('cliente');
  expect(imp.linhas[0]).toMatchObject({ razao_social: 'Alfa Ltda', nome_fantasia: 'Alfa', cnpj: '11.222.333/0001-81', contato: 'Ana', email: 'ana@alfa.test', uf: 'MG' });

  // Lista de prospecção: vai para o Radar (Snov.io + cadência), não para a carteira.
  await page.getByText('Lista para o Snov.io e cadência').click();
  const leadsCsv = 'Empresa;Contato;E-mail;Site\r\nGama;Carla;carla@gama.test;\r\nDelta;Davi;;https://www.delta.com.br\r\nÉpsilon;Eva;;\r\n';
  await page.getByLabel('Arquivo da planilha').setInputFiles({ name: 'feira.csv', mimeType: 'text/csv', buffer: Buffer.from(leadsCsv, 'utf8') });
  await expect(page.getByText('1 só com site')).toBeVisible();
  await expect(page.getByText(/1 sem e-mail e sem site/)).toBeVisible();
  await page.getByRole('button', { name: 'Criar lista com 3 lead(s)' }).click();
  await expect(page.getByText('Dê um nome à lista de prospecção')).toBeVisible();
  await page.getByLabel('Nome da lista').fill('Feira de Logística');
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Criar lista com 3 lead(s)' }).click();
  await expect(page.getByRole('heading', { name: 'Lista criada' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ligar o agente nesta lista' })).toBeVisible();
  const lista = calls.find(c => c.name === 'import_radar_sheet')!.body;
  expect(lista).toMatchObject({ org: a, job: null, lista: 'Feira de Logística', arquivo: 'feira.csv' });
  expect(lista.linhas[1]).toMatchObject({ nome_fantasia: 'Delta', contato: 'Davi', site: 'https://www.delta.com.br' });
  expect(calls.filter(c => c.name === 'import_leads')).toHaveLength(1);

  await page.getByRole('button', { name: 'Comunicados', exact: true }).click();
  await expect(page.getByText('Envio desligado nesta empresa')).toBeVisible();
  await expect(page.getByText('● Conectada: envio@grupociatos.com.br')).toBeVisible();
  await expect(page.getByLabel('E-mail remetente')).toHaveValue('envio@grupociatos.com.br');
  await page.getByRole('button', { name: '+ Novo comunicado' }).click();
  await page.getByLabel('Nome interno').fill('Aviso IR');
  await page.getByLabel('Assunto do e-mail').fill('{{company}}, prazo do IR');
  await page.getByLabel('Mensagem').fill('Olá {{name}},\n\nO prazo termina em breve.');
  await expect(page.getByText('2 contato(s) vão receber')).toBeVisible();
  await page.getByRole('button', { name: 'VIP' }).click();
  await expect(page.getByText('1 contato(s) vão receber')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar agora' })).toBeDisabled();
  await page.getByRole('button', { name: 'Enviar teste para mim' }).click();
  await expect(page.getByText('Teste enviado para test@example.test')).toBeVisible();
  expect(calls.find(c => c.name === 'crm-mail')!.body).toMatchObject({ action: 'test', kind: 'broadcast', organization_id: a });
  await page.getByRole('button', { name: 'Salvar rascunho' }).click();
  await expect(page.getByText('Rascunho salvo.')).toBeVisible();
  expect(calls.find(c => c.name === 'save_broadcast')!.body.aud).toEqual({ relacao: 'cliente', tags: ['VIP'], uf: '', segmento: '' });
});
