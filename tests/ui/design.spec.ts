import {test,expect} from '@playwright/test';
for(const width of [390,1440]) {
  test(`overview navigation and layout at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:900});
    await page.goto('/tests/ui/?design');
    await expect(page.getByRole('heading',{name:'Seu próximo negócio começa aqui.'})).toBeVisible();
    const geometry=await page.evaluate(()=>({viewport:innerWidth,doc:document.documentElement.scrollWidth,heading:document.querySelector('h1')!.getBoundingClientRect().top,header:document.querySelector('header')!.getBoundingClientRect().bottom}));
    expect(geometry.doc).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.heading).toBeGreaterThan(geometry.header);
    await expect(page.getByRole('button',{name:'Oportunidades abertas 0 No pipeline comercial'})).toBeVisible();
    await page.getByRole('button',{name:'Ver pipeline',exact:true}).click();
    await expect(page.getByRole('heading',{name:'kanban',exact:true})).toBeVisible();
    if(width<768) await page.getByRole('button',{name:'Abrir menu',exact:true}).click();
    await page.getByRole('button',{name:'Painel Geral',exact:true}).click();
    if(width<768) await expect(page.getByRole('button',{name:'Fechar menu',exact:true})).toBeHidden();
    await page.getByRole('button',{name:'Cadastrar lead →',exact:true}).click();
    await expect(page.getByRole('status')).toHaveText('Cadastro solicitado');
  });
}
