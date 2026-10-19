import React,{useEffect,useRef,useState} from 'react';
import {supabase} from '../lib/supabase';
import {useDialog} from '../lib/useDialog';
import {csvCell,ImportRow,leadFields,mapLeadHeaders,parseCsv,prepareRows} from '../lib/bulkLeads';
import {SystemConfig} from '../types';

function download(name:string,rows:string[][]){
 const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);
}
export default function BulkLeadImport({organizationId,companyName,config,onClose,onImported}:{organizationId:string;companyName:string;config:SystemConfig;onClose:()=>void;onImported:()=>Promise<void>}){
 const [text,setText]=useState(''),[table,setTable]=useState<string[][]>([]),[mapping,setMapping]=useState<Record<string,number>>({});
 const [rows,setRows]=useState<ImportRow[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState(0),[finished,setFinished]=useState(false);
 const [ready,setReady]=useState(false);
 const previewSection=useRef<HTMLElement>(null);
 useEffect(()=>{if(ready||finished)previewSection.current?.scrollIntoView({block:'start'});},[ready,finished]);
 const stopped=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;stopped.current=true;};},[]);
 const dialog=useDialog(()=>{if(!busy)onClose();});
 const valid=rows.filter(r=>!r.error&&!r.id);
 function load(t:string[][]){
  if(t.length<2||!t[0].some(Boolean)||!t.slice(1).some(r=>r.some(v=>v.trim())))throw new Error('Inclua cabeçalhos e pelo menos uma linha.');
  if(t.length>10001)throw new Error('Limite de 10.000 linhas por importação.');
  const m=mapLeadHeaders(t[0]);
  setTable(t);setMapping(m);setRows([]);setReady(false);setFinished(false);setError('');setProgress(0);
 }
 async function file(f?:File){if(!f)return;setError('');setBusy(true);try{
  if(f.size>10*1024*1024)throw new Error('Limite de 10 MB por arquivo.');
  if(/\.csv$/i.test(f.name)){const b=await f.arrayBuffer();let t=new TextDecoder().decode(b);if(t.includes('\uFFFD'))t=new TextDecoder('windows-1252').decode(b);load(parseCsv(t));}
  else if(/\.xlsx$/i.test(f.name)){const x=await import('xlsx');const w=x.read(await f.arrayBuffer(),{type:'array',sheetRows:10002});load(x.utils.sheet_to_json<string[]>(w.Sheets[w.SheetNames[0]],{header:1,raw:false,defval:''}));}
  else throw new Error('Selecione um arquivo XLSX ou CSV.');
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function run(preview:boolean){
  if(busy||(!preview&&!ready))return;setBusy(true);setReady(false);setError('');setProgress(0);stopped.current=false;
  let all:ImportRow[]=preview?[]:rows.map(r=>({...r}));
  try{
   if(preview){for(const [key,label,required] of leadFields)if(required&&mapping[key]<0)throw new Error(`Mapeie ${label}.`);
    const selected=Object.values(mapping).filter(i=>i>=0);if(new Set(selected).size!==selected.length)throw new Error('Uma coluna não pode preencher dois campos.');
    all=prepareRows(table,mapping).map(r=>({...r,values:{...r.values,taxRegime:r.values.taxRegime||config.taxRegimes[0]||'',size:r.values.size||config.companySizes[0]||'',debtStatus:r.values.debtStatus||'Regular'}}));
   }
   const pending=all.filter(r=>!r.error&&!r.id),byLine=new Map(all.map(r=>[r.line,r]));
   for(let i=0;i<pending.length;i+=100){
    if(stopped.current)break;
    const batch=pending.slice(i,i+100);
    const {data,error:failure}=await supabase.rpc('bulk_qualification',{org:organizationId,rows:batch.map(({line,values})=>({line,values})),preview});
    if(failure||!Array.isArray(data)||data.length!==batch.length){
     const message=failure?.message||'Resposta incompleta do servidor.';
     if(!preview)for(const r of batch)r.error=`Resultado não confirmado: ${message}. Reenvie para conferir duplicados antes de repetir.`;
     throw new Error(message);
    }
    for(const result of data){const r=byLine.get(result.line);if(r){r.error=result.error||undefined;if(!preview)r.id=result.id||undefined;}}
    setRows(all.map(r=>({...r})));setProgress(Math.min(i+batch.length,pending.length));
   }
   setRows(all);if(preview){setReady(!stopped.current);if(stopped.current)setError('Validação interrompida. Valide novamente antes de importar.');}else{setFinished(true);if(mounted.current)await onImported();}
  }catch(e){setRows(all);setError((e as Error).message);if(!preview){setFinished(true);if(mounted.current)await onImported().catch(()=>{});}}
  finally{setBusy(false);}
 }
 return <div className="fixed inset-0 z-[3000] bg-slate-900/80 flex items-center justify-center p-4"><div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="bulk-title" className="lead-dialog" style={{maxWidth:1000}}>
  <div className="lead-dialog-header"><div><p className="eyebrow">FILA DE QUALIFICAÇÃO · {companyName}</p><h1 id="bulk-title">Importar leads em lote</h1><p>Revise antes de importar. Nenhum e-mail ou cadência será disparado.</p></div><button className="ux-close" aria-label="Fechar importação" disabled={busy} onClick={onClose}>✕</button></div>
  <div className="lead-dialog-body space-y-5">
   <div className="ux-next">Obrigatórios: razão social, CNPJ, nome do contato e telefone. Até 10.000 linhas / 10 MB. No XLSX, use a primeira aba e formate CNPJ e telefone como texto.<button className="ux-secondary" disabled={busy} onClick={()=>download('modelo-leads.csv',[leadFields.map(([,label])=>label)])}>Baixar modelo CSV</button></div>
   <fieldset disabled={busy||finished} className="space-y-4"><label className="ux-field"><span>Enviar XLSX ou CSV</span><input type="file" accept=".xlsx,.csv" onChange={e=>void file(e.target.files?.[0])}/></label>
   <label className="ux-field"><span>Ou cole o CSV com cabeçalhos</span><textarea rows={5} value={text} onChange={e=>setText(e.target.value)} placeholder="Razão social;CNPJ;Nome do contato;Telefone / WhatsApp"/></label>
   <button className="ux-secondary" onClick={()=>{try{if(new Blob([text]).size>10*1024*1024)throw new Error('Limite de 10 MB por importação.');load(parseCsv(text));}catch(e){setError((e as Error).message);}}}>Usar CSV colado</button>
   {table.length>0&&<><h2>Mapear colunas</h2><div className="ux-fields">{leadFields.map(([key,label,required])=><label className="ux-field" key={key}><span>{label}{required?' *':''}</span><select value={mapping[key]??-1} onChange={e=>{setMapping({...mapping,[key]:Number(e.target.value)});setRows([]);setReady(false);}}><option value={-1}>Não importar</option>{table[0].map((h,i)=><option key={i} value={i}>{i+1}. {h||'Sem título'}</option>)}</select></label>)}</div><button className="btn-navy" onClick={()=>void run(true)}>Validar e pré-visualizar</button></>}
   </fieldset>
   {rows.length>0&&<section ref={previewSection} aria-label="Pré-visualização"><p>{rows.length} linhas · {valid.length} aptas · {rows.filter(r=>r.error).length} com erros · {rows.filter(r=>r.id).length} importadas</p><p className="ux-hint">Primeiras 50 linhas. Confira os e-mails do contato e da empresa antes de importar. E-mail da empresa não preenche automaticamente o contato. Baixe o relatório para consultar todos os erros.</p><div className="overflow-auto"><table className="w-full text-left"><thead><tr>{['Linha','Empresa','CNPJ','Contato','E-mail do contato','E-mail da empresa','Resultado'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.slice(0,50).map(r=><tr key={r.line}><td>{r.line}</td><td>{r.values.legalName}</td><td>{r.values.cnpj}</td><td>{r.values.name}</td><td className="break-all">{r.values.email||'Não informado'}</td><td className="break-all">{r.values.companyEmail||'Não informado'}</td><td>{r.error|| (r.id?'Importada':'Apta')}</td></tr>)}</tbody></table></div></section>}
   {busy&&<div role="status" aria-live="polite">Processando: {progress} linhas verificadas ou importadas.<progress className="w-full" value={progress} max={rows.length||table.length-1||1}/><button className="ux-secondary" onClick={()=>{stopped.current=true;}}>Parar após este lote</button></div>}
   {finished&&<p role="status">{rows.filter(r=>r.id).length} leads importados para a Fila de Qualificação. {valid.length} não processados. Para repetir, feche e envie o arquivo novamente; os já cadastrados serão identificados.</p>}
   {error&&<p className="ux-error" role="alert">{error}</p>}
  </div>
  <div className="lead-dialog-footer"><button className="ux-secondary" disabled={busy} onClick={onClose}>{finished?'Concluir':'Cancelar'}</button><div>{rows.some(r=>r.error)&&<button className="ux-secondary" disabled={busy} onClick={()=>download('erros-importacao.csv',[['Linha','Erro',...leadFields.map(([,l])=>l)],...rows.filter(r=>r.error).map(r=>[String(r.line),r.error!,...leadFields.map(([k])=>r.values[k]||'')])])}>Baixar relatório de erros</button>}<button className="btn-navy" disabled={busy||finished||!ready||!valid.length} onClick={()=>void run(false)}>Importar {valid.length} leads válidos</button></div></div>
 </div></div>;
}
