
import React, { useState } from 'react';
import { User, UserRole, Department } from '../types';

interface UserManagementViewProps {
  users: User[];
  onAddUser: (user: User) => void;
  onDeleteUser: (id: string) => void;
  currentUser: User;
}

const UserManagementView: React.FC<UserManagementViewProps> = ({ users, onAddUser, onDeleteUser, currentUser }) => {
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<Partial<User>>({
    role: UserRole.SDR,
    department: 'Comercial'
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) return;

    // Novas identidades recebem, por e-mail, um link para criar a própria senha.
    const newUser: User = {
      id: '',
      name: formData.name,
      email: formData.email.trim().toLowerCase(),
      role: formData.role as UserRole,
      department: formData.department as Department,
    };

    onAddUser(newUser);
    setFormData({ role: UserRole.SDR, department: 'Comercial' });
    setShowModal(false);
  };

  const labelClass = "text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5";
  const inputClass = "w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-[#c5a059] transition-all";

  return (
    <div className="users-workspace space-y-7 animate-in fade-in duration-500">
      <div className="flex flex-wrap gap-4 justify-between items-end border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-[#0a192f] mb-2 serif-authority tracking-tight">Gestão de usuários</h1>
          <p className="text-slate-600">Veja quem trabalha nesta empresa e administre os acessos da equipe.</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-[#0a192f] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#173744] transition-all"
        >
          + Adicionar membro
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full min-w-[650px] text-left border-collapse">
          <thead className="bg-slate-50/50 border-b border-slate-100">
            <tr>
              <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Membro</th>
              <th className="px-6 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Perfil / Acesso</th>
              <th className="px-6 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Departamento</th>
              <th className="px-10 py-6 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {users.map(user => (
              <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-10 py-6 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl border-2 border-white shadow-md bg-[#0a192f] flex items-center justify-center text-[#c5a059] font-black text-xs">
                    {user.avatar && !user.avatar.includes('ui-avatars') ? (
                      <img src={user.avatar} className="w-full h-full rounded-2xl object-cover" />
                    ) : user.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <p className="font-bold text-[#0a192f] text-sm serif-authority">{user.name}</p>
                    <p className="text-[11px] text-slate-400">{user.email}</p>
                  </div>
                </td>
                <td className="px-6 py-6">
                  <span className="px-3 py-1 bg-amber-50 text-[#c5a059] rounded-lg text-[9px] font-black uppercase border border-amber-100">{user.role}</span>
                </td>
                <td className="px-6 py-6">
                  <span className="text-xs font-bold text-slate-600">{user.department}</span>
                </td>
                <td className="px-10 py-6 text-right">
                  {user.id !== currentUser.id && (
                    <button 
                      onClick={() => { if(confirm('Excluir este usuário?')) onDeleteUser(user.id); }}
                      className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#0a192f]/90 backdrop-blur-md" onClick={() => setShowModal(false)}></div>
          <form onSubmit={handleSubmit} className="relative bg-white w-full max-w-xl rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-10 bg-slate-50 border-b border-slate-100">
               <h2 className="text-3xl font-black text-[#0a192f] serif-authority tracking-tight">Novo Colaborador</h2>
               <p className="text-slate-500 font-medium mt-1">Novas contas recebem um e-mail com link para criar a própria senha antes de acessar o CRM. Contas existentes mantêm sua senha.</p>
            </div>
            
            <div className="p-10 space-y-6">
               <div>
                  <label className={labelClass}>Nome Completo *</label>
                  <input required className={inputClass} value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Ex: Arnaldo Souza" />
               </div>
               <div>
                  <label className={labelClass}>E-mail de Login *</label>
                  <input required type="email" className={inputClass} value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="usuario@ciatos.com.br" />
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <div>
                     <label className={labelClass}>Perfil de Acesso</label>
                     <select className={inputClass} value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as UserRole})}>
                        {Object.values(UserRole).map(r => <option key={r} value={r}>{r}</option>)}
                     </select>
                  </div>
                  <div>
                     <label className={labelClass}>Departamento</label>
                     <select className={inputClass} value={formData.department} onChange={e => setFormData({...formData, department: e.target.value as Department})}>
                        <option>Comercial</option>
                        <option>Operacional</option>
                        <option>Marketing</option>
                        <option>Inteligência</option>
                     </select>
                  </div>
               </div>
            </div>

            <div className="p-10 border-t bg-slate-50 flex gap-4">
               <button type="submit" className="flex-1 py-4 bg-[#0a192f] text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl border-b-4 border-[#c5a059] active:translate-y-1 transition-all">
                 Criar Acesso
               </button>
               <button type="button" onClick={() => setShowModal(false)} className="px-8 py-4 bg-white border-2 border-slate-100 text-slate-400 rounded-2xl font-black uppercase text-xs">Cancelar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default UserManagementView;
