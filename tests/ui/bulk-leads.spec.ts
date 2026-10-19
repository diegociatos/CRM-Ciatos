import {test,expect} from '@playwright/test';
import * as XLSX from 'xlsx';
const org='00000000-0000-4000-8000-000000000001';
test('paste, map, preview, report, import in active company and preserve manual form',async({page})=>{
 const calls:any[]=[];
 await page.route('**/rest/v1/rpc/bulk_qualification',async route=>{
  const b=route.request().postDataJSON();calls.push(b);
  await route.fulfill({json:b.rows.map((r:any)=>({line:r.line,error:null,id:b.preview?null:'imported-id'}))});
 });
 await page.goto('/tests/ui/?flow');
 await page.getByRole('button',{name:'Importar leads em lote',exact:true}).click();
 await expect(page.getByRole('button',{name:'Importar 0 leads válidos'})).toBeDisabled();
 await page.getByLabel('Ou cole o CSV').fill('Razão social;CNPJ;Nome do contato;Telefone / WhatsApp;E-mail profissional\nAlfa;11222333000181;Ana;31999999999;ana@example.com\nDuplicada;11222333000181;Ana;31999999999;ana@example.com\nInválida;00000000000000;Ana;31999999999;bad');
 await page.getByRole('button',{name:'Usar CSV colado'}).click();
 await page.getByRole('button',{name:'Validar e pré-visualizar'}).click();
 await expect(page.getByText('3 linhas · 1 aptas · 2 com erros · 0 importadas')).toBeVisible();
 await expect(page.getByRole('columnheader',{name:'E-mail do contato',exact:true})).toBeVisible();
 await expect(page.getByRole('columnheader',{name:'E-mail da empresa',exact:true})).toBeVisible();
 await expect(page.getByRole('cell',{name:'ana@example.com',exact:true})).toHaveCount(2);
 await page.screenshot({path:'test-results/bulk-leads-preview.png'});
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Baixar relatório de erros'}).click();expect((await download).suggestedFilename()).toBe('erros-importacao.csv');
 await page.getByRole('button',{name:'Importar 1 leads válidos',exact:true}).click();
 await expect(page.getByText('3 linhas · 0 aptas · 2 com erros · 1 importadas')).toBeVisible();
 expect(calls).toHaveLength(2);expect(calls.every(c=>c.org===org)).toBeTruthy();expect(calls[0].preview).toBe(true);expect(calls[1].preview).toBe(false);
 await page.getByRole('button',{name:'Concluir',exact:true}).click();
 await page.getByRole('button',{name:'Novo Lead Manual'}).click();await expect(page.getByRole('dialog',{name:'Cadastrar lead'})).toBeVisible();
});
test('imports sequential batches with progress and stops before the next batch',async({page})=>{
 const cnpj=(i:number)=>{let s=String(i+100000000000);for(const n of [12,13]){let sum=0;for(let j=0;j<n;j++)sum+=Number(s[j])*((n-1-j)%8+2);s+=sum%11<2?'0':String(11-sum%11);}return s;};
 let imports=0,release:()=>void=()=>{};
 await page.route('**/rest/v1/rpc/bulk_qualification',async route=>{
  const b=route.request().postDataJSON();if(!b.preview){imports++;await new Promise<void>(resolve=>{release=resolve;});}
  await route.fulfill({json:b.rows.map((r:any)=>({line:r.line,error:null,id:b.preview?null:'id-'+r.line}))});
 });
 await page.goto('/tests/ui/?flow');await page.getByRole('button',{name:'Importar leads em lote',exact:true}).click();
 await page.getByLabel('Ou cole o CSV').fill('Razão social;CNPJ;Nome do contato;Telefone / WhatsApp\n'+Array.from({length:101},(_,i)=>`Empresa ${i};${cnpj(i)};Ana;31999999999`).join('\n'));
 await page.getByRole('button',{name:'Usar CSV colado'}).click();await page.getByRole('button',{name:'Validar e pré-visualizar'}).click();
 await expect(page.getByRole('button',{name:'Importar 101 leads válidos'})).toBeEnabled();
 await page.getByRole('button',{name:'Importar 101 leads válidos'}).click();await expect.poll(()=>imports).toBe(1);
 await page.getByRole('button',{name:'Parar após este lote'}).click();release();
 await expect(page.getByText('101 linhas · 1 aptas · 0 com erros · 100 importadas')).toBeVisible();expect(imports).toBe(1);
});
test('XLSX upload, blocked preview on server failure, and column mapping invalidation',async({page})=>{
 let fail=true;await page.route('**/rest/v1/rpc/bulk_qualification',route=>fail?route.fulfill({status:403,json:{message:'Sem permissão nesta empresa.'}}):route.fulfill({json:[{line:2,error:null,id:null}]}));
 await page.goto('/tests/ui/?flow');await page.getByRole('button',{name:'Importar leads em lote',exact:true}).click();
 const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([['Razão social','CNPJ','Nome do contato','Telefone / WhatsApp'],['Alfa','11222333000181','Ana','31999999999']]),'Leads');
 await page.getByLabel('Enviar XLSX ou CSV').setInputFiles({name:'leads.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(w,{type:'buffer',bookType:'xlsx'})});
 await page.getByRole('button',{name:'Validar e pré-visualizar'}).click();await expect(page.getByRole('alert')).toContainText('Sem permissão');await expect(page.getByRole('button',{name:'Importar 1 leads válidos'})).toBeDisabled();
 fail=false;await page.getByRole('button',{name:'Validar e pré-visualizar'}).click();await expect(page.getByRole('button',{name:'Importar 1 leads válidos'})).toBeEnabled();
 await page.getByLabel('Razão social *').selectOption('-1');await expect(page.getByRole('button',{name:'Importar 0 leads válidos'})).toBeDisabled();
});
