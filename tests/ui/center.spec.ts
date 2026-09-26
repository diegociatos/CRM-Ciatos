import {test,expect} from '@playwright/test';
test('Central works with mocked data: safe enrollment, intervention, tenant switch and errors',async({page})=>{
  const calls:{name:string;body:any}[]=[];
  const data:Record<string,any[]>={
    organizations:[{id:'org-a',nome:'Ciatos'},{id:'org-b',nome:'Outra empresa'}],
    leads:[{id:'lead-a',organization_id:'org-a',nome:'Ana',empresa:'Empresa de teste',email:'ana@example.test'}],
    outreach_policy:[{organization_id:'org-a',live_enabled:false}],
    outreach_sequences:[{id:'seq-a',organization_id:'org-a',nome:'Cadência de teste',status:'ACTIVE'}],
    human_handoffs:[{id:1,organization_id:'org-a',lead_id:'lead-a',reason:'Solicitou ligação',status:'OPEN',priority:'HIGH'}],
  };
  await page.route('**/rest/v1/**',async route=>{
    const url=new URL(route.request().url()); const name=url.pathname.split('/').pop()!;
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
    if(route.request().method()==='OPTIONS'){await route.fulfill({status:200,headers});return;}
    if(url.pathname.includes('/rpc/')){
      const body=route.request().postDataJSON();calls.push({name,body});
      if(name==='resolve_handoff') data.human_handoffs[0].status=body.resolution;
      await route.fulfill({json:name==='tenant_member'?true:null,headers});return;
    }
    if(name==='message_events') expect(url.searchParams.get('order')).toBe('occurred_at.desc');
    const org=url.searchParams.get('organization_id')?.replace('eq.','');
    await route.fulfill({json:(data[name] || []).filter(r=>!org || r.organization_id===org),headers});
  });
  await page.goto('/tests/ui/');
  await expect(page.getByRole('heading',{name:'Central da IA'})).toBeVisible();
  await expect(page.getByText('Solicitou ligação')).toBeVisible();
  await page.getByRole('button',{name:'Assumir atendimento'}).click();
  await expect(page.getByText('Em atendimento · Alta prioridade')).toBeVisible();
  await page.getByRole('button',{name:'Cadências',exact:true}).click();
  await page.getByLabel('Cadência',{exact:true}).selectOption('seq-a');
  await page.getByLabel('Lead',{exact:true}).selectOption('lead-a');
  await page.getByRole('button',{name:'Inscrever em simulação'}).click();
  await expect(page.getByRole('status').filter({hasText:'Alteração registrada.'})).toHaveText('Alteração registrada.');
  expect(calls.find(c=>c.name==='enroll_lead')?.body).toEqual({sid:'seq-a',lid:'lead-a',simulate:true});
  await page.getByLabel('Empresa',{exact:true}).selectOption('org-b');
  await expect(page.getByText('Cadência de teste',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Precisa de você',exact:true}).click();
  await expect(page.getByText('Nenhuma intervenção pendente nesta empresa.')).toBeVisible();
  await page.route('**/rest/v1/outreach_sequences?**',route=>route.fulfill({status:400,json:{message:'unavailable'},headers:{'Access-Control-Allow-Origin':'*'}}));
  await page.getByRole('button',{name:'Atualizar',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível carregar');
  await expect(page.getByText('Nenhuma intervenção pendente nesta empresa.')).toHaveCount(0);
  await page.unroute('**/rest/v1/outreach_sequences?**');
  await page.getByRole('button',{name:'Atualizar',exact:true}).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('Nenhuma intervenção pendente nesta empresa.')).toBeVisible();
});
