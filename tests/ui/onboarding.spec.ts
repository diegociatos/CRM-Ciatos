import {test,expect} from '@playwright/test';
test('CafeWorking does not preview a tax or accounting journey',async({page})=>{
 await page.route('**/rest/v1/onboarding_steps*',r=>r.fulfill({json:[]}));
 await page.goto('/tests/ui/?onboarding-empty-cafe');
 await expect(page.getByRole('heading',{name:'Uma jornada para sua operação'})).toBeVisible();
 await expect(page.getByText('Implantação contábil')).toHaveCount(0);
 await expect(page.getByRole('button',{name:/Criar modelo de jornada/})).toBeVisible();
});
for(const width of [1440,390]){
 test(`onboarding empty state has useful actions at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:1000});let failure=true;
  await page.route('**/rest/v1/onboarding_steps*',r=>r.fulfill(failure?{status:400,json:{message:'Falha'}}:{json:[]}));
  await page.goto('/tests/ui/?onboarding-empty');await expect(page.getByRole('alert')).toContainText('Não foi possível');failure=false;
  await page.getByRole('button',{name:'Tentar novamente'}).click();await expect(page.getByRole('heading',{name:/Uma boa parceria/})).toBeVisible();
  await expect(page.getByText('Selecione um cliente.',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:/Importar carteira de clientes/}).click();await expect(page.getByRole('status')).toHaveText('Importar carteira');
  await page.getByRole('button',{name:/Revisar modelos de jornada/}).click();await expect(page.getByRole('status')).toHaveText('Modelos de jornada');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/onboarding-empty-${width}.png`,fullPage:true});
 });
 test(`onboarding starts, retries, filters and completes a phase at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:1000});let steps:any[]=[];let failStart=true,failUpdate=true;let starts=0;const payloads:any[]=[];
  await page.route('**/rest/v1/onboarding_steps*',r=>r.fulfill({json:steps}));
  for(const table of ['onboarding_comments','onboarding_files','onboarding_notifications'])await page.route(`**/rest/v1/${table}*`,r=>r.fulfill({json:[]}));
  await page.route('**/rest/v1/rpc/start_onboarding',r=>{starts++;payloads.push(r.request().postDataJSON());if(failStart){failStart=false;return r.fulfill({status:400,json:{message:'Falha ao iniciar'}});}steps=[{id:'s1',organization_id:'org-contabilidade',lead_id:'lead-qa',titulo:'Boas-vindas e alinhamento',descricao:'Alinhar o início da parceria',ordem:0,status:'Em Andamento',executor:'equipe',responsavel_id:'user-qa',obrigatoria:true,prazo:'2026-09-28'},{id:'s2',organization_id:'org-contabilidade',lead_id:'lead-qa',titulo:'Receber documentos',ordem:1,status:'Pendente',executor:'cliente',responsavel_id:'user-qa',obrigatoria:true,prazo:'2026-09-30'}];return r.fulfill({json:2});});
  await page.route('**/rest/v1/rpc/update_onboarding_step',r=>{if(failUpdate){failUpdate=false;return r.fulfill({status:400,json:{message:'Falha ao concluir'}});}const p=r.request().postDataJSON();steps=steps.map(s=>s.id===p.sid?{...s,status:p.novo_status}:s);return r.fulfill({json:{ok:true}});});
  await page.goto('/tests/ui/?onboarding');await expect(page.getByRole('heading',{name:'Iniciar onboarding de Cliente Exemplo'})).toBeVisible();
  await expect(page.getByText('até 28/09/2026',{exact:true})).toBeVisible();
  await page.getByLabel('Início',{exact:true}).fill('');await expect(page.getByRole('button',{name:'Confirmar e iniciar jornada'})).toBeDisabled();
  await page.getByLabel('Início',{exact:true}).fill('2026-09-28');await page.getByRole('button',{name:'Confirmar e iniciar jornada'}).click();await expect(page.getByRole('alert')).toContainText('Falha ao iniciar');await expect(page.getByLabel('Início',{exact:true})).toHaveValue('2026-09-28');
  await page.getByRole('button',{name:'Confirmar e iniciar jornada'}).click();await expect(page.getByRole('progressbar')).toHaveAttribute('value','0');expect(starts).toBe(2);expect(payloads[1].lid).toBe('lead-qa');
  await page.getByRole('button',{name:/^1 Boas-vindas e alinhamento/}).click();const details=page.getByRole('complementary',{name:'Detalhes da fase'});await expect(details).toBeVisible();await details.getByLabel('Comentário da fase').fill('Nota ainda não salva');page.once('dialog',d=>d.dismiss());await page.getByRole('tab',{name:/Minhas fases/}).click();await expect(details.getByLabel('Comentário da fase')).toHaveValue('Nota ainda não salva');await details.getByLabel('Comentário da fase').fill('');
  await details.getByRole('button',{name:'✓ Concluir fase'}).click();await expect(details.getByRole('alert')).toContainText('Falha ao concluir');await expect(page.getByRole('progressbar')).toHaveAttribute('value','0');
  await details.getByRole('button',{name:'✓ Concluir fase'}).click();await expect(page.getByRole('progressbar')).toHaveAttribute('value','50');
  await page.screenshot({path:`test-results/onboarding-journey-${width}.png`,fullPage:true});
  await page.getByLabel('Buscar cliente',{exact:true}).fill('não existe');await expect(page.getByText('Nenhuma jornada nesta seleção')).toBeVisible();await expect(page.getByRole('progressbar')).toHaveCount(0);await page.getByRole('button',{name:'Limpar filtros'}).click();await expect(page.getByRole('progressbar')).toBeVisible();
  await page.getByRole('tab',{name:/Minhas fases/}).click();await expect(page.getByRole('button',{name:/Receber documentos/})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 });
}
