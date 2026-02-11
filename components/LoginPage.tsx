
import React, { useState } from 'react';
import { User, UserRole } from '../types';

interface LoginPageProps {
  onLogin: (email: string, password: string) => void;
  isLoading?: boolean;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin, isLoading }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState<{email?: string, password?: string}>({});

  const validate = () => {
    const newErrors: typeof errors = {};
    if (!email) newErrors.email = 'O e-mail é obrigatório';
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = 'E-mail inválido';
    
    if (!password) newErrors.password = 'A senha é obrigatória';
    else if (password.length < 3) newErrors.password = 'Senha muito curta';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onLogin(email, password);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#050a15] flex items-center justify-center p-6 relative overflow-hidden font-serif">
      {/* Elementos de Fundo Orgânicos */}
      <div className="absolute top-[-10%] left-[-5%] w-[600px] h-[600px] bg-[#c5a059]/10 rounded-full blur-[120px] animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] bg-indigo-900/20 rounded-full blur-[100px]"></div>
      
      <div className="relative z-10 w-full max-w-[480px] animate-in fade-in zoom-in-95 duration-700">
        {/* Cartão Glassmorphism */}
        <div className="bg-white/[0.03] backdrop-blur-3xl border border-white/10 rounded-[3.5rem] p-12 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#c5a059]/40 to-transparent"></div>
          
          {/* Logo e Títulos */}
          <div className="text-center mb-12">
            <div className="w-20 h-20 bg-[#c5a059] rounded-3xl mx-auto mb-8 flex items-center justify-center shadow-[0_0_30px_rgba(197,160,89,0.3)] border-4 border-white/5">
              <span className="text-white text-3xl font-black serif-authority">CI</span>
            </div>
            <h1 className="text-white text-3xl font-bold serif-authority tracking-tight mb-3">Bem-vindo ao Ecossistema Ciatos</h1>
            <p className="text-slate-400 text-sm font-medium">Acesse sua central de inteligência corporativa</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Campo E-mail */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-[#c5a059] uppercase tracking-[0.3em] ml-2">Identificação</label>
              <div className="relative group">
                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-[#c5a059] transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                </div>
                <input 
                  type="email"
                  placeholder="Seu e-mail corporativo"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if(errors.email) validate(); }}
                  className={`w-full bg-white/5 border-2 ${errors.email ? 'border-red-500/50 focus:border-red-500' : 'border-white/5 focus:border-[#c5a059]'} rounded-2xl pl-14 pr-6 py-4 text-white font-bold outline-none transition-all placeholder:text-slate-600 placeholder:font-medium`}
                />
              </div>
              {errors.email && <p className="text-red-400 text-[10px] font-bold uppercase tracking-widest ml-4">{errors.email}</p>}
            </div>

            {/* Campo Senha */}
            <div className="space-y-2">
              <div className="flex justify-between items-center ml-2">
                <label className="text-[10px] font-black text-[#c5a059] uppercase tracking-[0.3em]">Credencial</label>
                <button type="button" className="text-[9px] font-black text-slate-500 hover:text-white uppercase tracking-widest transition-all border-b border-transparent hover:border-white">Esqueci minha senha</button>
              </div>
              <div className="relative group">
                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-[#c5a059] transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                </div>
                <input 
                  type={showPassword ? "text" : "password"}
                  placeholder="Sua senha de acesso"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if(errors.password) validate(); }}
                  className={`w-full bg-white/5 border-2 ${errors.password ? 'border-red-500/50 focus:border-red-500' : 'border-white/5 focus:border-[#c5a059]'} rounded-2xl pl-14 pr-14 py-4 text-white font-bold outline-none transition-all placeholder:text-slate-600 placeholder:font-medium`}
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-[#c5a059] transition-colors"
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" /></svg>
                  )}
                </button>
              </div>
              {errors.password && <p className="text-red-400 text-[10px] font-bold uppercase tracking-widest ml-4">{errors.password}</p>}
            </div>

            {/* Lembrar de mim */}
            <label className="flex items-center gap-3 cursor-pointer group w-fit">
              <div className="relative">
                <input 
                  type="checkbox" 
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="sr-only" 
                />
                <div className={`w-5 h-5 rounded-md border-2 transition-all ${rememberMe ? 'bg-[#c5a059] border-[#c5a059]' : 'border-white/10 group-hover:border-white/30'}`}>
                  {rememberMe && <svg className="w-4 h-4 text-white mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </div>
              </div>
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest group-hover:text-slate-300 transition-colors">Lembrar de mim por 30 dias</span>
            </label>

            {/* Botão Login */}
            <button 
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-[#d4af37] via-[#c5a059] to-[#b8860b] text-[#0a192f] py-5 rounded-[1.8rem] font-black uppercase text-xs tracking-[0.3em] shadow-[0_10px_30px_rgba(197,160,89,0.2)] hover:shadow-[0_15px_40px_rgba(197,160,89,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-4 relative overflow-hidden group"
            >
              <div className="absolute inset-0 w-1/2 h-full bg-white/20 skew-x-[-30deg] -translate-x-full group-hover:translate-x-[300%] transition-transform duration-1000 ease-in-out"></div>
              {isLoading ? (
                <span className="w-5 h-5 border-2 border-[#0a192f]/30 border-t-[#0a192f] rounded-full animate-spin"></span>
              ) : (
                <>
                  <span>Autenticar Acesso</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </>
              )}
            </button>
          </form>

          {/* Rodapé de Segurança */}
          <div className="mt-12 pt-8 border-t border-white/5 text-center">
            <div className="flex items-center justify-center gap-2 text-[9px] font-black text-slate-600 uppercase tracking-widest">
              <svg className="w-3 h-3 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 4.908-3.367 9.126-8 10.111-4.633-.985-8-5.203-8-10.111 0-.68.056-1.35.166-2.001zm8 2a1 1 0 00-1 1v3a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
              Conexão segura e criptografada
            </div>
          </div>
        </div>

        {/* Branding secundário fora do card */}
        <p className="text-center mt-10 text-[10px] font-black text-slate-700 uppercase tracking-[0.5em]">
          Powered by Ciatos Intelligence Engine
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
