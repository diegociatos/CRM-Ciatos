// Generates an idempotent, draft-only provisioning script for the nine named Ciatos workspaces.
// Run with tsx and review the SQL before applying. Never enrolls or sends.
import {writeFileSync} from 'node:fs';
import {cadenceLibrary} from '../../lib/cadenceLibrary.ts';
const companies:Record<string,string[]>={
 '00000000-0000-4000-8000-000000000001':cadenceLibrary.map(c=>c.id),
 '8345da0f-171a-44c4-ab3b-b5b468487c09':['tributario','credito'],
 '97dbf5e9-9ea2-4fb1-9de9-7561a1810567':['racionaliza'],
 'd136ff75-88e2-49f0-a57c-34f8ffde2468':['holding'],
 '86086314-ad9c-4064-832d-21a0ce9fc4a7':['log'],
 '5080f093-3019-4015-b048-3d837aae21ee':['contabilidade'],
 '791a8796-503a-4817-b516-f229f54b58af':['crise','tributario','holding','credito'],
 'eb2c1641-b38c-4104-b097-f74398c50f54':['juridico'],
 '0934f7bb-ceee-4fc1-95fa-92d1267a1d9c':['bank'],
};
const quote=(v:unknown)=>"'"+String(v).replace(/'/g,"''")+"'";
let sql='begin;\ndo $install$ declare sid uuid; begin\n';
for(const [org,keys] of Object.entries(companies)){
 sql+=`if not exists(select 1 from crm.organizations where id='${org}' and plano='internal') then raise exception 'Workspace interno ausente'; end if;\n`;
 for(const key of keys){
  const c=cadenceLibrary.find(c=>c.id===key)!;
  sql+=`if not exists(select 1 from crm.outreach_sequences where organization_id='${org}' and settings->>'library_key'=${quote(key)}) then\ninsert into crm.outreach_sequences(organization_id,nome,status,settings) values('${org}',${quote(c.titulo)},'DRAFT',${quote(JSON.stringify({publico:'prospect',library_key:key,service:c.name}))}::jsonb) returning id into sid;\n`;
  c.passos.forEach((p,i)=>{sql+=`insert into crm.outreach_steps(sequence_id,ordem,tipo,delay_minutes,config) values(sid,${i},'EMAIL',${p.espera_dias*1440},${quote(JSON.stringify({subject:p.assunto,body:p.corpo}))}::jsonb);\n`;});
  sql+="insert into crm.outreach_steps(sequence_id,ordem,tipo,delay_minutes,config) values(sid,4,'WAIT',7200,'{}');\nend if;\n";
 }
 sql+=`insert into crm.sdr_settings(organization_id,sequence_id,notify_email) select '${org}',id,'diego.garcia@grupociatos.com.br' from crm.outreach_sequences where organization_id='${org}' and settings->>'library_key'=${quote(keys[0])} on conflict(organization_id) do nothing;\n`;
}
sql+='end $install$;\ncommit;\n';
writeFileSync('.deployment-backup.local/install-ciatos-sdr.sql',sql);
