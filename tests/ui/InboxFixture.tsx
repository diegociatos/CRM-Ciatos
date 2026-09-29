import React,{useState} from 'react';
import Inbox from '../../components/Inbox';
import {UserRole} from '../../types';

const user={id:'user-one',name:'Diego',email:'diego@example.test',role:UserRole.ADMIN,department:'Comercial'} as any;
const orgOne='00000000-0000-4000-8000-000000000001';
const orgTwo='00000000-0000-4000-8000-000000000002';
const conversation={id:'conversation-1',organization_id:orgOne,lead_id:'lead-1',status:'OPEN',assigned_to:null,subject:'Re: Serviços Ciatos [Ciatos:11111111-1111-4111-8111-111111111111]',last_message_at:'2026-09-29T12:00:00Z',created_at:'2026-09-29T12:00:00Z'};
const lead={id:'lead-1',organization_id:orgOne,nome:'Ana',empresa:'Empresa Exemplo',email:'ana@example.test',telefone:'(00) 90000-0000',opt_out:false};
const rows:Record<string,any[]>={inbox_conversations:[conversation],inbox_messages:[{id:'message-1',conversation_id:conversation.id,organization_id:orgOne,direction:'INBOUND',sender:lead.email,recipient:'envio@example.test',subject:'Re: Serviços Ciatos',body:'Gostaria de conversar amanhã.',author_id:null,received_at:'2026-09-29T12:00:00Z'}],inbox_reads:[],leads:[lead]};
const fake={
 functions:{async invoke(name:string,{body}:any){if(name!=='crm-inbox-send')return {data:null,error:new Error('Unknown function')};rows.inbox_messages.push({id:`out-${rows.inbox_messages.length}`,conversation_id:body.conversation_id,organization_id:orgOne,direction:'OUTBOUND',sender:'envio@example.test',recipient:lead.email,subject:conversation.subject,body:body.body,author_id:user.id,delivery_status:'ACCEPTED',received_at:new Date().toISOString()});return {data:{status:'ACCEPTED'},error:null};}},
 from(table:string){const clauses:Array<(x:any)=>boolean>=[];let max=Infinity;let orderKey='';let ascending=true;
  const query={select(){return query;},eq(key:string,value:any){clauses.push(x=>x[key]===value);return query;},in(key:string,values:any[]){clauses.push(x=>values.includes(x[key]));return query;},order(key:string,options?:{ascending?:boolean}){orderKey=key;ascending=options?.ascending!==false;return query;},limit(n:number){max=n;return query;},then(resolve:(value:any)=>void){let data=(rows[table]||[]).filter(x=>clauses.every(fn=>fn(x)));if(orderKey)data=[...data].sort((a,b)=>String(a[orderKey]).localeCompare(String(b[orderKey]))*(ascending?1:-1));resolve({data:data.slice(0,max),error:null});}};return query;
 },
 async rpc(name:string,args:any){if(name==='mark_inbox_read'){rows.inbox_reads=[{conversation_id:args.cid,organization_id:orgOne,user_id:user.id,read_at:new Date().toISOString()}];}
  if(name==='update_inbox_conversation'){Object.assign(conversation,{status:args.new_status,assigned_to:args.new_assignee});}
  if(name==='add_inbox_note'){rows.inbox_messages.push({id:`note-${rows.inbox_messages.length}`,conversation_id:args.cid,organization_id:orgOne,direction:'INTERNAL',sender:'',recipient:'',subject:'',body:args.note_text,author_id:user.id,received_at:new Date().toISOString()});}
  return {data:null,error:null};}
};

export default function InboxFixture(){const [org,setOrg]=useState(orgOne);const [opened,setOpened]=useState(false);
 return <div className="crm-app"><div className="p-3 flex gap-2"><button onClick={()=>setOrg(orgOne)}>Empresa Exemplo</button><button onClick={()=>setOrg(orgTwo)}>Outra empresa</button>{opened&&<span role="status">Cadastro aberto</span>}</div><Inbox key={org} client={fake as any} organizationId={org} users={[user]} currentUser={user} onOpenLead={()=>setOpened(true)}/></div>;
}
