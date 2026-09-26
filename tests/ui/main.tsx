import WorkspaceApplication from '../../App';
import FlowFixture from './FlowFixture';
import '../../styles.css';
import Dashboard from '../../components/Dashboard';
import Sidebar from '../../components/Sidebar';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import AiCenter from '../../components/AiCenter';
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
createRoot(document.getElementById('root')!).render(location.search === '?companies' ? <WorkspaceApplication/> : location.search === '?flow' ? <FlowFixture/> : location.search === '?design' ? <DesignFixture/> : location.search === '?regressions' ? <RegressionFixture/> : <AiCenter/>);
