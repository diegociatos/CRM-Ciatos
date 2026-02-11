
import React, { useState } from 'react';
import { Notification, User, UserRole } from '../types';

interface HeaderProps {
  notifications: Notification[];
  onMarkRead: (id: string) => void;
  onClearAll: () => void;
  onOpenNewLead: () => void;
  currentUser: User;
  onSwitchRole: (role: UserRole) => void;
  canCreate: boolean;
  onOpenUserProfile: () => void;
}

const Header: React.FC<HeaderProps> = ({ 
  notifications, onMarkRead, onClearAll, onOpenNewLead, currentUser, onSwitchRole, canCreate, onOpenUserProfile 
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showRoleSwitcher, setShowRoleSwitcher] = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  return (
    <header className="h-20 border-b border-slate-200 bg-white/80 backdrop-blur-md flex items-center justify-between px-8 fixed top-0 right-0 left-64 z-[40]">
      <div className="flex items-center gap-4">
        <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2 flex items-center gap-3 group focus-within:border-[#c5a059] transition-all">
          <svg className="w-4 h-4 text-slate-400 group-focus-within:text-[#c5a059]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" placeholder="Pesquisa global de leads..." className="bg-transparent text-sm outline-none w-64 text-slate-600 font-medium" />
        </div>
      </div>

      <div className="flex items-center gap-6">
        {/* Notificações */}
        <div className="relative">
          <button 
            onClick={() => setShowDropdown(!showDropdown)}
            className="p-3 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition relative group shadow-sm"
          >
            <svg className="w-6 h-6 text-slate-400 group-hover:text-[#c5a059] transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2 w-5 h-5 bg-red-500 text-white border-2 border-white rounded-full flex items-center justify-center text-[10px] font-black animate-bounce">
                {unreadCount}
              </span>
            )}
          </button>

          {showDropdown && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)}></div>
              <div className="absolute right-0 mt-4 w-96 bg-white border border-slate-100 rounded-[2rem] shadow-2xl z-20 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="p-6 bg-[#0a192f] text-white flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-lg serif-authority">Central de Alertas</h3>
                    <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Feed em Tempo Real</p>
                  </div>
                  <button onClick={onClearAll} className="text-[10px] font-bold text-[#c5a059] hover:text-white uppercase tracking-tighter transition">Limpar Tudo</button>
                </div>
                <div className="max-h-[450px] overflow-y-auto divide-y divide-slate-50">
                  {notifications.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 italic text-sm">Nenhum evento pendente.</div>
                  ) : (
                    notifications.map(note => (
                      <div key={note.id} className="p-5 hover:bg-slate-50 transition cursor-pointer flex gap-4">
                        <div className="flex-1">
                          <p className="text-sm font-bold text-slate-800 leading-snug">{note.title}</p>
                          <p className="text-xs text-slate-500 mt-1">{note.message}</p>
                          <p className="text-[9px] font-black text-slate-300 uppercase mt-2">{note.timestamp}</p>
                        </div>
                        {!note.read && <div className="w-2 h-2 rounded-full bg-[#c5a059] self-center"></div>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="h-10 w-px bg-slate-200"></div>

        {/* Perfil do Usuário - Estilo Conforme Anexo */}
        <div className="relative">
          <button 
            onClick={() => setShowProfileDropdown(!showProfileDropdown)}
            className="flex items-center gap-4 hover:opacity-80 transition-all focus:outline-none"
          >
            <div className="text-right hidden sm:block">
              <p className="text-base font-black text-[#0a192f] serif-authority leading-tight">{currentUser.name}</p>
              <p className="text-[10px] text-[#c5a059] font-black uppercase tracking-[0.2em]">{currentUser.role}</p>
            </div>
            {currentUser.avatar && !currentUser.avatar.includes('ui-avatars') ? (
              <img className="w-12 h-12 rounded-[1.25rem] border-2 border-white shadow-xl object-cover" src={currentUser.avatar} alt="Avatar" />
            ) : (
              <div className="w-12 h-12 bg-[#0a192f] text-[#c5a059] rounded-[1.25rem] flex items-center justify-center font-black text-sm border-2 border-white shadow-xl">
                {getInitials(currentUser.name)}
              </div>
            )}
          </button>

          {showProfileDropdown && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowProfileDropdown(false)}></div>
              <div className="absolute right-0 mt-4 w-56 bg-white border border-slate-100 rounded-2xl shadow-2xl z-20 py-2 animate-in fade-in slide-in-from-top-2">
                <button 
                  onClick={() => { onOpenUserProfile(); setShowProfileDropdown(false); }}
                  className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition"
                >
                  <svg className="w-4 h-4 text-[#c5a059]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  Meu Perfil
                </button>
                <div className="border-t border-slate-100 my-1"></div>
                <button 
                  onClick={() => { setShowRoleSwitcher(!showRoleSwitcher); setShowProfileDropdown(false); }}
                  className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition"
                >
                  <svg className="w-4 h-4 text-[#c5a059]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                  Trocar Perfil (Simulação)
                </button>
                <div className="border-t border-slate-100 my-1"></div>
                <button 
                  onClick={() => alert("Logout efetuado.")}
                  className="w-full text-left px-4 py-2.5 text-xs font-bold text-red-500 hover:bg-red-50 flex items-center gap-3 transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                  Sair do CRM
                </button>
              </div>
            </>
          )}

          {/* Sub-menu de Troca de Perfil */}
          {showRoleSwitcher && (
            <div className="absolute right-0 mt-4 w-64 bg-white border border-slate-100 rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2">
              <div className="flex justify-between items-center px-4 py-2 border-b border-slate-50 mb-1">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Simular Perfil</p>
                <button onClick={() => setShowRoleSwitcher(false)} className="text-slate-300">✕</button>
              </div>
              {Object.values(UserRole).map(role => (
                <button 
                  key={role}
                  onClick={() => { onSwitchRole(role); setShowRoleSwitcher(false); }}
                  className={`w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-indigo-50 transition flex items-center justify-between ${currentUser.role === role ? 'text-[#c5a059] bg-amber-50' : 'text-slate-600'}`}
                >
                  {role}
                  {currentUser.role === role && <div className="w-1.5 h-1.5 rounded-full bg-[#c5a059]"></div>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
