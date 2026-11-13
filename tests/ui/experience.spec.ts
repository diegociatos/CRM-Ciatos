import {test,expect} from '@playwright/test';
test('resumo da fila abre o filtro correspondente e canais respeitam o perfil',async({page})=>{
 await page.goto('/tests/ui/?desk');
 await expect(page.getByRole('tab',{name:'Canais de atendimento'})).toHaveCount(0);
 await page.getByRole('button',{name:/Para distribuir 2/}).click();
 await expect(page.getByText('2 atendimentos em “Sem responsável”')).toBeVisible();
 await page.goto('/tests/ui/?desk-manager');
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('tab',{name:'Canais de atendimento'}).click();
 await expect(page.getByRole('heading',{name:'Todos os caminhos até o cliente.'})).toBeVisible();
 await expect(page.getByText(/o cadastro atual aceita um número/)).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await page.getByRole('button',{name:/Configurar mensagens/}).click();
 await page.getByText('WhatsApp e Instagram desta empresa').click();
 await expect(page.getByRole('button',{name:/Salvar WhatsApp/})).toBeVisible();
});
test('clientes paginados preservam zero real e distinguem ausência de avaliação',async({page})=>{
 await page.goto('/tests/ui/?customer-list');
 await expect(page.getByRole('row')).toHaveCount(26);
 await expect(page.getByText('Sem avaliação',{exact:true})).toHaveCount(24);
 await expect(page.getByText('0%',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Próxima →'}).click();
 await expect(page.getByRole('row')).toHaveCount(2);
 await expect(page.getByText('Empresa 26',{exact:true})).toBeVisible();
 await page.getByPlaceholder('Pesquisar por Nome ou CNPJ...').fill('Empresa 01');
 await expect(page.getByText('Página 1 de 1',{exact:false})).toBeVisible();
 await expect(page.getByText('Empresa 01',{exact:true})).toBeVisible();
});
