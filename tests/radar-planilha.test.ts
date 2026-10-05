import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const user = '11111111-1111-4111-8111-111111111111';
const org = '00000000-0000-4000-8000-000000000001';

async function banco() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated, service_role; grant execute on function auth.uid() to authenticated,service_role;`);
  const migrations = readdirSync('supabase/migrations').sort();
  for (const path of migrations.slice(0, 2)) await db.exec(readFileSync(`supabase/migrations/${path}`, 'utf8'));
  await db.exec(`insert into auth.users values('${user}'); insert into crm.profiles(id,nome,email,papel) values('${user}','Ana Equipe','ana@ciatos.test','ADMIN');`);
  for (const path of migrations.slice(2)) await db.exec(readFileSync(`supabase/migrations/${path}`, 'utf8'));
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${user}',false);`);
  return db;
}
const importar = async (db: PGlite, job: string | null, linhas: unknown[], lista = 'Feira de Logística 2026') =>
  (await db.query<{ r: any }>(`select crm.import_radar_sheet($1,$2,$3,$4::jsonb,$5) r`, [org, job, lista, JSON.stringify(linhas), 'feira.xlsx'])).rows[0].r;

test('planilha vira lista do Radar: normaliza site, descarta repetidos e avisa o que o Snov.io não alcança', async () => {
  const db = await banco();
  try {
    await assert.rejects(importar(db, null, [{ email: 'a@alfa.test' }], 'x'), /nome à lista/);
    const r = await importar(db, null, [
      { nome_fantasia: 'Alfa', contato: 'Ana Souza', cargo: 'Sócia', email: 'ANA@alfa.test', site: 'https://www.alfa.com.br/contato?x=1', telefone: '(31) 99999-0000', cnpj: '11.222.333/0001-81', cidade: 'Belo Horizonte', uf: 'mg' },
      { nome_fantasia: 'Alfa de novo', email: 'ana@alfa.test' },
      { razao_social: 'Beta Ltda', contato: 'Bruno', site: 'beta.com.br' },
      { nome_fantasia: 'Gama', email: 'nao-e-email' },
      { cidade: 'Contagem' },
    ]);
    assert.equal(r.inseridos, 3);
    assert.equal(r.ignorados, 2);
    assert.deepEqual(r.erros.map((e: any) => `${e.linha}:${e.motivo.split(':')[0]}`),
      ['2:Repetido nesta lista', '4:E-mail inválido', '4:Sem e-mail e sem site', '5:Sem empresa, contato ou e-mail']);
    const job = (await db.query<any>(`select status, dados from crm.mining_jobs where id = $1`, [r.job_id])).rows[0];
    assert.equal(job.status, 'Completed');
    assert.equal(job.dados.sourceProvider, 'planilha');
    assert.equal(job.dados.foundCount, 3);
    const alfa = (await db.query<any>(`select cnpj_raw, dados from crm.mining_leads where job_id = $1 and dados->>'tradeName' = 'Alfa'`, [r.job_id])).rows[0];
    assert.equal(alfa.cnpj_raw, '11222333000181');
    assert.equal(alfa.dados.emailCompany, 'ana@alfa.test');
    assert.equal(alfa.dados.website, 'alfa.com.br');
    assert.equal(alfa.dados.state, 'MG');
    assert.deepEqual(alfa.dados.sources, ['Planilha importada: feira.xlsx']);
    // Segundo lote na mesma lista não duplica e só aceita lista de planilha desta empresa.
    const r2 = await importar(db, r.job_id, [{ razao_social: 'Beta Ltda', contato: 'Bruno', site: 'www.beta.com.br' }, { nome_fantasia: 'Delta', email: 'd@delta.test' }]);
    assert.equal(r2.job_id, r.job_id);
    assert.equal(r2.inseridos, 1);
    await assert.rejects(importar(db, '99999999-9999-4999-8999-999999999999', [{ email: 'z@z.test' }]), /Lista inválida/);
  } finally { await db.close(); }
});

test('agente recebe a lista da planilha e reaproveita o lead que já tem o mesmo e-mail', async () => {
  const db = await banco();
  try {
    await db.exec(`insert into crm.leads(organization_id, nome, email, empresa, relacao) values ('${org}','Ana Souza','ana@alfa.test','Alfa','prospect')`);
    const r = await importar(db, null, [{ nome_fantasia: 'Alfa', contato: 'Ana Souza', email: 'ana@alfa.test' }, { nome_fantasia: 'Beta', contato: 'Bruno', site: 'beta.com.br' }]);
    const sid = (await db.query<{ id: string }>(`select crm.create_cadence_v2($1,'Prospecção feira','prospect',$2::jsonb,3) id`,
      [org, JSON.stringify([{ assunto: 'Olá {{name}}', corpo: 'Podemos conversar sobre a {{company}}?', espera_dias: 0 }])])).rows[0].id;
    await db.query(`select crm.set_cadence_state($1,'ACTIVE')`, [sid]);
    await db.query(`select crm.save_sdr_settings($1,true,$2,true,'Contatos colhidos na feira, interesse comercial legítimo','ana@ciatos.test',false,$3)`, [org, sid, r.job_id]);
    await db.exec('reset role');
    assert.equal((await db.query<{ n: number }>(`select crm.prepare_sdr_queue() n`)).rows[0].n, 2);
    const leads = (await db.query<any>(`select empresa, email, contact_source, dados->>'website' site from crm.leads where organization_id = $1 order by empresa`, [org])).rows;
    assert.equal(leads.length, 2, 'o e-mail já existente não vira um segundo lead');
    assert.equal(leads[1].site, 'beta.com.br');
    assert.match(leads[1].contact_source, /Planilha importada: feira\.xlsx/);
    assert.equal((await db.query<{ n: number }>(`select count(*)::int n from crm.sdr_queue`)).rows[0].n, 2);
  } finally { await db.close(); }
});

test('importar com automação liga o agente na lista e enfileira tudo de uma vez', async () => {
  const db = await banco();
  try {
    const linhas = Array.from({ length: 25 }, (_, i) => ({ nome_fantasia: `Transportadora ${i}`, email: `contato${i}@t${i}.test`, cnpj: String(11222333000100 + i) }));
    const r = await importar(db, null, linhas);
    const sid = (await db.query<{ id: string }>(`select crm.create_cadence_v2($1,'Prospecção','prospect',$2::jsonb,3) id`,
      [org, JSON.stringify([{ assunto: 'Olá', corpo: 'Podemos conversar?', espera_dias: 0 }])])).rows[0].id;
    const ligar = (job: string, basis = 'Dados públicos do CNPJ; oferta de serviços contábeis') =>
      db.query<{ n: number }>(`select crm.start_list_automation($1,$2,$3,false,$4,'ana@ciatos.test') n`, [org, job, sid, basis]);
    await assert.rejects(ligar(r.job_id), /Ative a cadência/);
    await db.query(`select crm.set_cadence_state($1,'ACTIVE')`, [sid]);
    await assert.rejects(ligar(r.job_id, 'curta'), /finalidade/);
    await assert.rejects(ligar('99999999-9999-4999-8999-999999999999'), /Lista inválida/);
    assert.equal((await ligar(r.job_id)).rows[0].n, 25, 'a lista inteira entra na fila, sem esperar o limite de 10 por minuto');
    const cfg = (await db.query<any>(`select enabled, simulate, radar_job_id from crm.sdr_settings where organization_id = $1`, [org])).rows[0];
    assert.deepEqual([cfg.enabled, cfg.simulate, cfg.radar_job_id], [true, false, r.job_id]);
    assert.equal((await ligar(r.job_id)).rows[0].n, 0, 'repetir não duplica');
    await assert.rejects(db.query(`select crm.prepare_sdr_queue()`), /permission denied/);
  } finally { await db.close(); }
});
