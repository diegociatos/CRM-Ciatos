import TemplateEditorFixture from './TemplateEditorFixture';
import InboxFixture from './InboxFixture';
import OnboardingFixture from './OnboardingFixture';
import {PlatformAdmin} from '../../components/PlatformAdmin';
import WorkspaceApplication from '../../App';
import FlowFixture from './FlowFixture';
import '../../styles.css';
import Dashboard from '../../components/Dashboard';
import Sidebar from '../../components/Sidebar';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import AiCenter from '../../components/AiCenter';
import SdrAgent from '../../components/SdrAgent';
import Header from '../../components/Header';
import CloserDashboard from '../../components/CloserDashboard';
import SdrDashboard from '../../components/SdrDashboard';
import ExecutiveDashboard from '../../components/ExecutiveDashboard';
import { UserRole } from '../../types';
function RegressionFixture() {
  const [selected, setSelected] = useState('');
  const user = {id:'qa',name:'Usuário Teste',role:UserRole.ADMIN} as any;
  const leads = [{id:'qa-lead',name:'Ana Teste',company:'Empresa QA',email:'qa@example.test',cnpj:'123'}] as any;
  const props = {currentUser:user,allUsers:[user],leads:[],qualifications:[],config:{} as any,userGoals:[]};
  return <><Header leads={leads} onSelectLead={setSelected} onToggleMenu={()=>{}} notifications={[]} onMarkRead={()=>{}} onClearAll={()=>{}} onOpenNewLead={()=>{}} currentUser={user} onSwitchRole={()=>{}} canSwitchRole={false} canCreate={false} onOpenUserProfile={()=>{}} onLogout={()=>{}}/><p role="status">Selecionado: {selected}</p><CloserDashboard {...props}/><SdrDashboard {...props} onUpdateStatus={()=>{}}/><ExecutiveDashboard leads={[]} users={[user]} config={{} as any} userGoals={[]}/></>;
}
function DesignFixture() {
  const [view,setView] = useState<any>('dashboard');
  const [mobile,setMobile] = useState(false);
  const [created,setCreated] = useState(false);
  const user = {id:'qa',name:'Diego',role:UserRole.ADMIN} as any;
  return <div className="crm-app"><Sidebar mobileOpen={mobile} onClose={()=>setMobile(false)} currentView={view} setView={v=>{setView(v);setMobile(false);}} role={UserRole.ADMIN} onOpenNewLead={()=>setCreated(true)} canCreate/><Header leads={[]} onSelectLead={()=>{}} onToggleMenu={()=>setMobile(true)} notifications={[]} onMarkRead={()=>{}} onClearAll={()=>{}} onOpenNewLead={()=>setCreated(true)} currentUser={user} onSwitchRole={()=>{}} canSwitchRole={false} canCreate onOpenUserProfile={()=>{}} onLogout={()=>{}}/><main className="crm-main ml-0 md:ml-64 p-4 md:p-8">{created && <p role="status">Cadastro solicitado</p>}{view==='dashboard' ? <Dashboard leads={[]} tasks={[]} notifications={[]} currentUser={user} onNavigate={setView} onCreate={()=>setCreated(true)}/> : view==='ai_center' ? <AiCenter/> : <h1>{view}</h1>}</main></div>;
}
function CafeCampaignFixture(){
 const [view,setView]=useState<'dashboard'|'ai_center'>('dashboard');
 const org={id:'0d1ee589-5acc-4321-a560-b6f176394a6e',nome:'CafeWorking'};
 const user={id:'qa',name:'Diego Garcia',role:UserRole.ADMIN} as any;
 return <main className="p-5">{view==='dashboard'?<Dashboard leads={[]} tasks={[]} notifications={[]} currentUser={user} companyId={org.id} companyName={org.nome} onOpenCadences={()=>setView('ai_center')} onNavigate={()=>setView('ai_center')}/>:<AiCenter workspace={org}/>}</main>;
}
function SdrSwitchFixture(){
 const [org,setOrg]=useState('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 return <main><button onClick={()=>setOrg('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')}>Trocar para empresa nova</button><SdrAgent org={org} admin sequences={[]} policyLive={false} onChanged={()=>{}}/></main>;
}
createRoot(document.getElementById('root')!).render(location.search==='?inbox'?<InboxFixture/>:location.search==='?template-editor'?<TemplateEditorFixture/>:location.search.startsWith('?onboarding') ? <OnboardingFixture/> : location.search === '?platform' ? <PlatformAdmin onClose={()=>{document.body.dataset.closed='true';}}/> : location.search === '?companies' ? <WorkspaceApplication/> : location.search === '?flow' ? <FlowFixture/> : location.search === '?design' ? <DesignFixture/> : location.search === '?cafeworking' ? <CafeCampaignFixture/> : location.search === '?sdr-switch' ? <SdrSwitchFixture/> : location.search === '?regressions' ? <RegressionFixture/> : <AiCenter/>);
