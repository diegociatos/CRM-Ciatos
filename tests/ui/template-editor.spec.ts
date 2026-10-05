import {test,expect} from '@playwright/test';
for(const width of [1440,390])test(`template editor preserves content and saves ordered phases at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:950});await page.goto('/tests/ui/?template-editor');
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await expect(page.getByLabel('Nome da fase',{exact:true})).toHaveValue('Assinatura do contrato e alinhamento com todos os responsáveis');
 await page.getByLabel('Instruções para executar esta fase').fill('Instruções extensas para toda a equipe.\nConferir os documentos e confirmar a assinatura com o cliente.');
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(dialog).toBeVisible();
 await page.screenshot({path:`test-results/template-editor-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Descer fase 1',exact:true}).click();await expect(page.locator('.ote-phase-toggle').first()).toContainText('Apresentação da equipe');
 await page.getByRole('button',{name:'+ Adicionar fase'}).click();await page.getByLabel('Nome da fase',{exact:true}).fill('Entrega final');await page.getByLabel(/Prazo após/).fill('0');await page.getByLabel('Quem executa').selectOption('cliente');
 await page.getByRole('button',{name:'Salvar modelo',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Falha de conexão');await expect(page.getByLabel('Nome da fase',{exact:true})).toHaveValue('Entrega final');
 await page.getByRole('button',{name:'Salvar modelo',exact:true}).click();await expect(dialog).toHaveCount(0);const saved=JSON.parse(await page.getByRole('status').innerText());expect(saved.phases.map((p:any)=>p.order)).toEqual([0,1,2]);expect(saved.phases[1].description).toContain('Conferir os documentos');expect(saved.phases[2].defaultDueDays).toBe(0);expect(saved.phases[2].executor).toBe('cliente');
});
