
import React, { useState, useMemo } from 'react';
import { User, UserRole, ManagerType, Lead } from '../types';

interface UserManagementProps {
  users: User[];
  managerTypes: ManagerType[];
  leads: Lead[];
  onSaveUser: (user: User) => void;
  onDeleteUser: (id: string) => void;
  onSaveManagerType: (type: ManagerType) => void;
  onDeleteManagerType: (id: string) => void;
  onUpdateLead: (lead: Lead) => void;
}

const UserManagement: React.FC<UserManagementProps> = ({ 
  users, managerTypes, leads, onSaveUser, onDeleteUser, onSaveManagerType, onDeleteManagerType, onUpdateLead 
}) => {
  const [activeTab, setActiveTab] = useState<'users' | 'types' | 'operational'>('users');
  const [searchTerm, setSearchTerm] = useState('');
  const [showUserModal, setShowUserModal] = useState(false);
  const [showTypeModal, setShowTypeModal] = useState(false);

  const [editingUser, setEditingUser] = useState<Partial<User> | null>(null);
  const [editingType, setEditingType] = useState<Partial<ManagerType> | null>(null);

  const filteredUsers = useMemo(() => {
    return users.filter(u => 
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      u.email.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [users, searchTerm]);

  const strategicLeads = useMemo(() => {
    return leads.filter(l => l.size === 'Grande' || l.status === 'Em Negociação');
  }, [leads]);

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser?.name || !editingUser?.email) return;
    const user = {
      ...editingUser,
      id: editingUser.id || `user-${Date.now()}`,
      avatar: editingUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(editingUser.name)}&background=0a192f&color=c5a059`
    } as User;
    onSaveUser(user);
    setShowUserModal(false);
  };

  const handleSaveType = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingType?.name) return;
    const type = {
      ...editingType,
      id: editingType.id || `type-${Date.now()}`,
      color: editingType.color || '#c5a059'
    } as ManagerType;
    onSaveManagerType(type);
    setShowTypeModal(false);
  };

  const handleAssignLead = (leadId: string, userId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (lead) {
      onUpdateLead({ ...lead, ownerId: userId });
    }
  };

  const inputClass = "w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold outline-none focus:border-[#c5a059] transition-all";
  const labelClass = "text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2";

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="flex justify-between items-center bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm">
        <div>
          <h1 className="text-4xl font-black text-[#0a192f] serif-authority">Gestão de Equipes</h1>
          <p className="text-slate-500 text-lg font-medium mt-2">Controle de acessos e braços operacionais.</p>
        </div>
        <div className="flex bg-slate-100 p-1.5 rounded-[1.8rem] shadow-inner">
          {(['users', 'types', 'operational'] as const).map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-white text-[#0a192f] shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {tab === 'users' ? '👤 Usuários' : tab === 'types' ? '🏷️ Gestores' : '💼 Alocação'}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'users' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
             <input 
               type="text" 
               placeholder="Buscar usuários..." 
               className="w-96 bg-white border border-slate-200 rounded-2xl px-6 py-3.5 text-sm font-bold outline-none shadow-sm"
               value={searchTerm}
               onChange={e => setSearchTerm(e.target.value)}
             />
             <button 
               onClick={() => { setEditingUser({ role: UserRole.OPERATIONAL }); setShowUserModal(true); }}
               className="bg-[#0a192f] text-white px-10 py-4 rounded-[1.5rem] font-black uppercase text-xs tracking-widest shadow-2xl border-b-4 border-[#c5a059] hover:scale-105 active:scale-95 transition-all"
             >
               + Adicionar Usuário
             </button>
          </div>

          <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden">
             <table className="w-full text-left">
                <thead className="bg-slate-50/50 border-b border-slate-100">
                   <tr>
                      <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Membro</th>
                      <th className="px-6 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Perfil</th>
                      <th className="px-6 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Gestor Atribuído</th>
                      <th className="px-10 py-6 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Ações</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                   {filteredUsers.map(user => (
                     <tr key={user.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-10 py-6 flex items-center gap-4">
                           <img src={user.avatar} className="w-12 h-12 rounded-2xl border-2 border-white shadow-md" />
                           <div>
                              <p className="font-bold text-[#0a192f] text-sm serif-authority">{user.name}</p>
                              <p className="text-[11px] text-slate-400">{user.email}</p>
                           </div>
                        </td>
                        <td className="px-6 py-6">
                           <span className="px-3 py-1 bg-slate-100 rounded-lg text-[9px] font-black uppercase text-slate-600 border border-slate-200">{user.role}</span>
                        </td>
                        <td className="px-6 py-6">
                           {user.managerTypeId ? (
                             <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: managerTypes.find(t => t.id === user.managerTypeId)?.color }}></div>
                                <span className="text-xs font-bold text-[#0a192f]">{managerTypes.find(t => t.id === user.managerTypeId)?.name}</span>
                             </div>
                           ) : <span className="text-xs italic text-slate-300">Nenhum</span>}
                        </td>
                        <td className="px-10 py-6 text-right">
                           <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => { setEditingUser(user); setShowUserModal(true); }} className="p-3 bg-slate-100 text-[#0a192f] rounded-xl hover:bg-slate-200 transition-all">✏️</button>
                              <button onClick={() => onDeleteUser(user.id)} className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-all">🗑️</button>
                           </div>
                        </td>
                     </tr>
                   ))}
                </tbody>
             </table>
          </div>
        </div>
      )}

      {activeTab === 'types' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
           <div 
             onClick={() => { setEditingType({ color: '#c5a059' }); setShowTypeModal(true); }}
             className="bg-slate-50 border-4 border-dashed border-slate-200 rounded-[3rem] flex flex-col items-center justify-center p-12 hover:border-[#c5a059] transition-all cursor-pointer group"
           >
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-3xl shadow-xl group-hover:scale-110 transition-transform">🏷️</div>
              <p className="text-sm font-black text-slate-400 uppercase tracking-widest mt-6">Novo Tipo de Gestor</p>
           </div>
           
           {managerTypes.map(type => (
             <div key={type.id} className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col justify-between hover:shadow-xl transition-all relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 opacity-10 blur-3xl rounded-full" style={{ backgroundColor: type.color }}></div>
                <div>
                   <div className="w-12 h-12 rounded-2xl shadow-inner mb-6" style={{ backgroundColor: type.color }}></div>
                   <h3 className="text-2xl font-bold text-[#0a192f] serif-authority">{type.name}</h3>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">
                     {users.filter(u => u.managerTypeId === type.id).length} Usuários Vinculados
                   </p>
                </div>
                <div className="mt-10 flex gap-3 pt-6 border-t border-slate-50">
                   <button onClick={() => { setEditingType(type); setShowTypeModal(true); }} className="flex-1 py-3 bg-slate-50 text-[10px] font-black uppercase text-slate-500 rounded-xl hover:bg-[#0a192f] hover:text-white transition-all">Editar</button>
                   <button onClick={() => onDeleteManagerType(type.id)} className="px-4 py-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-all">🗑️</button>
                </div>
             </div>
           ))}
        </div>
      )}

      {activeTab === 'operational' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
           <div className="lg:col-span-3 space-y-6">
              <h3 className="text-xl font-black text-[#0a192f] serif-authority">Leads Estratégicos p/ Alocação</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {strategicLeads.map(lead => (
                   <div key={lead.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col gap-6 hover:border-[#c5a059] transition-all">
                      <div>
                         <h4 className="font-bold text-[#0a192f] text-lg serif-authority">{lead.tradeName}</h4>
                         <p className="text-[10px] text-slate-400 uppercase font-bold mt-1">Ticket: {lead.annualRevenue}</p>
                      </div>
                      <div className="space-y-3">
                         <label className={labelClass}>Vincular Gestor Responsável</label>
                         <select 
                           className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold"
                           value={lead.ownerId}
                           onChange={e => handleAssignLead(lead.id, e.target.value)}
                         >
                            <option value="">Não Alocado</option>
                            {users.map(u => (
                              <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                            ))}
                         </select>
                      </div>
                   </div>
                 ))}
              </div>
           </div>
           <div className="bg-[#0a192f] p-10 rounded-[3rem] text-white shadow-2xl h-fit">
              <h4 className="text-xs font-black text-[#c5a059] uppercase tracking-[0.3em] mb-8">Status da Operação</h4>
              <div className="space-y-10">
                 <div>
                    <p className="text-4xl font-black serif-authority mb-1">{strategicLeads.filter(l => !!l.ownerId).length}</p>
                    <p className="text-[10px] font-black text-slate-400 uppercase">Leads Atendidos</p>
                 </div>
                 <div>
                    <p className="text-4xl font-black serif-authority mb-1">{strategicLeads.filter(l => !l.ownerId).length}</p>
                    <p className="text-[10px] font-black text-slate-400 uppercase">Aguardando Alocação</p>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* MODAIS */}
      {showUserModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#0a192f]/95 backdrop-blur-md" onClick={() => setShowUserModal(false)}></div>
          <form onSubmit={handleSaveUser} className="relative bg-white w-full max-w-2xl rounded-[4rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
             <div className="p-12 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                <h2 className="text-3xl font-black text-[#0a192f] serif-authority">Dados do Usuário</h2>
                <button type="button" onClick={() => setShowUserModal(false)} className="text-3xl text-slate-300">✕</button>
             </div>
             <div className="p-12 space-y-6">
                <div>
                   <label className={labelClass}>Nome Completo</label>
                   <input required className={inputClass} value={editingUser?.name || ''} onChange={e => setEditingUser({...editingUser, name: e.target.value})} />
                </div>
                <div>
                   <label className={labelClass}>E-mail Corporativo</label>
                   <input required type="email" className={inputClass} value={editingUser?.email || ''} onChange={e => setEditingUser({...editingUser, email: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <div>
                      <label className={labelClass}>Perfil</label>
                      <select className={inputClass} value={editingUser?.role} onChange={e => setEditingUser({...editingUser, role: e.target.value as UserRole})}>
                         {Object.values(UserRole).map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                   </div>
                   <div>
                      <label className={labelClass}>Braço Operacional</label>
                      <select className={inputClass} value={editingUser?.managerTypeId || ''} onChange={e => setEditingUser({...editingUser, managerTypeId: e.target.value})}>
                         <option value="">Nenhum / Governança</option>
                         {managerTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                   </div>
                </div>
             </div>
             <div className="p-12 border-t bg-slate-50">
                <button type="submit" className="w-full py-6 bg-[#0a192f] text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-2xl border-b-4 border-[#c5a059]">Salvar Membro</button>
             </div>
          </form>
        </div>
      )}

      {showTypeModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#0a192f]/95 backdrop-blur-md" onClick={() => setShowTypeModal(false)}></div>
          <form onSubmit={handleSaveType} className="relative bg-white w-full max-w-lg rounded-[4rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
             <div className="p-12 bg-slate-50 border-b border-slate-100">
                <h2 className="text-3xl font-black text-[#0a192f] serif-authority">Configurar Gestor</h2>
             </div>
             <div className="p-12 space-y-8">
                <div>
                   <label className={labelClass}>Nome do Grupo</label>
                   <input required className={inputClass} value={editingType?.name || ''} onChange={e => setEditingType({...editingType, name: e.target.value})} />
                </div>
                <div>
                   <label className={labelClass}>Identidade Visual</label>
                   <input type="color" className="w-full h-16 rounded-2xl cursor-pointer" value={editingType?.color || '#c5a059'} onChange={e => setEditingType({...editingType, color: e.target.value})} />
                </div>
             </div>
             <div className="p-12 border-t bg-slate-50">
                <button type="submit" className="w-full py-6 bg-[#0a192f] text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-2xl border-b-4 border-[#c5a059]">Salvar Grupo</button>
             </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
