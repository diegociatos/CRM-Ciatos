import {test,expect} from '@playwright/test';
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
});

test('CafeWorking mostra somente cadências próprias e seleciona uma lista do Radar',async({page})=>{
 const org='0d1ee589-5acc-4321-a560-b6f176394a6e';
 await page.route('**/rest/v1/**',async route=>{
  const req=route.request();const name=new URL(req.url()).pathname.split('/').pop();
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  if(req.method()==='OPTIONS')return route.fulfill({status:200,headers});
  if(req.url().includes('/rpc/'))return route.fulfill({headers,json:name==='tenant_member'?true:null});
  const data:any={organizations:[{id:org,nome:'CafeWorking'}],outreach_sequences:[{id:'seq-cafe',organization_id:org,nome:'CafeWorking — rede nacional de parceiros',status:'ACTIVE',settings:{publico:'prospect'}}],outreach_policy:[{organization_id:org,live_enabled:false}],mining_jobs:[{id:'job-a',organization_id:org,dados:{name:'Parceiros Brasil'}},{id:'job-b',organization_id:org,dados:{name:'Parceiros MG'}}],leads:[{id:'lead-a',organization_id:org,empresa:'Escritório A',nome:'Ana',email:'ana@example.test',relacao:'prospect',tags:[],opt_out:false,dados:{radarJobId:'job-a'}},{id:'lead-b',organization_id:org,empresa:'Escritório B',nome:'Bia',email:'bia@example.test',relacao:'prospect',tags:[],opt_out:false,dados:{radarJobId:'job-b'}}]};
  return route.fulfill({headers,json:data[name!]||[]});
 });
 await page.goto('/tests/ui/');await page.getByRole('button',{name:'Cadências',exact:true}).click();
 await expect(page.getByText('CafeWorking — rede nacional de parceiros').first()).toBeVisible();
 await expect(page.getByText('Dez serviços, quatro mensagens por cadência')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Contabilidade',exact:true})).toHaveCount(0);
 await page.getByRole('combobox',{name:'Cadência',exact:true}).selectOption('seq-cafe');
 await page.getByRole('combobox',{name:'Lista do Radar'}).selectOption('job-a');
 await expect(page.getByText('Escritório A')).toBeVisible();
 await expect(page.getByText('Escritório B')).toHaveCount(0);
});
