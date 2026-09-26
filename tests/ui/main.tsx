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
createRoot(document.getElementById('root')!).render(location.search === '?regressions' ? <RegressionFixture/> : <AiCenter/>);
