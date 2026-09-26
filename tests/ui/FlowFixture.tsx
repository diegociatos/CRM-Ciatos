import React,{useState} from 'react';
import NewLeadForm from '../../components/NewLeadForm';
import QualificationQueue from '../../components/QualificationQueue';
import KanbanBoard from '../../components/KanbanBoard';
import Agenda from '../../components/Agenda';
import LeadDetails from '../../components/LeadDetails';
import HelpCenter from '../../components/HelpCenter';
import {LeadStatus,UserRole} from '../../types';
const user={id:'qa',name:'Usuário de demonstração',role:UserRole.ADMIN,department:'Comercial'} as any;
const config={taxRegimes:['Simples Nacional'],companySizes:['Microempresa (ME)'],taskTypes:[{id:'call',name:'Ligação',template:'',icon:'',channel:'TELEFONE'}],phases:[{id:'ph-qualificado',name:'Lead Qualificado',order:0,authorizedUserIds:[]},{id:'ph-contato',name:'Contato Inicial',order:1,authorizedUserIds:[]}],serviceTypes:[],messaging:{email:{},whatsapp:{}}} as any;
export default function FlowFixture(){
 const [open,setOpen]=useState(false),[mode,setMode]=useState('success'),[view,setView]=useState('qualification'),[leads,setLeads]=useState<any[]>([]),[events,setEvents]=useState<any[]>([]),[selected,setSelected]=useState('');
 const [message,setMessage]=useState('');
 const save=async(data:any)=>{await new Promise(r=>setTimeout(r,100));if(mode==='throw')throw Error('offline');if(mode==='fail')return {success:false,message:'Não foi possível salvar. Tente novamente.'};const lead={...data,id:'lead-qa',status:LeadStatus.QUALIFICATION,inQueue:true,phaseId:'ph-qualificado',ownerId:'qa',createdAt:new Date().toISOString(),interactions:[],tasks:[]};setLeads([lead]);setMessage('Lead cadastrado com sucesso.');setView('qualification');return {success:true,message:'Salvo'};};
 const update=async(data:any)=>{if(mode!=='success')return false;setLeads(ls=>ls.map(l=>l.id===data.id?data:l));return true;};
 const saveEvent=async(data:any)=>{if(mode!=='success')return false;setEvents(es=>[...es,data]);return true;};
 const active=leads.find(l=>l.id===selected);
 return <div className="p-5"><div className="flex gap-4 flex-wrap mb-6"><button className="btn-navy" onClick={()=>setOpen(true)}>Novo Lead</button><button onClick={()=>setView('qualification')}>Fila de Qualificação</button><button onClick={()=>setView('kanban')}>Pipeline Comercial</button><button onClick={()=>setView('agenda')}>Minha Agenda</button><button onClick={()=>setView('help')}>Ajuda e passo a passo</button><label>Resultado simulado <select value={mode} onChange={e=>setMode(e.target.value)}><option value="success">Sucesso</option><option value="fail">Falha</option><option value="throw">Sem conexão</option></select></label></div>{message&&<p role="status" className="app-notice">{message}</p>}
 {view==='qualification'&&<QualificationQueue leads={leads} config={config} currentUser={user} canEdit canCreate onApprove={id=>{setLeads(ls=>ls.map(l=>l.id===id?{...l,inQueue:false}:l));setMessage('Lead encaminhado ao pipeline.');}} onUpdateLead={update} onDeleteLead={()=>{}} onSelectLead={setSelected} onOpenManualLead={()=>setOpen(true)}/>}
 {view==='kanban'&&<KanbanBoard leads={leads} phases={config.phases} onMoveLead={(id,phaseId)=>setLeads(ls=>ls.map(l=>l.id===id?{...l,phaseId}:l))} onSelectLead={setSelected} role={UserRole.ADMIN} currentUserId="qa" searchTerm="" users={[user]}/>}
 {view==='agenda'&&<Agenda events={events} leads={leads} users={[user]} currentUser={user} config={config} onSaveEvent={saveEvent} onDeleteEvent={()=>{}} onSelectLead={setSelected}/>}
 {view==='help'&&<HelpCenter onNavigate={setView} onCreate={()=>setOpen(true)}/>}
 {open&&<div className="fixed inset-0 z-[3000] bg-slate-900/80 flex items-center justify-center p-3"><NewLeadForm config={config} currentUser={user} onSave={save} onCancel={()=>setOpen(false)}/></div>}
 {active&&<LeadDetails lead={active} config={config} agendaEvents={events} currentUser={user} allUsers={[user]} onClose={()=>setSelected('')} onUpdateLead={update} onDeleteLead={()=>{}} onAddInteraction={()=>{}} onAddAgendaEvent={saveEvent} onDeleteAgendaEvent={()=>{}}/>}
 </div>;
}
