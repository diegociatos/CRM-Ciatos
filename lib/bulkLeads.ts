export const leadFields = [
  ['legalName','Razão social',true],['cnpj','CNPJ',true],['name','Nome do contato',true],['phone','Telefone / WhatsApp',true],
  ['tradeName','Nome fantasia'],['email','E-mail profissional'],['role','Cargo'],['segment','Segmento'],
  ['website','Website / LinkedIn'],['companyPhone','Telefone da empresa'],['companyEmail','E-mail da empresa'],
  ['address','Endereço'],['city','Cidade'],['state','UF'],['taxRegime','Regime tributário'],['size','Porte'],
  ['debtStatus','Situação de dívidas'],['payrollValue','Folha mensal (R$)'],['monthlyRevenue','Faturamento mensal (R$)'],
  ['annualRevenue','Faturamento anual (R$)'],['strategicPains','Necessidades identificadas'],['expectations','Expectativas do contato'],['notes','Observações comerciais'],
] as const;
export type ImportRow = {line:number; values:Record<string,string>; error?:string; id?:string};
export const normalizeHeader=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function mapLeadHeaders(headers:string[]):Record<string,number>{
 const aliases:Record<string,string[]>={email:['emailcontato','emaildocontato','emaillead','emaildalead','emaildolead','correioeletronico'],companyEmail:['emaildaempresa','emailempresa','emailcomercial','emailcorporativo']};
 const mapping:Record<string,number>={};
 for(const [key,label] of leadFields)mapping[key]=headers.findIndex(h=>[normalizeHeader(key),normalizeHeader(label),...(aliases[key]||[])].includes(normalizeHeader(h)));
 return mapping;
}
export function validCnpj(value:string) {
  const s=value.replace(/[.\/\-\s]/g,'').toUpperCase();
  if(!/^[A-Z0-9]{12}\d{2}$/.test(s)||/^(.)\1{13}$/.test(s))return false;
  for(let length=12;length<=13;length++){
    let sum=0;for(let i=0;i<length;i++)sum+=(s.charCodeAt(i)-48)*((length-1-i)%8+2);
    const digit=sum%11<2?0:11-sum%11;if(Number(s[length])!==digit)return false;
  }return true;
}
export function parseCsv(text:string):string[][] {
  text=text.replace(/^\uFEFF/,'');
  const first=text.split(/\r?\n/)[0]||'';
  const counts=[',',';','\t'].map(sep=>{let n=0,q=false;for(const c of first){if(c==='"')q=!q;else if(c===sep&&!q)n++;}return n;});
  const sep=[',',';','\t'][counts.indexOf(Math.max(...counts))];
  const rows:string[][]=[];let row:string[]=[],value='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
    else if(c===sep&&!quoted){row.push(value);value='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);rows.push(row);row=[];value='';}
    else value+=c;
  }
  if(quoted)throw new Error('CSV com aspas não fechadas.');
  if(value||row.length){row.push(value);rows.push(row);}return rows;
}
export function prepareRows(table:string[][],mapping:Record<string,number>):ImportRow[]{
  if(table.length>10001)throw new Error('Limite de 10.000 linhas por importação.');
  const cnpjs=new Set<string>(),emails=new Set<string>();
  return table.slice(1).map((cells,i)=>({cells,line:i+2})).filter(r=>r.cells.some(v=>v.trim())).map(({cells,line})=>{
    const values:Record<string,string>={};for(const [key] of leadFields)values[key]=(cells[mapping[key]]||'').trim();
    values.cnpj=values.cnpj.replace(/[.\/\-\s]/g,'').toUpperCase();values.email=values.email.toLowerCase();values.companyEmail=values.companyEmail.toLowerCase();
    const errors:string[]=[];
    if(cells.length!==table[0].length)errors.push('Quantidade de colunas diferente do cabeçalho');
    for(const [key,label,required] of leadFields)if(required&&!values[key])errors.push(`${label} obrigatório`);
    if(!validCnpj(values.cnpj))errors.push('CNPJ inválido');
    for(const key of ['email','companyEmail'])if(values[key]&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values[key]))errors.push('E-mail inválido');
    if(!errors.length){if(cnpjs.has(values.cnpj)||(values.email&&emails.has(values.email)))errors.push('Duplicado no arquivo');else{cnpjs.add(values.cnpj);if(values.email)emails.add(values.email);}}
    return {line,values,error:errors.join('; ')||undefined};
  });
}
export const csvCell=(s:string)=>'"'+s.replace(/^[=+@\-]/,"'$&").replace(/"/g,'""')+'"';
