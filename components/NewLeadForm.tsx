import React, {useState,useRef,useEffect} from 'react';
import {Lead,SystemConfig,User,LeadPartner,CompanySize} from '../types';
import {useDialog} from '../lib/useDialog';
interface NewLeadFormProps {config:SystemConfig;onSave:(lead:any)=>Promise<{success:boolean;message:string}>;onCancel:()=>void;currentUser:User;initialData?:Partial<Lead>;}
export default function NewLeadForm({config,onSave,onCancel,initialData}:NewLeadFormProps){
  const isEditMode=!!initialData?.id;
  const [isSubmitting,setIsSubmitting]=useState(false);
  const [step,setStep]=useState(0);
  const [error,setError]=useState('');
  const [confirmLeave,setConfirmLeave]=useState(false);
  const [form, setForm] = useState({
    id: initialData?.id || '',
    legalName: initialData?.legalName || '',
    cnpj: initialData?.cnpj || '',
    tradeName: initialData?.tradeName || initialData?.company || '',
    segment: initialData?.segment || '',
    website: initialData?.website || initialData?.linkedinCompany || '',
    companyPhone: initialData?.companyPhone || '',
    address: initialData?.address || initialData?.location || '',
    city: initialData?.city || '',
    state: initialData?.state || '',
    
    taxRegime: initialData?.taxRegime || config.taxRegimes[0] || 'Simples Nacional',
    size: initialData?.size || (config.companySizes[0] as CompanySize) || CompanySize.ME,
    payrollValue: initialData?.payrollValue || '',
    monthlyRevenue: initialData?.monthlyRevenue || '',
    annualRevenue: initialData?.annualRevenue || '',
    debtStatus: initialData?.debtStatus || 'Regular',

    detailedPartners: initialData?.detailedPartners || [] as LeadPartner[],

    name: initialData?.name || '', 
    phone: initialData?.phone || '',
    role: initialData?.role || '',
    email: initialData?.email || '',
    notes: initialData?.notes || '',
    strategicPains: initialData?.strategicPains || '',
    expectations: initialData?.expectations || '',
    closeProbability: initialData?.closeProbability || 1
  });


  const initial=useRef(JSON.stringify(form));
  const dirty=JSON.stringify(form)!==initial.current;
  const formRef=useRef<HTMLFormElement>(null);
  const requestClose=()=>{if(isSubmitting)return;if(dirty)setConfirmLeave(true);else onCancel();};
  const dialogRef=useDialog(()=>{if(confirmLeave)setConfirmLeave(false);else requestClose();});
  useEffect(()=>{const fn=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',fn);return()=>window.removeEventListener('beforeunload',fn);},[dirty]);
  useEffect(()=>{formRef.current?.scrollTo({top:0});},[step]);
  function advance(){if(formRef.current?.reportValidity()){setError('');setStep(s=>s+1);}}
  async function submit(e:React.FormEvent){
    e.preventDefault();if(isSubmitting)return;
    if(step===0){advance();return;}
    if(!form.legalName.trim()||!form.cnpj.trim()||!form.name.trim()||!form.phone.trim()){setError('Preencha a empresa, o CNPJ, o contato e o telefone.');return;}
    setIsSubmitting(true);setError('');
    try{
      const result=await onSave({...form,legalName:form.legalName.trim(),name:form.name.trim(),email:form.email.trim(),company:form.tradeName.trim()||form.legalName.trim(),cnpjRaw:form.cnpj.replace(/\D/g,'')});
      if(result.success)onCancel();else setError(/duplicate|unique|já existe/i.test(result.message)?'Já existe um cadastro com este CNPJ. Cancele e procure a empresa na busca do topo.':result.message||'Não foi possível salvar. Revise os dados e tente novamente.');
    }catch{setError('Não foi possível salvar. Seus dados continuam aqui; confira a conexão e tente novamente.');}
    finally{setIsSubmitting(false);}
  }
  const field=(name:keyof typeof form,label:string,required=false,type='text',placeholder='')=><label className="ux-field" key={name} htmlFor={`lead-${name}`}><span>{label}{required?' *':''}</span><input id={`lead-${name}`} type={type} required={required} disabled={isSubmitting||(name==='cnpj'&&isEditMode)} value={String(form[name])} onChange={e=>setForm({...form,[name]:e.target.value})} placeholder={placeholder}/></label>;
  return <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="lead-title" className="lead-dialog">
    <div className="lead-dialog-header"><div><p className="eyebrow">UM NOVO RELACIONAMENTO</p><h1 id="lead-title">{isEditMode?'Editar lead':'Cadastrar lead'}</h1><p>Comece pelo essencial. Você pode complementar depois.</p></div><button type="button" aria-label="Fechar cadastro" onClick={requestClose} disabled={isSubmitting} className="ux-close">✕</button></div>
    <ol className="lead-steps" aria-label="Etapas do cadastro">{['Empresa','Contato','Complementos (opcional)'].map((name,i)=><li key={name} aria-current={step===i?'step':undefined}><span>{i+1}</span>{name}</li>)}</ol>
    {confirmLeave && <div role="alertdialog" aria-label="Sair sem salvar?" className="leave-prompt"><strong>Sair sem salvar?</strong><p>O que você preencheu neste cadastro será descartado.</p><div><button type="button" className="btn-navy" onClick={()=>setConfirmLeave(false)}>Continuar cadastro</button><button type="button" className="ux-secondary" onClick={onCancel}>Sair sem salvar</button></div></div>}
    <form ref={formRef} id="lead-form" onSubmit={submit} className="lead-dialog-body" aria-busy={isSubmitting} inert={confirmLeave||isSubmitting}>
      {step===0 && <section><h2>Qual empresa você quer cadastrar?</h2><p className="ux-hint">Os campos com * são obrigatórios.</p><div className="ux-fields">{field('legalName','Razão social',true,'text','Nome registrado da empresa')}{field('cnpj','CNPJ',true,'text','00.000.000/0000-00')}{field('tradeName','Nome fantasia')}{field('segment','Segmento',false,'text','Ex.: comércio, indústria ou serviços')}</div></section>}
      {step===1 && <section><h2>Com quem vamos conversar?</h2><p className="ux-hint">Cadastre o contato profissional. Salvar não envia mensagens.</p><div className="ux-fields">{field('name','Nome do contato',true)}{field('phone','Telefone / WhatsApp',true,'tel','(00) 90000-0000')}{field('email','E-mail profissional',false,'email','contato@empresa.com.br')}{field('role','Cargo')}</div><div className="ux-next">Depois de salvar, o lead entra na <strong>Fila de Qualificação</strong>. Lá você pode revisar o cadastro e encaminhá-lo ao pipeline.</div></section>}
      {step===2 && <><section><h2>Contexto para o relacionamento</h2><p className="ux-hint">Preencha apenas o que já sabe. Estes campos são opcionais.</p><div className="ux-fields">{field('website','Website / LinkedIn')}{field('companyPhone','Telefone da empresa',false,'tel')}{field('address','Endereço')}{field('city','Cidade')}{field('state','UF')}<label className="ux-field"><span>Regime tributário</span><select value={form.taxRegime} onChange={e=>setForm({...form,taxRegime:e.target.value})}>{config.taxRegimes.map(v=><option key={v}>{v}</option>)}</select></label><label className="ux-field"><span>Porte</span><select value={form.size} onChange={e=>setForm({...form,size:e.target.value as CompanySize})}>{config.companySizes.map(v=><option key={v}>{v}</option>)}</select></label><label className="ux-field"><span>Situação de dívidas</span><select value={form.debtStatus} onChange={e=>setForm({...form,debtStatus:e.target.value})}><option value="Regular">Sem pendências informadas</option><option value="Possui Pendências">Possui pendências informadas</option></select></label>{field('payrollValue','Folha mensal (R$)')}{field('monthlyRevenue','Faturamento mensal (R$)')}{field('annualRevenue','Faturamento anual (R$)')}</div></section><section className="ux-fields">{(['strategicPains','expectations','notes'] as const).map((key,i)=><label className="ux-field" key={key}><span>{['Necessidades identificadas','Expectativas do contato','Observações comerciais'][i]}</span><textarea rows={3} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>)}</section><details><summary>Sócios (opcional)</summary>{form.detailedPartners.map((partner,index)=><div className="ux-partner" key={index}>{(['name','cpf','sharePercentage'] as const).map((key,i)=><label className="ux-field" key={key}><span>{['Nome do sócio','CPF','Participação (%)'][i]}</span><input value={partner[key]||''} onChange={e=>setForm({...form,detailedPartners:form.detailedPartners.map((p,j)=>j===index?{...p,[key]:e.target.value}:p)})}/></label>)}<button type="button" aria-label={`Remover sócio ${index+1}`} onClick={()=>setForm({...form,detailedPartners:form.detailedPartners.filter((_,i)=>i!==index)})}>Remover</button></div>)}<button type="button" className="ux-secondary" onClick={()=>setForm({...form,detailedPartners:[...form.detailedPartners,{name:'',cpf:'',sharePercentage:''}]})}>Adicionar sócio</button></details></>}
    </form>
    {error && <p role="alert" className="ux-error">{error}</p>}
    <div className="lead-dialog-footer" inert={confirmLeave}><button type="button" disabled={isSubmitting} className="ux-secondary" onClick={requestClose}>Cancelar</button><div>{step>0&&<button type="button" disabled={isSubmitting} className="ux-secondary" onClick={()=>{setStep(s=>s-1);setError('');}}>Voltar</button>}{step===1&&<button type="button" disabled={isSubmitting} className="ux-secondary" onClick={advance}>Complementar dados</button>}<button type="submit" form="lead-form" disabled={isSubmitting} className="btn-navy">{isSubmitting?'Salvando…':step===0?'Continuar →':isEditMode?'Salvar alterações':'Salvar lead'}</button></div></div>
  </div>;
}
