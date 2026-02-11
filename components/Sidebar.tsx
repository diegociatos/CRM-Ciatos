
import React from 'react';
import { NavigationState, UserRole } from '../types';

interface SidebarProps {
  currentView: NavigationState['view'];
  setView: (view: NavigationState['view']) => void;
  role: UserRole;
  onOpenNewLead: () => void;
  canCreate: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, setView, role, onOpenNewLead, canCreate }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Painel Geral', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', roles: [UserRole.ADMIN, UserRole.MANAGER] },
    { id: 'closer_dashboard', label: 'Performance Consultor', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6', roles: [UserRole.ADMIN, UserRole.CLOSER, UserRole.MANAGER] },
    { id: 'sdr_dashboard', label: 'Minha Produção SDR', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', roles: [UserRole.ADMIN, UserRole.SDR] },
    { id: 'scripts', label: 'Sales Playbook', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253', roles: [UserRole.ADMIN, UserRole.SDR, UserRole.CLOSER, UserRole.MANAGER] },
    { id: 'prospecting', label: 'Radar Inteligente', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7', roles: [UserRole.ADMIN, UserRole.SDR, UserRole.CLOSER] },
    { id: 'qualification', label: 'Fila de Qualificação', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', roles: [UserRole.ADMIN, UserRole.SDR, UserRole.CLOSER] },
    { id: 'marketing_automation', label: 'Automação Marketing', icon: 'M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z', roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.MARKETING] },
    { id: 'kanban', label: 'Pipeline Comercial', icon: 'M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2', roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.CLOSER, UserRole.SDR] },
    { id: 'agenda', label: 'Minha Agenda', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', roles: Object.values(UserRole) },
    { id: 'operational_dashboard', label: 'Onboarding do Cliente', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10', roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATIONAL] },
    { id: 'customers', label: 'Clientes Ativos', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z', roles: [UserRole.ADMIN, UserRole.MANAGER, UserRole.CLOSER, UserRole.OPERATIONAL, UserRole.CS] },
    { id: 'post_sales', label: 'Pós-Venda / Sucesso', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', roles: [UserRole.ADMIN, UserRole.OPERATIONAL, UserRole.CS, UserRole.CLOSER] },
    { id: 'settings', label: 'Configurações', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z', roles: [UserRole.ADMIN] }
  ];

  return (
    <div className="w-64 bg-[#0a192f] text-white min-h-screen flex flex-col fixed left-0 top-0 h-full z-50 border-r border-white/5 shadow-2xl">
      <div className="p-8 border-b border-white/5">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-[#c5a059] rounded-lg flex items-center justify-center shadow-lg shadow-[#c5a059]/10 text-white font-black serif-authority">CI</div>
          <span className="serif-authority text-2xl tracking-tighter">Ciatos</span>
        </div>
        {canCreate && (
          <button onClick={onOpenNewLead} className="w-full bg-[#c5a059] hover:bg-[#b08d4b] text-white py-3 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-xl transition-all flex items-center justify-center gap-2 group">
            <svg className="w-4 h-4 group-hover:rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
            Novo Lead
          </button>
        )}
      </div>
      <nav className="flex-1 mt-6 px-4 space-y-2 overflow-y-auto custom-scrollbar">
        {menuItems.filter(item => item.roles.includes(role)).map((item) => (
          <button key={item.id} onClick={() => setView(item.id as any)} className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all ${currentView === item.id ? 'bg-white/10 text-[#c5a059] border border-white/10' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} /></svg>
            <span className="font-semibold text-sm tracking-wide">{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="p-6 border-t border-white/5 bg-black/10">
         <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em] mb-1">Perfil Ativo</p>
         <p className="text-[10px] font-bold text-[#c5a059] uppercase tracking-widest">{role}</p>
      </div>
    </div>
  );
};

export default Sidebar;
