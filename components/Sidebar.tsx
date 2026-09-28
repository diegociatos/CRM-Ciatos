
import React, { useEffect, useRef, useState } from 'react';
import { NavigationState, UserRole } from '../types';

interface SidebarProps {
  companyName?:string;
  /** Troca de empresa no cartão da barra lateral (mesmo padrão do ContaOne). */
  companyId?:string;
  companies?:{id:string;nome:string}[];
  onCompanyChange?:(id:string)=>void;
  onManageCompanies?:()=>void;
  onOpenPlatform?:()=>void;
  brandName?:string;brandColor?:string;
  mobileOpen: boolean;
  onClose: () => void;
  currentView: NavigationState['view'];
  setView: (view: NavigationState['view']) => void;
  role: UserRole;
  onOpenNewLead: () => void;
  canCreate: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ brandName,brandColor,companyName="Grupo Ciatos", companyId, companies=[], onCompanyChange, onManageCompanies, onOpenPlatform, mobileOpen, onClose, currentView, setView, role, onOpenNewLead, canCreate }) => {
  const [companyMenu,setCompanyMenu] = useState(false);
  const companyRef = useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!companyMenu)return;
    const fora=(e:MouseEvent)=>{if(!companyRef.current?.contains(e.target as Node))setCompanyMenu(false);};
    document.addEventListener('mousedown',fora);
    return()=>document.removeEventListener('mousedown',fora);
  },[companyMenu]);
  const hasCompanyMenu = companies.length>1 || !!onManageCompanies || !!onOpenPlatform;
  const menuItems = [
    {id:'help',label:'Ajuda e passo a passo',icon:'M9 9a3 3 0 016 0c0 2-3 2-3 4m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',roles:Object.values(UserRole)},
    { id: 'ai_center', label: 'Central da IA', icon: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', roles: Object.values(UserRole) },
    { id: 'executive_bi', label: 'Estratégico (Admin)', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', roles: [UserRole.ADMIN] },
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
    { id: 'user_management', label: 'Gestão de Usuários', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', roles: [UserRole.ADMIN] },
    { id: 'settings', label: 'Configurações', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z', roles: [UserRole.ADMIN] }
  ];

  const groups = [
    { title: 'Seu dia a dia', ids: ['dashboard','ai_center','customers','kanban','agenda'] },
    { title: 'Desenvolver negócios', ids: ['prospecting','qualification','scripts','marketing_automation'] },
    { title: 'Gestão & relacionamento', ids: ['executive_bi','closer_dashboard','sdr_dashboard','operational_dashboard','post_sales'] },
    { title: 'Workspace', ids: ['help','user_management','settings'] },
  ];
  return <>
    {mobileOpen && <button className="nav-backdrop md:hidden" aria-label="Fechar navegação" onClick={onClose}/>}
    <aside className={`crm-sidebar ${mobileOpen ? 'flex' : 'hidden'} md:flex`} aria-label="Navegação principal" onKeyDown={e => {if(e.key === 'Escape') onClose();}}>
      <div className="brand-lockup"><img src="/ciatos-mark.svg" alt=""/><div><span>{brandName||<>ciatos<span className="brand-dot">.</span></>}</span><small>RELACIONAMENTOS & NEGÓCIOS</small></div><button aria-label="Fechar menu" onClick={onClose} className="md:hidden ml-auto p-2">✕</button></div>
      <div className="workspace-wrap" ref={companyRef} onKeyDown={e=>{if(e.key==='Escape'&&companyMenu){e.stopPropagation();setCompanyMenu(false);}}}>
        <button type="button" className="workspace-label" disabled={!hasCompanyMenu} aria-haspopup="menu" aria-expanded={companyMenu} onClick={()=>setCompanyMenu(v=>!v)}>
          <span className="workspace-avatar" style={brandColor?{background:brandColor,color:"white"}:undefined}>{companyName.slice(0,2).toUpperCase()}</span>
          <div><strong>{companyName}</strong><small>{hasCompanyMenu?(companies.length>1?'Trocar empresa':'Gerenciar empresa'):'Seu espaço de crescimento'}</small></div>
          {hasCompanyMenu&&<span className={`workspace-chevron ${companyMenu?'open':''}`} aria-hidden="true">›</span>}
        </button>
        {companyMenu&&<div className="workspace-menu" role="menu" aria-label="Empresas">
          {companies.map(c=><button type="button" role="menuitemradio" aria-checked={c.id===companyId} key={c.id} className={`workspace-menu-item ${c.id===companyId?'is-current':''}`} onClick={()=>{setCompanyMenu(false);if(c.id!==companyId)onCompanyChange?.(c.id);}}><span className="workspace-avatar">{c.nome.slice(0,2).toUpperCase()}</span><span>{c.nome}</span>{c.id===companyId&&<span className="workspace-check" aria-hidden="true">✓</span>}</button>)}
          {(onManageCompanies||onOpenPlatform)&&<div className="workspace-menu-divider"/>}
          {onManageCompanies&&<button type="button" role="menuitem" className="workspace-menu-item" onClick={()=>{setCompanyMenu(false);onManageCompanies();}}><span className="workspace-menu-icon" aria-hidden="true">⚙</span><span>Gerenciar empresas</span></button>}
          {onOpenPlatform&&<button type="button" role="menuitem" className="workspace-menu-item" onClick={()=>{setCompanyMenu(false);onOpenPlatform();}}><span className="workspace-menu-icon" aria-hidden="true">↗</span><span>Administrar o CRM</span></button>}
        </div>}
      </div>
      {canCreate && <button onClick={onOpenNewLead} className="nav-create"><span aria-hidden="true">＋</span> Novo Lead</button>}
      <nav className="nav-groups">{groups.map(group => {
        const items = group.ids.map(id => menuItems.find(item => item.id===id)!).filter(item => item.roles.includes(role));
        return items.length ? <div className="nav-group" key={group.title}><p>{group.title}</p>{items.map(item => <button key={item.id} aria-current={currentView===item.id ? 'page' : undefined} onClick={()=>setView(item.id as any)} className={`nav-item ${currentView===item.id?'is-current':''}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d={item.icon}/></svg><span>{item.label}</span>{item.id==='ai_center' && <small aria-hidden="true">IA</small>}</button>)}</div> : null;
      })}</nav>
      <div className="nav-footer"><span className="status-dot"/><div><strong>Conexões que geram valor</strong><small>Grupo Ciatos · {role}</small></div></div>
    </aside>
  </>;
};
export default Sidebar;
