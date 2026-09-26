import {test,expect} from '@playwright/test';
test('search selects a lead and empty dashboards do not invent success or NPS',async({page})=>{
  await page.goto('/tests/ui/?regressions');
  const search=page.getByRole('searchbox',{name:'Pesquisa global de leads'});
  await search.fill('inexistente');
  await expect(page.getByText('Nenhum lead encontrado.')).toBeVisible();
  await search.fill('empresa qa');
  await page.getByRole('button',{name:/Empresa QA.*Ana Teste/}).click();
  await expect(page.getByText('Selecionado: qa-lead')).toBeVisible();
  await expect(search).toHaveValue('');
  await expect(page.getByText('Meta diária não configurada.',{exact:true})).toHaveCount(2);
  await expect(page.getByText('Sem respostas',{exact:true})).toBeVisible();
  await expect(page.getByText('Objetivo Diário Alcançado! 🎯')).toHaveCount(0);
  await expect(page.getByText('Meta de Atividades Batida! 🚀')).toHaveCount(0);
  await expect(page.getByText(/Abaixo de 50% da meta/)).toHaveCount(0);
});
