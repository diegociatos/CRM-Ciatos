import React from 'react';
import {callOutcomes,intakeChannels} from '../lib/supportIntake';
import type {IntakeDetails} from '../lib/supportIntake';
export default function SupportIntakeSummary({intake}:{intake?:Partial<IntakeDetails>}){
 if(intake?.source!=='manual')return null;
 return <section className="demands-intake" aria-label="Origem do atendimento"><h3>Atendimento registrado pela equipe</h3><dl>
  <div><dt>Canal informado</dt><dd>{intake.channel?intakeChannels[intake.channel]:'Outro'}</dd></div>
  <div><dt>Solicitante</dt><dd>{intake.name}</dd></div>
  {intake.company&&<div><dt>Empresa</dt><dd>{intake.company}</dd></div>}
  {intake.phone&&<div><dt>Telefone</dt><dd>{intake.phone}</dd></div>}
  {intake.email&&<div><dt>E-mail</dt><dd>{intake.email}</dd></div>}
  {intake.channel==='phone'&&<><div><dt>Direção</dt><dd>{intake.direction==='OUTBOUND'?'Realizada':'Recebida'}</dd></div><div><dt>Resultado</dt><dd>{intake.outcome?callOutcomes[intake.outcome]:'Não informado'}</dd></div><div><dt>Duração informada</dt><dd>{intake.duration_seconds??0} segundos</dd></div></>}
 </dl><p>Registro manual. Não comprova recebimento, envio de mensagem ou conexão com PABX. A data de criação indica quando a equipe registrou a solicitação.</p></section>;
}
