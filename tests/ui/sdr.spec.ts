import {test,expect} from '@playwright/test';
test('empresa nova não herda o destinatário SDR da empresa anterior',async({page})=>{
 const first='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 await page.route('**/rest/v1/**',route=>{
  const req=route.request(),url=new URL(req.url()),name=url.pathname.split('/').pop();
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  if(req.method()==='OPTIONS')return route.fulfill({status:200,headers});
  if(url.pathname.includes('/rpc/'))return route.fulfill({headers,json:null});
  const org=url.searchParams.get('organization_id')?.replace('eq.','');
  return route.fulfill({headers,json:name==='sdr_settings'&&org===first?{organization_id:first,enabled:false,sequence_id:null,simulate:true,contact_basis:'',notify_email:'equipe@empresa-a.test',tracking_enabled:false}:null});
 });
 await page.goto('/tests/ui/?sdr-switch');
 const recipient=page.getByLabel('E-mail para avisos de lead quente');
 await expect(recipient).toHaveValue('equipe@empresa-a.test');
 await page.getByRole('button',{name:'Trocar para empresa nova'}).click();
 await expect(recipient).toHaveValue('');
});
for(const width of [1440,390])test(`Agente SDR: biblioteca e configuração sem disparo (${width})`,async({page})=>{
 await page.setViewportSize({width,height:900});const calls:any[]=[];
 await page.route('**/rest/v1/**',async route=>{
 const req=route.request();const name=new URL(req.url()).pathname.split('/').pop();const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
 if(req.method()==='OPTIONS')return route.fulfill({status:200,headers});
 if(req.url().includes('/rpc/')){calls.push({name,body:req.postDataJSON()});return route.fulfill({headers,json:name==='tenant_member'?true:name==='install_sdr_library'?1:null});}
 const data:any={organizations:[{id:'5080f093-3019-4015-b048-3d837aae21ee',nome:'Contabilidade QA'}],outreach_sequences:[{id:'seq-a',organization_id:'5080f093-3019-4015-b048-3d837aae21ee',nome:'Contabilidade · QA',status:'ACTIVE',settings:{publico:'prospect'}}],outreach_policy:[{organization_id:'5080f093-3019-4015-b048-3d837aae21ee',live_enabled:false}],mining_jobs:[{id:'job-qa',dados:{name:'Contadores de Minas Gerais'}}],sdr_settings:{organization_id:'5080f093-3019-4015-b048-3d837aae21ee',enabled:false,simulate:true,sequence_id:'seq-a',contact_basis:'',notify_email:'diego.garcia@grupociatos.com.br',tracking_enabled:false}};
 return route.fulfill({headers,json:data[name!]||[]});
 });
 await page.goto('/tests/ui/');await page.getByRole('button',{name:'Cadências',exact:true}).click();
 await page.getByRole('button',{name:'Contabilidade',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Nome',exact:true})).toHaveValue('Contabilidade · apresentação e conversa');
 await expect(page.getByRole('textbox',{name:'Mensagem',exact:true})).toHaveCount(4);
 await page.getByRole('button',{name:'Instalar 1 modelo(s) · 4 e-mails',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('1 cadência(s)');
 expect(calls.find(c=>c.name==='install_sdr_library').body.library.flatMap((c:any)=>c.passos)).toHaveLength(4);
 await page.getByRole('button',{name:'Agente SDR',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Do Radar à conversa certa.'})).toBeVisible();
 await page.getByRole('combobox',{name:'Lista do Radar'}).selectOption('job-qa');
 await page.getByLabel('Finalidade e base de contato avaliada').fill('Contato empresarial com finalidade e público avaliados.');
 await page.getByRole('button',{name:'Salvar operação',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Configuração salva');
 const save=calls.find(c=>c.name==='save_sdr_settings');expect(save.body.active).toBe(false);expect(save.body.simulation).toBe(true);expect(save.body.job).toBe('job-qa');
 expect(calls.some(c=>c.name==='enroll_leads')).toBe(false);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`test-results/sdr-${width}.png`,fullPage:true});
 await page.getByLabel('Simulação — não envia e não consome créditos do Snov.io').uncheck();
 await page.getByLabel('Agente ligado para os resultados pendentes do Radar').check();
 await page.getByRole('button',{name:'Salvar operação',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Snov.io pronto no servidor');
 expect(calls.filter(c=>c.name==='save_sdr_settings'&&c.body.active)).toHaveLength(0);
});

test('CafeWorking mostra somente cadências próprias e seleciona uma lista do Radar',async({page})=>{
 const org='0d1ee589-5acc-4321-a560-b6f176394a6e';
 await page.route('**/rest/v1/**',async route=>{
  const req=route.request();const name=new URL(req.url()).pathname.split('/').pop();
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  if(req.method()==='OPTIONS')return route.fulfill({status:200,headers});
  if(req.url().includes('/rpc/'))return route.fulfill({headers,json:name==='tenant_member'?true:null});
  const data:any={organizations:[{id:org,nome:'CafeWorking'}],outreach_sequences:[{id:'seq-old',organization_id:org,nome:'CafeWorking — indicação de endereço fiscal',status:'DRAFT',settings:{publico:'prospect'}},{id:'seq-cafe',organization_id:org,nome:'CafeWorking — rede nacional de parceiros',status:'ACTIVE',settings:{publico:'prospect'}}],outreach_policy:[{organization_id:org,live_enabled:false}],outreach_steps:[...Array.from({length:4},(_,i)=>({sequence_id:'seq-old',ordem:i,tipo:'EMAIL',delay_minutes:i*1440,config:{subject:`Indicação ${i+1}`,body:'Mensagem de indicação'}})),...Array.from({length:6},(_,i)=>({sequence_id:'seq-cafe',ordem:i,tipo:'EMAIL',delay_minutes:i*1440,config:{subject:`Parceria ${i+1}`,body:'Mensagem para parceiros'}}))],mining_jobs:[{id:'job-a',organization_id:org,dados:{name:'Parceiros Brasil'}},{id:'job-b',organization_id:org,dados:{name:'Parceiros MG'}}],leads:[{id:'lead-a',organization_id:org,empresa:'Escritório A',nome:'Ana',email:'ana@example.test',relacao:'prospect',tags:[],opt_out:false,dados:{radarJobId:'job-a'}},{id:'lead-b',organization_id:org,empresa:'Escritório B',nome:'Bia',email:'bia@example.test',relacao:'prospect',tags:[],opt_out:false,dados:{radarJobId:'job-b'}}]};
  return route.fulfill({headers,json:data[name!]||[]});
 });
 await page.goto('/tests/ui/');await page.getByRole('button',{name:'Cadências',exact:true}).click();
 await expect(page.getByText('CafeWorking — rede nacional de parceiros').first()).toBeVisible();
 await expect(page.getByText('CafeWorking — indicação de endereço fiscal')).toBeVisible();
 await page.getByText('Ler os 6 e-mails').click();
 await expect(page.getByRole('heading',{name:'Parceria 1'})).toBeVisible();
 await expect(page.getByText('Dez serviços, quatro mensagens por cadência')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Contabilidade',exact:true})).toHaveCount(0);
 await page.getByRole('combobox',{name:'Cadência',exact:true}).selectOption('seq-cafe');
 await page.getByRole('combobox',{name:'Lista do Radar'}).selectOption('job-a');
 await expect(page.getByText('Escritório A')).toBeVisible();
 await expect(page.getByText('Escritório B')).toHaveCount(0);
});

test('CafeWorking mostra as duas campanhas ao entrar e abre os e-mails',async({page})=>{
 const org='0d1ee589-5acc-4321-a560-b6f176394a6e';
 await page.route('**/rest/v1/**',async route=>{
  const req=route.request();const name=new URL(req.url()).pathname.split('/').pop();
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  if(req.method()==='OPTIONS')return route.fulfill({status:200,headers});
  if(req.url().includes('/rpc/'))return route.fulfill({headers,json:name==='tenant_member'?true:null});
  const data:any={outreach_sequences:[{id:'old',organization_id:org,nome:'CafeWorking — indicação de endereço fiscal',status:'DRAFT',settings:{publico:'prospect'}},{id:'new',organization_id:org,nome:'CafeWorking — rede nacional de parceiros',status:'DRAFT',settings:{publico:'prospect'}}],outreach_steps:[...Array.from({length:4},(_,i)=>({sequence_id:'old',ordem:i,tipo:'EMAIL',config:{subject:`Indicação ${i+1}`,body:'Texto inicial'}})),...Array.from({length:6},(_,i)=>({sequence_id:'new',ordem:i,tipo:'EMAIL',config:{subject:`Parceria ${i+1}`,body:'Texto nacional'}}))]};
  return route.fulfill({headers,json:data[name!]||[]});
 });
 await page.goto('/tests/ui/?cafeworking');
 await expect(page.getByRole('heading',{name:'Cadências de CafeWorking'})).toBeVisible();
 await expect(page.getByRole('button',{name:/CafeWorking — indicação de endereço fiscal/})).toBeVisible();
 await expect(page.getByRole('button',{name:/CafeWorking — rede nacional de parceiros/})).toBeVisible();
 await page.getByRole('button',{name:/CafeWorking — rede nacional de parceiros/}).click();
 await expect(page.getByRole('heading',{name:'Suas cadências · 2'})).toBeVisible();
 await page.getByText('Ler os 6 e-mails').click();
 await expect(page.getByRole('heading',{name:'Parceria 1'})).toBeVisible();
});
