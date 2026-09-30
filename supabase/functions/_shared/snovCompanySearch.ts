const stateNames: Record<string, string> = {
  AC:'Acre',AL:'Alagoas',AP:'Amapá',AM:'Amazonas',BA:'Bahia',CE:'Ceará',DF:'Distrito Federal',
  ES:'Espírito Santo',GO:'Goiás',MA:'Maranhão',MT:'Mato Grosso',MS:'Mato Grosso do Sul',
  MG:'Minas Gerais',PA:'Pará',PB:'Paraíba',PR:'Paraná',PE:'Pernambuco',PI:'Piauí',RJ:'Rio de Janeiro',
  RN:'Rio Grande do Norte',RS:'Rio Grande do Sul',RO:'Rondônia',RR:'Roraima',SC:'Santa Catarina',
  SP:'São Paulo',SE:'Sergipe',TO:'Tocantins',
};

const normalized = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();

export function snovIndustry(segment: string): string {
  const value = normalized(segment);
  if (/contab|account/.test(value)) return 'Accounting';
  if (/advoc|jurid|law/.test(value)) return 'Law Practice';
  if (/transport|carga|frete|truck/.test(value)) return 'Transportation/Trucking/Railroad';
  if (/logist|supply/.test(value)) return 'Logistics and Supply Chain';
  if (/consult|assessor/.test(value)) return 'Management Consulting';
  if (/imobili|real estate/.test(value)) return 'Real Estate';
  if (/tecnolog|software/.test(value)) return 'Information Technology and Services';
  return segment.trim();
}

export function snovCompanyFilters(filters: {segment?:string;state?:string;city?:string}) {
  const segment = String(filters.segment || '').trim().slice(0,120);
  if (!segment) throw new Error('segment_required');
  const state = String(filters.state || '').trim().toUpperCase();
  if (state && !stateNames[state]) throw new Error('invalid_state');
  const city = String(filters.city || '').trim().slice(0,100);
  const locality = city || stateNames[state] || 'Brazil';
  return { company: { industries: { include: [snovIndustry(segment)] } },
    locations: { include: { locality, location_type: city ? 'city' : state ? 'state' : 'country' } } };
}

export interface SnovCompany { name:string;domain:string;location:string;industry:string;size:string }
export function snovCompanies(result: any, filters: {state?:string;city?:string}): {companies:SnovCompany[];page:number;totalPages:number} {
  if (result?.status !== 'completed' || !Array.isArray(result?.data?.companies)) throw new Error('invalid_provider_result');
  const state = String(filters.state || '').trim().toUpperCase();
  const city = normalized(filters.city);
  const seen = new Set<string>();
  const companies = result.data.companies.slice(0,20).flatMap((entry:any) => {
    const domain = String(entry?.domain || '').toLowerCase().trim();
    const name = String(entry?.name || '').trim().slice(0,200);
    const location = String(entry?.location || '').trim().slice(0,200);
    const place = normalized(location);
    if (!name || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain) || seen.has(domain)) return [];
    if (!/\bbrazil\b|\bbrasil\b/.test(place)) return [];
    if (city && !place.includes(city)) return [];
    if (state && !(stateNames[state] && place.includes(normalized(stateNames[state])) || new RegExp(`(?:^|[, ])${state.toLowerCase()}(?:[, ]|$)`).test(place))) return [];
    seen.add(domain);
    return [{name,domain,location,industry:String(entry.industry || '').slice(0,120),size:String(entry.size || '').slice(0,40)}];
  });
  return { companies, page:Math.max(1,Number(result.data.page)||1), totalPages:Math.max(0,Number(result.data.total_pages)||0) };
}
