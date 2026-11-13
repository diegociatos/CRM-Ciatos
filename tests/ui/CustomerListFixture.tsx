import React from 'react';
import CustomerDatabase from '../../components/CustomerDatabase';
import {LeadStatus,UserRole} from '../../types';
export default function CustomerListFixture(){
 const leads=Array.from({length:26},(_,i)=>({id:`client-${i}`,name:`Cliente ${String(i+1).padStart(2,'0')}`,company:`Empresa ${String(i+1).padStart(2,'0')}`,status:LeadStatus.WON,interactions:[],healthScore:i===1?0:undefined}));
 return <main><CustomerDatabase leads={leads as any} currentUser={{id:'test',name:'Equipe',role:UserRole.ADMIN} as any} onUpdateCustomer={()=>{}} onDeleteCustomer={()=>{}}/></main>;
}
