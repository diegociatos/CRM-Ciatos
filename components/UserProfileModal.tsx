
import React, { useState } from 'react';
import { User, Department } from '../types';

interface UserProfileModalProps {
  user: User;
  onSave: (updatedUser: User) => void;
  onClose: () => void;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({ user, onSave, onClose }) => {
  const [formData, setFormData] = useState<User>({ ...user });
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword && newPassword !== confirmPassword) {
      alert("As senhas não coincidem.");
      return;
    }

    const updatedUser = {
      ...formData,
      password: newPassword || formData.password
    };

    onSave(updatedUser);
    onClose();
    alert("Perfil atualizado com sucesso!");
  };

  const labelClass = "text-[10px] font-black text-[#c5a059] uppercase tracking-widest block mb-2";
  const inputClass = "w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-[#c5a059] transition-all";

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-[#0a192f]/90 backdrop-blur-md">
      <div className="bg-white w-full max-w-2xl rounded-[4rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
        <div className="p-10 bg-[#0a192f] text-white border-b-8 border-[#c5a059] flex justify-between items-center">
          <div>
            <h2 className="serif-authority text-3xl font-bold tracking-tight">Meu Perfil</h2>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Central de Identidade Ciatos</p>
          </div>
          <button onClick={onClose} className="text-3xl hover:rotate-90 transition-transform">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-10 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <div className="flex flex-col items-center gap-6 mb-10">
            <div className="relative group">
              <div className="w-24 h-24 bg-[#0a192f] rounded-[2rem] border-4 border-slate-50 shadow-2xl flex items-center justify-center overflow-hidden">
                {formData.avatar && !formData.avatar.includes('ui-avatars') ? (
                  <img src={formData.avatar} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl font-black text-[#c5a059]">
                    {formData.name.charAt(0)}
                  </span>
                )}
              </div>
              <div className="absolute inset-0 bg-black/40 rounded-[2rem] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                <span className="text-[8px] text-white font-black uppercase">Alterar Foto</span>
              </div>
            </div>
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">{formData.role}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className={labelClass}>Nome Completo</label>
              <input required className={inputClass} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
            <div>
              <label className={labelClass}>E-mail de Login</label>
              <input required type="email" className={inputClass} value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
            </div>
            <div>
              <label className={labelClass}>URL da Foto (Avatar)</label>
              <input className={inputClass} value={formData.avatar} onChange={e => setFormData({...formData, avatar: e.target.value})} placeholder="https://..." />
            </div>
          </div>

          <div className="pt-8 border-t border-slate-100">
            <h3 className="text-sm font-black text-[#0a192f] uppercase tracking-[0.3em] mb-6">Segurança e Credenciais</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className={labelClass}>Nova Senha</label>
                <input type="password" className={inputClass} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Deixe em branco para não alterar" />
              </div>
              <div>
                <label className={labelClass}>Confirmar Nova Senha</label>
                <input type="password" className={inputClass} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="pt-10 flex gap-4">
            <button type="submit" className="flex-1 py-5 bg-[#0a192f] text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl border-b-4 border-[#c5a059] active:translate-y-1 transition-all">
              Salvar Alterações
            </button>
            <button type="button" onClick={onClose} className="px-10 py-5 bg-white border-2 border-slate-100 text-slate-400 rounded-2xl font-black uppercase text-xs">Descartar</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserProfileModal;
