import {test,expect} from '@playwright/test';

test('Inbox keeps replies, ownership and notes within the selected company',async({page})=>{
 await page.goto('/tests/ui/?inbox');
 await expect(page.getByRole('heading',{name:'Caixa de entrada'})).toBeVisible();
 await page.getByRole('button',{name:/Empresa Exemplo.*Nova/}).click();
 await expect(page.getByText('Gostaria de conversar amanhã.')).toBeVisible();
 await page.getByRole('button',{name:'Assumir'}).click();
 await expect(page.getByLabel('Responsável')).toHaveValue('user-one');
 await page.getByLabel('Nota interna para a equipe').fill('Telefonar amanhã às 10h.');
 await page.getByRole('button',{name:'Salvar nota'}).click();
 await expect(page.getByText('Telefonar amanhã às 10h.')).toBeVisible();
 await page.getByLabel('Estado').selectOption('CLOSED');
 await expect(page.getByLabel('Estado')).toHaveValue('CLOSED');
 await expect(page.getByRole('button',{name:/Empresa Exemplo.*Concluída/})).toBeVisible();
 await page.getByRole('button',{name:'Outra empresa'}).click();
 await expect(page.getByText('Gostaria de conversar amanhã.')).toHaveCount(0);
 await expect(page.getByText('Telefonar amanhã às 10h.')).toHaveCount(0);
 await expect(page.getByText('Nenhuma conversa nesta visão.')).toBeVisible();
});

test('Inbox fits a phone viewport',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/tests/ui/?inbox');
 await page.getByRole('button',{name:/Empresa Exemplo.*Nova/}).click();
 await expect(page.getByText('Gostaria de conversar amanhã.')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('Inbox requires a preview and explicit confirmation before a reply',async({page})=>{
 await page.goto('/tests/ui/?inbox');
 await page.getByRole('button',{name:/Empresa Exemplo.*Nova/}).click();
 await page.getByLabel('Responder por e-mail').fill('Olá Ana, podemos conversar amanhã às 10h?');
 await expect(page.getByText('E-mail aceito pela Microsoft')).toHaveCount(0);
 await page.getByRole('button',{name:'Revisar resposta'}).click();
 await expect(page.getByText('Prévia para ana@example.test')).toBeVisible();
 await page.getByRole('button',{name:'Voltar e editar'}).click();
 await expect(page.getByRole('button',{name:'Confirmar envio'})).toHaveCount(0);
 await page.getByRole('button',{name:'Revisar resposta'}).click();
 await page.getByRole('button',{name:'Confirmar envio'}).click();
 await expect(page.getByText('Resposta aceita pela Microsoft 365. A entrega ainda não foi confirmada.')).toBeVisible();
 await expect(page.getByText('Olá Ana, podemos conversar amanhã às 10h?')).toBeVisible();
});
