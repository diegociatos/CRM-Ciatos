export const intakeChannels = {phone:'Ligação',email:'E-mail',whatsapp:'WhatsApp',in_person:'Presencial',other:'Outro'} as const;
export type IntakeChannel = keyof typeof intakeChannels;
export const callOutcomes = {ANSWERED:'Atendida',MISSED:'Não atendida',CALLBACK:'Precisa de retorno'} as const;
export type IntakeDetails = {source?:'manual';channel:IntakeChannel;name:string;company:string;phone:string;email:string;direction:'INBOUND'|'OUTBOUND';outcome:keyof typeof callOutcomes;duration_seconds:number};
export const emptyIntake = ():IntakeDetails => ({channel:'phone',name:'',company:'',phone:'',email:'',direction:'INBOUND',outcome:'ANSWERED',duration_seconds:0});
export function intakeError(d:IntakeDetails):string|null {
 if(d.name.trim().length<2)return 'Informe o nome de quem solicitou.';
 if(['phone','whatsapp'].includes(d.channel)&&!/^\d{8,15}$/.test(d.phone.replace(/\D/g,'')))return 'Informe um telefone com DDD.';
 if(d.channel==='email'&&!d.email.trim())return 'Informe o e-mail de quem solicitou.';
 if(d.email.trim()&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(d.email.trim()))return 'Informe um e-mail válido.';
 if(d.channel==='phone'&&(!Number.isInteger(d.duration_seconds)||d.duration_seconds<0||d.duration_seconds>86400||(d.outcome==='MISSED'&&d.duration_seconds!==0)))return 'Confira a duração da ligação. Uma chamada não atendida deve ter duração zero.';
 return null;
}
export function intakePayload(d:IntakeDetails){
 const {direction,outcome,duration_seconds,source:_source,...contact}=d;
 return {...contact,name:d.name.trim(),company:d.company.trim(),phone:d.phone.trim(),email:d.email.trim().toLowerCase(),...(d.channel==='phone'?{direction,outcome,duration_seconds}:{} )};
}
