import {test,expect,Page} from '@playwright/test';
async function company(page:Page){
 await page.getByRole('button',{name:'Novo Lead',exact:true}).click();
 await page.getByLabel('Razão social').fill('Empresa Exemplo — demonstração');
 await page.getByLabel('CNPJ *',{exact:true}).fill('00.000.000/0000-00');
 await page.getByLabel('Nome fantasia').fill('Empresa Exemplo');
}
async function contact(page:Page){
 await page.getByRole('button',{name:'Continuar →'}).click();
 await page.getByLabel('Nome do contato').fill('Ana — exemplo fictício');
 await page.getByLabel('Telefone / WhatsApp').fill('(00) 90000-0000');
 await page.getByLabel('E-mail profissional').fill('contato@example.test');
}
test.beforeEach(async({page})=>{await page.goto('/tests/ui/?flow');});
test('empty views explain the next action on desktop and mobile',async({page})=>{
 await expect(page.getByRole('heading',{name:'Tudo pronto para receber novos leads.'})).toBeVisible();
 await page.getByRole('button',{name:'Pipeline Comercial',exact:true}).click();
 await expect(page.getByRole('heading',{name:'O pipeline começa com um lead qualificado.'})).toBeVisible();
 await page.getByRole('button',{name:'Minha Agenda',exact:true}).click();
 await expect(page.getByText('Nenhum compromisso neste dia.')).toBeVisible();
 await page.getByRole('button',{name:'Agendar atividade →'}).click();
 await expect(page.getByRole('dialog',{name:'Agendar atividade'})).toBeVisible();
 await page.getByRole('button',{name:'Fechar agendamento'}).click();
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Pipeline Comercial',exact:true}).click();
 await expect(page.getByRole('heading',{name:'O pipeline começa com um lead qualificado.'})).toBeInViewport();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
test('cancel, Escape and dirty protection preserve deliberate user choices',async({page})=>{
 await page.getByRole('button',{name:'Novo Lead',exact:true}).click();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Novo Lead',exact:true})).toBeFocused();
 await company(page);
 await page.getByRole('button',{name:'Fechar cadastro'}).click();
 await expect(page.getByRole('alertdialog')).toBeVisible();
 await page.getByRole('button',{name:'Continuar cadastro'}).click();
 await expect(page.getByLabel('Razão social')).toHaveValue('Empresa Exemplo — demonstração');
 await page.getByRole('button',{name:'Cancelar',exact:true}).click();
 await page.getByRole('button',{name:'Sair sem salvar',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
});
for(const mode of ['fail','throw'])test(`save ${mode} retains contact and supports retry`,async({page})=>{
 await page.getByLabel('Resultado simulado').selectOption(mode);
 await company(page);await contact(page);
 await page.getByRole('button',{name:'Salvar lead',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Não foi possível salvar');
 await expect(page.getByLabel('Nome do contato')).toHaveValue('Ana — exemplo fictício');
 await page.getByRole('button',{name:'Voltar',exact:true}).click();
 await expect(page.getByLabel('Razão social')).toHaveValue('Empresa Exemplo — demonstração');
});
test('complete lead journey and illustrated help',async({page})=>{
 await company(page);await contact(page);
 await page.getByRole('button',{name:'Salvar lead',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByRole('status')).toHaveText('Lead cadastrado com sucesso.');
 await page.getByRole('button',{name:'Abrir cadastro',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Detalhes do lead'})).toBeVisible();
 await page.getByRole('button',{name:'Fechar detalhes do lead'}).click();
 await page.getByRole('button',{name:'Aprovar para pipeline',exact:true}).click();
 await page.getByRole('button',{name:'Pipeline Comercial',exact:true}).click();
 await expect(page.getByText('Empresa Exemplo',{exact:true})).toBeVisible();
 await page.getByLabel('Mover Empresa Exemplo para etapa').selectOption('ph-contato');
 await expect(page.getByLabel('Mover Empresa Exemplo para etapa')).toHaveValue('ph-contato');
 await page.getByRole('button',{name:'Ajuda e passo a passo'}).click();
 for(const summary of await page.locator('summary').all())await summary.click();
 for(const img of await page.locator('img').all()){
  await expect(img).toBeVisible();
  await expect.poll(()=>img.evaluate((e:HTMLImageElement)=>e.naturalWidth)).toBeGreaterThan(0);
  expect(await img.evaluate((e:HTMLImageElement)=>e.naturalWidth)).toBeGreaterThan(0);
 }
});
test('mobile essential actions stay inside viewport',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await company(page);await contact(page);
 for(const name of ['Fechar cadastro','Cancelar','Salvar lead']){
  const box=await page.getByRole('button',{name,exact:true}).boundingBox();
  expect(box).toBeTruthy();expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x+box!.width).toBeLessThanOrEqual(390);expect(box!.y+box!.height).toBeLessThanOrEqual(844);
 }
 await page.getByRole('button',{name:'Complementar dados'}).click();
 await expect(page.getByRole('button',{name:'Salvar lead',exact:true})).toBeInViewport();
});
test('agenda keeps failed activity and closes only after successful save',async({page})=>{
 await page.getByLabel('Resultado simulado').selectOption('fail');
 await page.getByRole('button',{name:'Minha Agenda',exact:true}).click();
 await page.getByRole('button',{name:'+ Novo Agendamento'}).click();
 await page.getByLabel('Título da Tarefa').fill('Retorno de demonstração');
 await page.getByRole('button',{name:'Salvar atividade'}).click();
 await expect(page.getByRole('alert')).toContainText('Não foi possível salvar');
 await expect(page.getByLabel('Título da Tarefa')).toHaveValue('Retorno de demonstração');
 await page.getByRole('button',{name:'Cancelar',exact:true}).click();
 await page.getByRole('button',{name:'Sair sem salvar',exact:true}).click();
 await page.getByLabel('Resultado simulado').selectOption('success');
 await page.getByRole('button',{name:'+ Novo Agendamento'}).click();
 await page.getByLabel('Título da Tarefa').fill('Retorno salvo');
 await page.getByRole('button',{name:'Salvar atividade'}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByText('Retorno salvo',{exact:true})).toBeVisible();
});
