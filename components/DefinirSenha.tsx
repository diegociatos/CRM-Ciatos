import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

/** Tela aberta pelo link de convite / recuperação (evento PASSWORD_RECOVERY). */
const DefinirSenha: React.FC<{ onConcluido: () => void }> = ({ onConcluido }) => {
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const forte = senha.length >= 8 && /[a-z]/.test(senha) && /[A-Z]/.test(senha) && /\d/.test(senha);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    if (!forte) return setErro('Use pelo menos 8 caracteres, com maiúscula, minúscula e número.');
    if (senha !== confirma) return setErro('As senhas não coincidem.');
    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) return setErro(error.message);
    onConcluido();
  };

  const input = 'w-full bg-white/5 border-2 border-white/10 focus:border-[#c5a059] rounded-2xl px-5 py-4 text-white font-bold outline-none';

  return (
    <div className="min-h-screen bg-[#050a15] flex items-center justify-center p-6 font-serif">
      <form onSubmit={salvar} className="w-full max-w-md bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-10 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-white text-2xl font-bold">Crie sua senha</h1>
          <p className="text-slate-400 text-sm">Defina a senha de acesso ao CRM Ciatos.</p>
        </div>
        <input type="password" autoComplete="new-password" placeholder="Nova senha" className={input} value={senha} onChange={e => setSenha(e.target.value)} />
        <input type="password" autoComplete="new-password" placeholder="Confirme a senha" className={input} value={confirma} onChange={e => setConfirma(e.target.value)} />
        <p className={`text-[10px] font-bold uppercase tracking-widest ${forte ? 'text-emerald-400' : 'text-slate-500'}`}>Mínimo 8 caracteres · maiúscula · minúscula · número</p>
        {erro && <p className="text-red-400 text-xs font-bold">{erro}</p>}
        <button disabled={salvando} className="w-full bg-[#c5a059] text-[#0a192f] py-4 rounded-2xl font-black uppercase text-xs tracking-widest disabled:opacity-50">
          {salvando ? 'Salvando…' : 'Salvar e entrar'}
        </button>
      </form>
    </div>
  );
};

export default DefinirSenha;
