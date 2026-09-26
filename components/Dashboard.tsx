import React from 'react';
import { Lead, LeadStatus, Notification, User, AgendaEvent, NavigationState } from '../types';
interface DashboardProps {
  leads: Lead[]; tasks: any[]; notifications: Notification[]; currentUser: User;
  agendaEvents?: AgendaEvent[]; onNavigate?: (view: NavigationState['view']) => void; onCreate?: () => void;
}
const Arrow = () => <span aria-hidden="true">↗</span>;
export default function Dashboard({leads,currentUser,agendaEvents=[],onNavigate,onCreate}:DashboardProps) {
  const active = leads.filter(l => !l.inQueue && l.status!==LeadStatus.WON && l.status!==LeadStatus.LOST);
  const clients = leads.filter(l => l.status===LeadStatus.WON);
  const queued = leads.filter(l => l.inQueue && l.status!==LeadStatus.LOST && l.status!==LeadStatus.WON);
  const upcoming = agendaEvents.filter(e => e.assignedToId===currentUser.id && new Date(e.end).getTime()>=Date.now()).sort((a,b)=>new Date(a.start).getTime()-new Date(b.start).getTime()).slice(0,3);
  const stages = [
    {label:'Em qualificação', count:queued.length, color:'#879caa'},
    {label:'Em relacionamento',count:active.filter(l=>!['ph-prop','ph-nego'].includes(l.phaseId)).length,color:'#6c9490'},
    {label:'Proposta e negociação',count:active.filter(l=>['ph-prop','ph-nego'].includes(l.phaseId)).length,color:'#ba965c'},
    {label:'Clientes conquistados',count:clients.length,color:'#193b40'},
  ];
  const max = Math.max(1,...stages.map(s=>s.count));
  return <div className="overview">
    <div className="page-heading"><div><p className="eyebrow">VISÃO GERAL</p><h1>Seu próximo negócio começa aqui<span>.</span></h1><p>Olá, {currentUser.name.split(' ')[0]}. Um lugar para cuidar de cada relacionamento.</p></div><time className="date-chip">{new Date().toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'})}</time></div>
    <section className="overview-hero" aria-label="Central de relacionamento"><div className="hero-copy"><span className="hero-kicker"><span className="gold-dot"/> INTELIGÊNCIA COMERCIAL CIATOS</span><h2>Mais conexões.<br/><em>Novas possibilidades.</em></h2><p>Organize sua carteira, acompanhe as cadências e entre na conversa quando sua atenção fizer a diferença.</p><div className="hero-actions"><button className="btn-gold" onClick={()=>onNavigate?.('ai_center')}>Abrir Central da IA <Arrow/></button><button className="hero-link" onClick={()=>onNavigate?.('customers')}>Ver clientes do grupo →</button></div></div><div className="hero-journey" aria-label="Etapas do relacionamento"><div className="journey-line"/>{[['01','Conhecer','Clientes e suas necessidades'],['02','Conectar','Oportunidades entre serviços'],['03','Conversar','Sua experiência no momento certo']].map(([n,title,sub])=><div className="journey-step" key={n}><span>{n}</span><div><strong>{title}</strong><p>{sub}</p></div></div>)}</div></section>
    <div className="overview-metrics">{[
      {label:'Relacionamentos na base',value:leads.length,note:'Todos os contatos cadastrados',view:'qualification',symbol:'◎'},
      {label:'Clientes do grupo',value:clients.length,note:'Negócios marcados como ganhos',view:'customers',symbol:'◇'},
      {label:'Oportunidades abertas',value:active.length,note:'No pipeline comercial',view:'kanban',symbol:'↗'},
      {label:'Aguardando qualificação',value:queued.length,note:'Contatos na fila de entrada',view:'qualification',symbol:'≋'},
    ].map(m=><button key={m.label} className="metric-card" onClick={()=>onNavigate?.(m.view as NavigationState['view'])}><div><span>{m.label}</span><i aria-hidden="true">{m.symbol}</i></div><strong>{m.value.toLocaleString('pt-BR')}</strong><p>{m.note} <span aria-hidden="true">→</span></p></button>)}</div>
    <div className="overview-grid"><section className="surface pipeline-summary"><div className="section-title"><div><p className="eyebrow">DO PRIMEIRO CONTATO À PARCERIA</p><h2>Relacionamentos em movimento</h2></div><button className="text-action" onClick={()=>onNavigate?.('kanban')}>Ver pipeline <Arrow/></button></div><p className="section-description">Distribuição atual da sua base. Cada etapa, uma próxima ação.</p><div className="stage-list">{stages.map((s,i)=><div className="stage-row" key={s.label}><span className="stage-number">0{i+1}</span><span>{s.label}</span><div className="stage-track"><div style={{width:`${s.count/max*100}%`,background:s.color}}/></div><strong>{s.count}</strong></div>)}</div>{leads.length===0 && <div className="inline-empty"><span>Comece pelo primeiro relacionamento.</span><button onClick={onCreate}>Cadastrar lead →</button></div>}</section>
    <section className="surface attention-card"><span className="attention-symbol" aria-hidden="true">✦</span><p className="eyebrow">SUA EXPERIÊNCIA FAZ A DIFERENÇA</p><h2>Precisa de você</h2><p>Acompanhe os contatos encaminhados para atendimento e as decisões que merecem seu olhar.</p><button className="btn-navy" onClick={()=>onNavigate?.('ai_center')}>Ver fila de atendimento <Arrow/></button><small>A fila também reúne exceções e revisões, além de oportunidades.</small></section></div>
    <div className="overview-grid bottom-grid"><section className="surface"><div className="section-title"><div><p className="eyebrow">CONTINUIDADE NO RELACIONAMENTO</p><h2>Seus próximos encontros</h2></div><button className="text-action" onClick={()=>onNavigate?.('agenda')}>Abrir agenda <Arrow/></button></div>{upcoming.length ? <div className="meeting-list">{upcoming.map(e=><button key={e.id} onClick={()=>onNavigate?.('agenda')}><span>{new Date(e.start).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}</span><div><strong>{e.title}</strong><small>{new Date(e.start).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</small></div><Arrow/></button>)}</div> : <div className="agenda-empty"><span className="empty-calendar" aria-hidden="true">▦</span><div><h3>Espaço para boas conversas</h3><p>Nenhum compromisso futuro na sua agenda.</p><button className="text-action" onClick={()=>onNavigate?.('agenda')}>Organizar minha agenda →</button></div></div>}</section>
    <section className="surface ecosystem-card"><p className="eyebrow">UM GRUPO. MÚLTIPLAS POSSIBILIDADES.</p><h2>Conexões dentro de casa</h2><p>Conheça a carteira antes de planejar a próxima oferta.</p><div className="service-tags">{['Contabilidade','Jurídico','Consultoria','Ciatos Bank','Racionaliza','CiatosLog','Cafeworking'].map(name=><span key={name}>{name}</span>)}</div><button className="text-action" onClick={()=>onNavigate?.('customers')}>Explorar clientes ativos <Arrow/></button></section></div>
    <footer className="overview-footer"><span>CIATOS · RELACIONAMENTOS & NEGÓCIOS</span><span>Crescimento começa com bons relacionamentos.</span></footer>
  </div>;
}
