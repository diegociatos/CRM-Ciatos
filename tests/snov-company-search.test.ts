import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SnovAdapter } from '../supabase/functions/_shared/snov.ts';
import { snovCompanies, snovCompanyFilters } from '../supabase/functions/_shared/snovCompanySearch.ts';

test('Radar traduz setor e UF sem pedir IA, CNPJ ou regime à API do Snov.io', () => {
  assert.deepEqual(snovCompanyFilters({segment:'Transporte de Cargas',state:'MG'}),{
    company:{industries:{include:['Transportation/Trucking/Railroad']}},
    locations:{include:{locality:'Minas Gerais',location_type:'state'}},
  });
  assert.equal(snovCompanyFilters({segment:'Contabilidade'}).locations.include.locality,'Brazil');
  assert.deepEqual(snovCompanyFilters({segment:'Advocacia',city:'Belo Horizonte',state:'MG'}).locations.include,
    {locality:'Belo Horizonte',location_type:'city'});
});

test('Snov usa somente endpoints fixos e tarefa persistível para uma página', async () => {
  const calls:Array<{url:string;body:string;headers:any}>=[];
  const request=async (url:string|URL|Request,init?:RequestInit) => {
    calls.push({url:String(url),body:String(init?.body||''),headers:init?.headers});
    if(String(url).endsWith('/oauth/access_token'))return new Response(JSON.stringify({access_token:'test-token'}));
    if(String(url).endsWith('/companies/start'))return new Response(JSON.stringify({meta:{task_hash:'abc123456789'}}));
    return new Response(JSON.stringify({status:'completed',data:{page:1,total_pages:1,companies:[]}}));
  };
  const env=(name:string)=>({CRM_SNOV_ENABLED:'true',SNOV_CLIENT_ID:'id',SNOV_CLIENT_SECRET:'secret'} as Record<string,string>)[name];
  const adapter=new SnovAdapter(env,request as typeof fetch);
  const hash=await adapter.startCompanySearch(snovCompanyFilters({segment:'Contabilidade'}),1);
  assert.equal(hash,'abc123456789');
  assert.equal((await adapter.companySearchResult(hash)).status,'completed');
  assert.equal(calls[1].url,'https://api.snov.io/v2/database-search/companies/start');
  assert.equal(JSON.parse(calls[1].body).filters.company.industries.include[0],'Accounting');
  assert.equal(calls[2].url,'https://api.snov.io/v2/database-search/companies/result/abc123456789');
  assert.equal(JSON.stringify(calls).includes('api.openai.com'),false);
  await assert.rejects(adapter.companySearchResult('https://other.example'),/invalid_task/);
});

test('Radar aceita apenas domínios únicos e empresas da localização solicitada', () => {
  const result={status:'completed',data:{page:1,total_pages:2,companies:[
    {name:'Empresa A',domain:'a.com.br',location:'Belo Horizonte, Minas Gerais, Brazil',industry:'Accounting',size:'11-50'},
    {name:'Empresa A duplicada',domain:'a.com.br',location:'Belo Horizonte, Minas Gerais, Brazil'},
    {name:'Empresa B',domain:'b.com.br',location:'São Paulo, São Paulo, Brazil'},
    {name:'Empresa C',domain:'c.com.br',location:'Belo Horizonte, Minas Gerais, Brazil'},
    {name:'Exterior',domain:'d.com',location:'London, UK'},
  ]}};
  const parsed=snovCompanies(result,{city:'Belo Horizonte',state:'MG'});
  assert.deepEqual(parsed.companies.map(c=>c.domain),['a.com.br','c.com.br']);
  assert.equal(parsed.totalPages,2);
  assert.equal(parsed.companies[0].size,'11-50');
});
