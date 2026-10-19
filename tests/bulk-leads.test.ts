import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {parseCsv,prepareRows,validCnpj,csvCell,mapLeadHeaders} from '../lib/bulkLeads';

test('maps contact and company emails independently without assigning a corporate address to a person',()=>{
 const headers=['Razão social','CNPJ','Nome do contato','Telefone / WhatsApp','E-mail da lead','E-mail comercial'];
 const mapping=mapLeadHeaders(headers);
 assert.equal(mapping.email,4);assert.equal(mapping.companyEmail,5);
 const rows=prepareRows([headers,['Alfa','11222333000181','Ana','123','','SEDE@EXAMPLE.COM']],mapping);
 assert.equal(rows[0].values.email,'');assert.equal(rows[0].values.companyEmail,'sede@example.com');assert.equal(rows[0].error,undefined);
});

test('CSV preserves quoted delimiters, newlines, accents and source row numbers',()=>{
 const table=parseCsv('\uFEFFRazão social;CNPJ;Nome;Telefone;Email\r\n"Alfa; Comércio";11.222.333/0001-81;"Ana\nSilva";31999999999;ANA@EXAMPLE.COM\r\n\r\nDuplicada;11222333000181;Ana;31999999999;ana@example.com');
 const rows=prepareRows(table,{legalName:0,cnpj:1,name:2,phone:3,email:4});
 assert.equal(rows[0].values.legalName,'Alfa; Comércio');assert.equal(rows[0].values.name,'Ana\nSilva');
 assert.equal(rows[0].values.email,'ana@example.com');assert.equal(rows[1].line,4);assert.match(rows[1].error!,/Duplicado/);
 assert.throws(()=>parseCsv('a,b\n"unterminated'),/aspas/);
 assert.equal(parseCsv('a,b\nx,y')[1][1],'y');assert.equal(parseCsv('a\tb\nx\ty')[1][1],'y');
 assert.equal(csvCell('=HYPERLINK("bad")'),'"\'=HYPERLINK(""bad"")"');
});
test('required fields, numeric and alphanumeric CNPJ checksums, email and row shape',()=>{
 assert.equal(validCnpj('11.222.333/0001-81'),true);assert.equal(validCnpj('12.ABC.345/01DE-35'),true);
 for(const s of ['00000000000000','11222333000182','112223330001810','bad'])assert.equal(validCnpj(s),false);
 const rows=prepareRows([['company','cnpj','name','phone','email'],['Alfa','11222333000181','','','bad'],['Beta','11222333000181','Ana','123','ana@example.com','extra']],{legalName:0,cnpj:1,name:2,phone:3,email:4});
 assert.match(rows[0].error!,/contato obrigatório/);assert.match(rows[0].error!,/E-mail inválido/);assert.match(rows[1].error!,/colunas/);
});

test('bulk RPC validates under tenant RLS, deduplicates, queues and never enrolls or sends',async()=>{
 const db=new PGlite();const admin='11111111-1111-4111-8111-111111111111',outsider='22222222-2222-4222-8222-222222222222';
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated,service_role;`);
  const files=readdirSync('supabase/migrations').sort();for(let i=0;i<files.length;i++){
   await db.exec(readFileSync('supabase/migrations/'+files[i],'utf8'));
   if(i===0)await db.exec(`insert into auth.users values('${admin}'),('${outsider}');insert into crm.profiles(id,nome,email,papel) values('${admin}','Admin','admin@example.test','ADMIN'),('${outsider}','Outro','other@example.test','SDR');`);
  }
  await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${admin}',false);`);
  const a=(await db.query<any>(`select crm.save_company(null,'Empresa A','{}') id`)).rows[0].id;
  const b=(await db.query<any>(`select crm.save_company(null,'Empresa B','{}') id`)).rows[0].id;
  const call=async(org:string,rows:any[],preview=true)=>(await db.query<any>('select crm.bulk_qualification($1,$2::jsonb,$3) result',[org,JSON.stringify(rows),preview])).rows[0].result;
  const row={line:2,values:{legalName:'Alfa',cnpj:'11.222.333/0001-81',name:'Ana',phone:'31999999999',email:'Ana@Example.com',organizationId:b,status:'Fechado (Ganho)',marketingAutomation:{active:true}}};
  assert.equal((await call(a,[row]))[0].error,null);
  assert.equal((await db.query(`select * from crm.leads where organization_id='${a}'`)).rows.length,0);
  const result=await call(a,[row,{...row,line:3},{line:4,values:{cnpj:'invalid'}}],false);
  assert.ok(result[0].id);assert.match(result[1].error,/Duplicado/);assert.ok(result[2].error);
  assert.match((await call(a,[row]))[0].error,/cadastrado/);
  assert.match((await call(a,[{...row,values:{...row.values,cnpj:'12ABC34501DE35'}}]))[0].error,/cadastrado/,'email dedup');
  const second=await call(b,[row],false);assert.ok(second[0].id,'same identity allowed in a different company');
  const lead=(await db.query<any>('select * from crm.leads where id=$1',[result[0].id])).rows[0];
  assert.equal(lead.organization_id,a);assert.equal(lead.owner_id,admin);assert.equal(lead.in_queue,true);assert.equal(lead.relacao,'prospect');assert.equal(lead.status,'Qualificação');
  assert.equal(lead.dados.marketingAutomation,undefined);assert.equal(lead.dados.organizationId,undefined);
  for(const t of ['sequence_enrollments','automation_jobs','sdr_queue'])assert.equal((await db.query(`select * from crm.${t}`)).rows.length,0);
  await assert.rejects(call(a,Array.from({length:101},()=>row)),/Lote inválido/);
  await db.exec(`select set_config('request.jwt.claim.sub','${outsider}',false)`);await assert.rejects(call(a,[row],false),/Sem permissão/);
  await db.exec('reset role;set role anon');await assert.rejects(call(a,[row]));
 }finally{await db.close();}
});
