import {test,expect} from '@playwright/test';
for(const width of [1440,390])test(`Agente SDR: biblioteca e configuração sem disparo (${width})`,async({page})=>{
 await page.setViewportSize({width,height:900});const calls:any[]=[];
 await page.route('**/rest/v1/**',async route=>{
 const req=route.request();const name=new URL(req.url()).pathname.split('/').pop();const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
 if(req.method()==='OPTIONS')return route.fulfill({status:200,headers});
 if(req.url().includes('/rpc/')){calls.push({name,body:req.postDataJSON()});return route.fulfill({headers,json:name==='tenant_member'?true:name==='install_sdr_library'?10:null});}
 const data:any={organizations:[{id:'org-a',nome:'Contabilidade QA'}],outreach_sequences:[{id:'seq-a',organization_id:'org-a',nome:'Contabilidade · QA',status:'ACTIVE',settings:{publico:'prospect'}}],outreach_policy:[{organization_id:'org-a',live_enabled:false}],sdr_settings:{organization_id:'org-a',enabled:false,simulate:true,sequence_id:'seq-a',contact_basis:'',notify_email:'diego.garcia@grupociatos.com.br',tracking_enabled:false}};
 return route.fulfill({headers,json:data[name!]||[]});
 });
 await page.goto('/tests/ui/');await page.getByRole('button',{name:'Cadências',exact:true}).click();
 await page.getByRole('button',{name:'Contabilidade',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Nome',exact:true})).toHaveValue('Contabilidade · apresentação e conversa');
 await expect(page.getByRole('textbox',{name:'Mensagem',exact:true})).toHaveCount(4);
 await page.getByRole('button',{name:'Instalar biblioteca · 40 e-mails',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('10 cadência(s)');
 expect(calls.find(c=>c.name==='install_sdr_library').body.library.flatMap((c:any)=>c.passos)).toHaveLength(40);
 await page.getByRole('button',{name:'Agente SDR',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Do Radar à conversa certa.'})).toBeVisible();
 await page.getByLabel('Finalidade e base de contato avaliada').fill('Contato empresarial com finalidade e público avaliados.');
 await page.getByRole('button',{name:'Salvar operação',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Configuração salva');
 const save=calls.find(c=>c.name==='save_sdr_settings');expect(save.body.active).toBe(false);expect(save.body.simulation).toBe(true);
 expect(calls.some(c=>c.name==='enroll_leads')).toBe(false);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`test-results/sdr-${width}.png`,fullPage:true});
});
