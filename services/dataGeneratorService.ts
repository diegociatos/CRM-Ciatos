
import { 
  Lead, LeadStatus, CompanySize, User, AgendaEvent, 
  Interaction, SdrQualification, UserRole 
} from '../types';

const SEGMENTS = ['Indústria Metalúrgica', 'Transporte Logístico', 'Atacado Alimentício', 'Fábrica de Têxteis', 'Hospital Privado', 'Startup de Tecnologia', 'Construtora Civil', 'Agronegócio Exportação'];
const CITIES = [
  { city: 'Belo Horizonte', state: 'MG' },
  { city: 'Contagem', state: 'MG' },
  { city: 'Uberlândia', state: 'MG' },
  { city: 'São Paulo', state: 'SP' },
  { city: 'Campinas', state: 'SP' },
  { city: 'Curitiba', state: 'PR' },
  { city: 'Goiânia', state: 'GO' }
];
const NAMES = ['Ricardo', 'Ana', 'Bruno', 'Carla', 'Diego', 'Fernanda', 'Gabriel', 'Helena', 'Igor', 'Juliana', 'Marcos', 'Beatriz'];
const SURNAMES = ['Silva', 'Oliveira', 'Santos', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Mendes', 'Gomes'];

const generateCNPJ = () => {
  const n = () => Math.floor(Math.random() * 9);
  const cnpj = `${n()}${n()}.${n()}${n()}${n()}.${n()}${n()}${n()}/0001-${n()}${n()}`;
  return { formatted: cnpj, raw: cnpj.replace(/\D/g, '') };
};

const formatCurrency = (val: number) => 
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

export const seedDatabase = (nTotal: number = 60, currentUser: User, allUsers: User[]) => {
  const leads: Lead[] = [];
  const events: AgendaEvent[] = [];
  const quals: SdrQualification[] = [];
  
  const sdrUsers = allUsers.filter(u => u.role === UserRole.SDR);
  const closerUsers = allUsers.filter(u => u.role === UserRole.CLOSER || u.role === UserRole.ADMIN || u.role === UserRole.MANAGER);

  const phases = ['ph-qualificado', 'ph-contato', 'ph-remarcar', 'ph-agend', 'ph-prop', 'ph-nego', 'ph-fech'];

  for (let i = 0; i < nTotal; i++) {
    const segment = SEGMENTS[Math.floor(Math.random() * SEGMENTS.length)];
    const loc = CITIES[Math.floor(Math.random() * CITIES.length)];
    const cnpj = generateCNPJ();
    const companyBase = `${segment.split(' ')[1]} ${SURNAMES[Math.floor(Math.random() * SURNAMES.length)]}`;
    const companyName = `${companyBase} ${Math.random() > 0.5 ? 'Ltda' : 'S/A'}`;
    
    const revenueNum = Math.floor(Math.random() * 90000000) + 1200000;
    const payrollNum = revenueNum * 0.12;
    const leadId = `seed-lead-${i}-${Math.random().toString(36).substr(2, 5)}`;
    const contactName = `${NAMES[Math.floor(Math.random() * NAMES.length)]} ${SURNAMES[Math.floor(Math.random() * SURNAMES.length)]}`;
    
    let status = LeadStatus.NEW;
    let phaseId = 'ph-qualificado';
    let inQueue = false;

    if (i < nTotal * 0.25) {
      status = LeadStatus.QUALIFICATION;
      inQueue = true;
    } 
    else if (i < nTotal * 0.40) {
      status = LeadStatus.CONTACTED;
      phaseId = 'ph-qualificado';
    } else if (i < nTotal * 0.55) {
      status = LeadStatus.NEGOTIATION;
      phaseId = 'ph-agend';
    } else if (i < nTotal * 0.70) {
      status = LeadStatus.NEGOTIATION;
      phaseId = 'ph-prop';
    } else if (i < nTotal * 0.85) {
      status = LeadStatus.NEGOTIATION;
      phaseId = 'ph-nego';
    } else {
      status = LeadStatus.WON;
      phaseId = 'ph-fech';
    }

    const owner = closerUsers[i % closerUsers.length];
    const sdr = sdrUsers[i % sdrUsers.length];

    const interactions: Interaction[] = [];
    if (!inQueue) {
      const intCount = Math.floor(Math.random() * 4) + 1;
      for (let j = 0; j < intCount; j++) {
        interactions.push({
          id: `int-${leadId}-${j}`,
          type: j === 0 ? 'CALL' : 'NOTE',
          title: j === 0 ? 'Cold Call SDR' : 'Follow-up Consultor',
          content: `Simulação de histórico comercial para ${companyBase}.`,
          date: new Date(Date.now() - (j * 3 * 24 * 60 * 60 * 1000)).toISOString(),
          author: j === 0 ? sdr.name : owner.name,
          authorId: j === 0 ? sdr.id : owner.id
        });
      }
    }

    const lead: Lead = {
      id: leadId,
      name: contactName,
      email: `${contactName.toLowerCase().split(' ')[0]}@${companyBase.toLowerCase().replace(/\s/g, '')}.com.br`,
      phone: `(31) 9${Math.floor(Math.random() * 8000 + 1000)}-${Math.floor(Math.random() * 8000 + 1000)}`,
      company: companyName,
      tradeName: companyBase,
      legalName: companyName,
      cnpj: cnpj.formatted,
      cnpjRaw: cnpj.raw,
      segment: segment,
      size: revenueNum > 48000000 ? CompanySize.LARGE : revenueNum > 12000000 ? CompanySize.MEDIUM : CompanySize.EPP,
      taxRegime: Math.random() > 0.5 ? 'Lucro Real' : 'Lucro Presumido',
      annualRevenue: formatCurrency(revenueNum),
      payrollValue: formatCurrency(payrollNum),
      status,
      phaseId,
      ownerId: owner.id,
      inQueue,
      createdAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString(),
      debtStatus: Math.random() > 0.8 ? 'Dívida Ativa' : 'Regular',
      icpScore: Math.floor(Math.random() * 2) + 3,
      city: loc.city,
      state: loc.state,
      detailedPartners: [{ name: contactName, sharePercentage: '100%' }],
      interactions,
      tasks: [],
      notes: `Lead de teste gerado para validação.`,
      closeProbability: Math.floor(Math.random() * 5) + 1
    };

    leads.push(lead);
  }

  return { leads, events: [], quals: [] };
};
