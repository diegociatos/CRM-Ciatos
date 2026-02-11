
import React, { useState } from 'react';
import { Task, Lead } from '../types';

interface TasksManagerProps {
  tasks: Task[];
  leads: Lead[];
  onAddTask: (task: Omit<Task, 'id'>) => void;
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
}

const TasksManager: React.FC<TasksManagerProps> = ({ tasks, leads, onAddTask, onToggleTask, onDeleteTask }) => {
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<Omit<Task, 'id' | 'completed'>>({
    title: '',
    description: '',
    dueDate: new Date().toISOString().split('T')[0],
    priority: 'Média',
    leadId: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title) return alert("Título é obrigatório.");
    
    onAddTask({ ...formData, completed: false });
    setFormData({ title: '', description: '', dueDate: new Date().toISOString().split('T')[0], priority: 'Média', leadId: '' });
    setShowModal(false);
  };

  const labelClass = "text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5";
  const inputClass = "w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-[#c5a059] transition-all";

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="flex justify-between items-end border-b border-slate-200 pb-8">
        <div>
          <h1 className="text-4xl font-black text-[#0a192f] mb-2 serif-authority tracking-tight">Agenda de Ações (CRM)</h1>
          <p className="text-slate-500 text-lg font-medium">Follow-ups e entregas táticas priorizadas.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-[#0a192f] text-white px-10 py-4 rounded-[1.8rem] font-black uppercase text-xs tracking-widest shadow-2xl border-b-4 border-[#c5a059] hover:scale-105 transition-all"
        >
          🚀 Nova Tarefa
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* COLUNA PENDENTES */}
        <div className="lg:col-span-2 space-y-6">
          <h3 className={labelClass}>Tarefas em Aberto</h3>
          {tasks.filter(t => !t.completed).length === 0 && (
            <div className="bg-white p-20 rounded-[3rem] border border-dashed border-slate-200 text-center opacity-30">
              <p className="serif-authority text-xl font-bold">Produtividade Máxima!</p>
              <p className="text-xs font-black uppercase mt-2">Nenhuma ação pendente no radar.</p>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4">
            {tasks.filter(t => !t.completed).map(task => (
              <div key={task.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex items-center gap-6 group hover:border-[#c5a059] transition-all">
                <button 
                  onClick={() => onToggleTask(task.id)}
                  className="w-10 h-10 rounded-full border-4 border-slate-50 flex items-center justify-center text-transparent hover:border-emerald-500 transition group-hover:scale-110"
                >
                  <span className="text-xs">✓</span>
                </button>
                <div className="flex-1">
                   <div className="flex justify-between items-start">
                      <h4 className="font-bold text-[#0a192f] text-sm serif-authority">{task.title}</h4>
                      <span className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest ${
                        task.priority === 'Alta' ? 'bg-red-50 text-red-600' :
                        task.priority === 'Média' ? 'bg-amber-50 text-amber-600' :
                        'bg-slate-100 text-slate-400'
                      }`}>
                        {task.priority}
                      </span>
                   </div>
                   <p className="text-[10px] text-slate-400 mt-1 line-clamp-1 italic">"{task.description}"</p>
                   <div className="mt-4 flex items-center gap-4">
                      <span className="text-[9px] font-black text-indigo-500 uppercase bg-indigo-50 px-2 py-0.5 rounded">📅 {task.dueDate}</span>
                      {task.leadId && (
                        <span className="text-[9px] font-black text-slate-400 uppercase">🏢 {leads.find(l => l.id === task.leadId)?.tradeName}</span>
                      )}
                   </div>
                </div>
                <button onClick={() => onDeleteTask(task.id)} className="p-3 text-slate-200 hover:text-red-500 transition-opacity opacity-0 group-hover:opacity-100">🗑️</button>
              </div>
            ))}
          </div>
        </div>

        {/* SIDEBAR CONCLUÍDAS */}
        <div className="bg-white rounded-[3.5rem] border border-slate-100 shadow-sm p-10 flex flex-col h-fit">
           <h3 className={labelClass}>Concluídas Recentemente</h3>
           <div className="space-y-4 mt-6">
              {tasks.filter(t => t.completed).slice(0, 5).map(task => (
                <div key={task.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-4 opacity-50">
                   <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center text-white text-[10px]">✓</div>
                   <span className="text-xs font-bold text-slate-500 line-through truncate">{task.title}</span>
                </div>
              ))}
              {tasks.filter(t => t.completed).length === 0 && (
                <p className="text-center text-[10px] text-slate-300 italic py-10">Nada por aqui.</p>
              )}
           </div>
        </div>
      </div>

      {/* MODAL NOVA TAREFA */}
      {showModal && (
        <div className="fixed inset-0 bg-[#0a192f]/90 backdrop-blur-md z-[2600] flex items-center justify-center p-4">
          <div className="bg-white rounded-[4rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-10 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <h2 className="text-2xl font-black text-[#0a192f] serif-authority">Lançar Ação CRM</h2>
              <button onClick={() => setShowModal(false)} className="text-2xl text-slate-300">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-10 space-y-6">
              <div>
                <label className={labelClass}>O que precisa ser feito? *</label>
                <input required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className={inputClass} placeholder="Ex: Retorno call de fechamento" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Prazo Fatal</label>
                  <input type="date" value={formData.dueDate} onChange={e => setFormData({...formData, dueDate: e.target.value})} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Prioridade</label>
                  <select value={formData.priority} onChange={e => setFormData({...formData, priority: e.target.value as any})} className={inputClass}>
                    <option>Alta</option>
                    <option>Média</option>
                    <option>Baixa</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={labelClass}>Vincular Lead (Opcional)</label>
                <select value={formData.leadId} onChange={e => setFormData({...formData, leadId: e.target.value})} className={inputClass}>
                  <option value="">Nenhum</option>
                  {leads.map(l => <option key={l.id} value={l.id}>{l.tradeName}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Breve descrição / Pauta</label>
                <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className={`${inputClass} h-24 resize-none`} placeholder="Detalhes adicionais..." />
              </div>
              <button type="submit" className="w-full py-5 bg-[#0a192f] text-white rounded-[1.8rem] font-black uppercase text-xs tracking-widest shadow-xl border-b-4 border-[#c5a059] active:translate-y-1 transition-all">Publicar Tarefa</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TasksManager;
