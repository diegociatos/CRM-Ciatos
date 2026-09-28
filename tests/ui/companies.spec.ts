import {test,expect,Page} from '@playwright/test';
// O seletor de empresa fica no cartão da barra lateral (menu), como no ContaOne.
const card=(page:Page)=>page.locator('.workspace-label');
const openMenu=async(page:Page)=>{if(await card(page).getAttribute('aria-expanded')!=='true')await card(page).click();};
const pickCompany=async(page:Page,name:string)=>{await openMenu(page);await page.getByRole('menuitemradio',{name}).click();};
const menuAction=async(page:Page,name:string)=>{await openMenu(page);await page.getByRole('menuitem',{name}).click();};
test('whole CRM switches company, scopes writes and remembers selection',async({page})=>{
 test.setTimeout(60000);
 const uid='11111111-1111-4111-8111-111111111111',a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',c='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 const companies=[{id:a,nome:'Ciatos Contabilidade',operating_role:'ADMIN',can_manage:true,can_platform:true,is_master:false,registration:{}},{id:b,nome:'Ciatos Jurídico',operating_role:'ADMIN',can_manage:true,can_platform:true,is_master:false,registration:{}}];
 const writes:any[]=[];const user={id:uid,email:'test@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
 const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')+'.test';
 await page.addInitScript(({user,token})=>{if(!localStorage.getItem('ciatos_crm_auth'))localStorage.setItem('ciatos_crm_auth',JSON.stringify({access_token:token,refresh_token:'test',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user}));},{user,token});
 const profile={id:uid,nome:'Pessoa de teste',email:'test@example.test',papel:'ADMIN',departamento:'Comercial',ativo:true};
 await page.route('**/auth/v1/**',route=>{if(route.request().url().endsWith('/verify'))return route.fulfill({json:{access_token:token,refresh_token:'test',expires_in:3600,token_type:'bearer',user}});return route.fulfill({json:user});});
 await page.route('**/rest/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url()),name=url.pathname.split('/').pop()!;
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  if(req.method()==='OPTIONS')return route.fulfill({headers,status:200});
  if(url.pathname.includes('/rpc/')){
   const body=req.postDataJSON();
   if(name==='platform_console')return route.fulfill({headers,json:{clients:companies.map(c=>({...c,ativo:true,master_email:'master@example.test',active_users:1,available:true,account:{status:'internal',onboarding:'ready'}})),plans:[],invoices:[],tickets:[],audit:[],settings:{}}});
   if(name==='save_company'){companies.push({id:c,nome:body.company_name,operating_role:'ADMIN',can_manage:true,can_platform:true,is_master:false,registration:body.details});return route.fulfill({headers,json:c});}
   return route.fulfill({headers,json:name==='my_companies'?companies:name==='company_users'?[profile]:name==='tenant_member'?true:null});
  }
  if(name==='profiles')return route.fulfill({headers,json:profile});
  if(req.method()!=='GET'){writes.push({name,body:req.postDataJSON()});return route.fulfill({headers,status:201,json:null});}
  const org=url.searchParams.get('organization_id')?.replace('eq.','');expect(org,`scope on ${name}`).toBeTruthy();
  if(name==='config')return route.fulfill({headers,json:{dados:{}}});
  const label=org===a?'Cliente Contábil':org===b?'Cliente Jurídico':'';
  return route.fulfill({headers,json:name==='leads'&&label?[{id:org,organization_id:org,nome:label,empresa:label,cnpj_raw:'00000000000000',status:'Qualificação',phase_id:'ph-qualificado',in_queue:true,created_at:new Date().toISOString(),dados:{tradeName:label,cnpj:'00.000.000/0000-00'}}]:[]});
 });
 await page.goto('/tests/ui/?companies');
 await expect(card(page)).toContainText('Ciatos Contabilidade');
 await page.getByRole('button',{name:'Fila de Qualificação',exact:true}).click();
 await expect(page.getByRole('cell',{name:/Cliente Contábil 00/})).toBeVisible();
 page.once('dialog',d=>d.dismiss());await pickCompany(page,'Ciatos Jurídico');await expect(card(page)).toContainText('Ciatos Contabilidade');
 page.once('dialog',d=>d.accept());await pickCompany(page,'Ciatos Jurídico');
 await expect(card(page)).toContainText('Ciatos Jurídico');
 await page.getByRole('button',{name:'Fila de Qualificação',exact:true}).click();
 await expect(page.getByRole('cell',{name:/Cliente Jurídico 00/})).toBeVisible();await expect(page.getByText('Cliente Contábil',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Novo Lead',exact:true}).click();
 await page.getByLabel('Razão social').fill('Cadastro Jurídico');await page.getByLabel('CNPJ *',{exact:true}).fill('123');await page.getByRole('button',{name:'Continuar →'}).click();await page.getByLabel('Nome do contato').fill('Contato');await page.getByLabel('Telefone / WhatsApp').fill('123');await page.getByRole('button',{name:'Salvar lead',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(writes.find(w=>w.name==='leads')?.body.organization_id).toBe(b);
 await page.reload();await expect(card(page)).toContainText('Ciatos Jurídico');
 await page.getByRole('button',{name:'Central da IA',exact:true}).click();await expect(page.getByLabel('Empresa',{exact:true})).toHaveValue(b);await expect(page.getByLabel('Empresa',{exact:true})).toBeDisabled();
 await menuAction(page,'Gerenciar empresas');await page.getByRole('button',{name:'+ Cadastrar outra empresa'}).click();await page.getByLabel('Nome da empresa *').fill('CiatosLog');await page.getByRole('button',{name:'Criar empresa e entrar'}).click();await expect(card(page)).toContainText('CiatosLog');await expect(page.getByText('Cliente Jurídico',{exact:true})).toHaveCount(0);
 await page.reload();await expect(card(page)).toContainText('CiatosLog');
 await menuAction(page,'Administrar o CRM');
 await expect(page.getByRole('dialog',{name:'Administração da plataforma'})).toBeVisible();
 await page.getByRole('button',{name:'Empresas clientes',exact:true}).click();
 await page.getByLabel('Buscar empresa, CNPJ ou master').fill('CiatosLog');
 await expect(page.getByRole('article')).toHaveCount(1);
 await expect(page.getByRole('article')).toContainText('master@example.test');
 await page.getByRole('button',{name:'Fechar painel'}).click();
 companies.forEach(c=>{c.can_platform=false;c.is_master=true;});
 await page.reload();
 await openMenu(page);await expect(page.getByRole('menuitem',{name:'Administrar o CRM'})).toHaveCount(0);
 await menuAction(page,'Gerenciar empresas');
 await expect(page.getByRole('button',{name:'+ Cadastrar outra empresa'})).toHaveCount(0);
 await page.goto('/tests/ui/?companies#type=recovery');await page.reload();
 await expect(page.getByRole('heading',{name:'Crie sua senha'})).toBeVisible();
 await page.goto('/tests/ui/?companies#type=recovery&token_hash=fake-local-token');await page.reload();
 await expect(page.getByRole('heading',{name:'Crie sua senha'})).toBeVisible();
 expect(new URL(page.url()).hash).toBe('');
 await page.route('**/auth/v1/verify',route=>route.fulfill({status:403,json:{message:'Expired',code:'otp_expired'}}));
 await page.goto('/tests/ui/?companies#type=recovery&token_hash=fake-expired-token');await page.reload();
 await expect(page.getByRole('heading',{name:'Link inválido ou expirado'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Crie sua senha'})).toHaveCount(0);
 await page.goto('/tests/ui/?companies');
 await page.evaluate(()=>{const session=JSON.parse(localStorage.getItem('ciatos_crm_auth')!);session.user.app_metadata={crm_password_change_required:true};localStorage.setItem('ciatos_crm_auth',JSON.stringify(session));});
 await page.reload();
 await expect(page.getByText('Antes de acessar suas empresas, substitua a senha inicial por uma senha pessoal.')).toBeVisible();
 await expect(card(page)).toHaveCount(0);
 await page.getByLabel('Nova senha',{exact:true}).fill('ciatos1234');await page.getByLabel('Confirme a senha').fill('ciatos1234');
 await page.getByRole('button',{name:'Salvar e entrar'}).click();
 await expect(page.getByRole('alert')).toContainText('maiúscula');
 await page.route('**/functions/v1/crm-admin-users',route=>route.fulfill({status:400,json:{error:'Falha simulada'}}));
 await page.getByLabel('Nova senha',{exact:true}).fill('NovaSenhaTeste234');await page.getByLabel('Confirme a senha').fill('NovaSenhaTeste234');
 await page.getByRole('button',{name:'Salvar e entrar'}).click();
 await expect(page.getByRole('alert')).toContainText('Não foi possível');
 await expect(card(page)).toHaveCount(0);
 await page.route('**/functions/v1/crm-admin-users',route=>{expect(route.request().postDataJSON().action).toBe('complete-password');return route.fulfill({json:{ok:true}});});
 await page.route('**/auth/v1/token**',route=>route.fulfill({json:{access_token:token,refresh_token:'test',expires_in:3600,token_type:'bearer',user}}));
 await page.getByRole('button',{name:'Salvar e entrar'}).click();
 await expect(card(page)).toBeVisible();

});
