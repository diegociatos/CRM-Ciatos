import {test,expect,Page} from '@playwright/test';
const fill=async(page:Page)=>{
 await page.getByRole('button',{name:'Novo atendimento',exact:true}).click();
 await page.getByLabel('Assunto',{exact:true}).fill('Retorno sobre contrato');
 await page.getByLabel('Nome de quem solicitou').fill('Ana de teste');
 await page.getByLabel('Telefone com DDD').fill('31999999999');
 await page.getByLabel('Relato e próximo passo').fill('Cliente ligou. Conferir o contrato e retornar.');
 await page.getByLabel('Resultado da ligação').selectOption('CALLBACK');
 await page.getByLabel('Duração em segundos').fill('120');
};
test('manual phone intake creates an existing demand and clearly indicates no live call or message',async({page})=>{
 await page.goto('/tests/ui/?desk');await fill(page);
 await expect(page.getByText('Isso não liga, envia mensagens nem cria um lead.',{exact:false})).toBeVisible();
 await page.getByLabel('Confidencial:',{exact:false}).check();
 await page.getByRole('button',{name:'Registrar atendimento',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Atendimento registrado'})).toBeVisible();
 const calls=await page.locator('body').getAttribute('data-intake-calls');
 const payload=JSON.parse(calls!)[0];expect(payload.org).toBe('00000000-0000-4000-8000-000000000001');expect(payload.details).toMatchObject({channel:'phone',outcome:'CALLBACK',duration_seconds:120});expect(payload.is_confidential).toBe(true);
 await page.screenshot({path:'test-results/manual-intake-saved.png'});
 await page.getByRole('button',{name:'Acompanhar demanda'}).click();await expect(page.getByText('Conversa aberta: Demanda aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBeVisible();
});
test('uncertain retry freezes original request and preserves its id; definite rejection allows correction',async({page})=>{
 await page.goto('/tests/ui/?desk');await page.getByRole('button',{name:'Interromper registro manual'}).click();await fill(page);
 await page.getByRole('button',{name:'Registrar atendimento',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('não foi confirmado');await expect(page.getByLabel('Assunto',{exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Conferir registro',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Atendimento registrado'})).toBeVisible();
 const calls=JSON.parse((await page.locator('body').getAttribute('data-intake-calls'))!);expect(calls).toHaveLength(2);expect(calls[0]).toEqual(calls[1]);
 await page.getByRole('button',{name:'Concluir',exact:true}).click();await page.getByRole('button',{name:'Rejeitar registro manual'}).click();await fill(page);
 await page.getByRole('button',{name:'Registrar atendimento',exact:true}).click();await expect(page.getByLabel('Assunto',{exact:true})).toBeEnabled();
 await page.getByLabel('Assunto',{exact:true}).fill('Assunto corrigido');await page.getByRole('button',{name:'Registrar atendimento',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Atendimento registrado'})).toBeVisible();
});
test('mobile form fits, protects a draft and discards it on company change',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/tests/ui/?desk');await fill(page);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await page.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(page.getByRole('alertdialog')).toBeVisible();
 await page.getByRole('button',{name:'Continuar aqui'}).click();await expect(page.getByLabel('Assunto',{exact:true})).toHaveValue('Retorno sobre contrato');
 await page.screenshot({path:'test-results/manual-intake-mobile.png'});
 await page.getByRole('button',{name:'Fechar novo atendimento'}).click();await page.getByRole('button',{name:'Fechar registro',exact:true}).click();
 await page.getByRole('button',{name:'Trocar empresa de teste'}).click();await page.getByRole('button',{name:'Novo atendimento',exact:true}).click();await expect(page.getByLabel('Assunto',{exact:true})).toHaveValue('');
});
test('manual demand opens from its reference with original requester and call context',async({page})=>{
 await page.goto('/tests/ui/?manual-demand');
 const context=page.getByRole('region',{name:'Origem do atendimento'});
 await expect(context.getByText('Ana de teste',{exact:true})).toBeVisible();
 await expect(context.getByText('Precisa de retorno',{exact:true})).toBeVisible();
 await expect(context.getByText('120 segundos',{exact:true})).toBeVisible();
 await expect(page.getByLabel('Cliente ou contato')).toHaveValue('');
 await page.getByLabel('Estado',{exact:true}).selectOption('RESOLVED');await page.getByRole('button',{name:'Salvar alterações',exact:true}).click();
 await expect(context.getByText('Ana de teste',{exact:true})).toBeVisible();
 await page.screenshot({path:'test-results/manual-intake-demand.png'});
});
test('agents can follow existing demands inside the support workspace',async({page})=>{
 await page.goto('/tests/ui/?desk');await page.getByRole('tab',{name:'Registros e demandas'}).click();
 await expect(page.getByRole('heading',{name:/Central de demandas/ })).toBeVisible();
 await page.getByText('Revisar contrato do cliente',{exact:true}).click();await expect(page.getByRole('complementary',{name:'Detalhes da demanda'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Abrir cadastro do contato',exact:false})).toHaveCount(0);
});
