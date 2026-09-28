# Administração da plataforma

O cartão da empresa, no alto da barra lateral, identifica a empresa em operação. Clicando nele abre o menu para **trocar de empresa**, **Gerenciar empresas** e, para o proprietário, **Administrar o CRM**. O painel tem oito áreas, com dados persistidos no servidor e acesso exclusivo ao dono. Usuários master continuam restritos às suas empresas. Toda identidade pode ter vínculos em várias empresas, com perfis independentes.

## Rotina do proprietário

1. **Planos e limites:** cadastrar nome, preços mensal/anual, descrição e limites de usuários ativos e contatos. Limite vazio significa ilimitado. Retirar um plano do catálogo preserva os contratos que já o utilizam. Alterar seu preço não reescreve valores negociados.
2. **Empresas clientes:** cadastrar razão social, CNPJ, contatos e apresentação da empresa. O cadastro é vazio, com envio desativado. O dono não ganha acesso automático à carteira operacional desse cliente. A lista compacta permite busca, filtro por situação e exportação CSV protegida contra fórmulas. O botão **Gerenciar** abre a área da empresa, com cadastro, contrato, usuários e financeiro reunidos. A aba financeira filtra somente seus registros e preseleciona a empresa ao criar um lançamento. A visão geral contém atalhos para concluir a preparação comercial.
3. **Contrato:** selecionar plano, valor contratado por período, periodicidade, datas, e-mail financeiro e andamento da configuração inicial. O valor não é aplicado automaticamente a partir do catálogo: permite negociação explícita.
4. **Usuários e acessos:** selecionar a empresa e cadastrar ou vincular um e-mail. Marcar master para o responsável local, ou escolher um perfil operacional. Contas novas recebem um e-mail com link para criar a própria senha (cadastrar de novo reenvia o link, se a pessoa ainda não criou a senha); contas existentes preservam a senha. É possível alterar o perfil, nomear/substituir masters e suspender ou reativar vínculos. O último master ativo não pode ser removido antes de haver um substituto. Alterar o próprio vínculo é bloqueado.
5. **Financeiro:** registrar referência, descrição, valor, vencimento e pagamento recebido. A baixa é manual e pede confirmação. Registros pagos preservam valor e referência e só podem ser cancelados com justificativa. Não há transferência de dinheiro, boleto, Pix ou emissão fiscal.
6. **Suporte:** registrar assunto, descrição, prioridade e andamento. A conclusão exige resolução descrita. É um controle interno do proprietário, sem envio de e-mail ou portal externo de chamados.
7. **Histórico:** consultar as últimas 200 alterações administrativas, autor, horário e resultado. Não há exclusão pelo painel. A auditoria operacional de cada empresa permanece separada.
8. **Configurações:** definir nome do produto, canal de suporte, links HTTPS de termos e privacidade e orientações comerciais internas. Credenciais não são armazenadas nessa tela.

A visão geral apresenta empresas, receita mensal contratada, valores em aberto, pagamentos registrados no mês e atendimentos. A receita mensal considera somente contratos ativos e divide o valor anual por 12; não é uma confirmação de receita recebida. Os indicadores financeiros vêm dos registros manuais. Não há faturamento fictício.

## Situações de contrato e limites

- **Uso interno:** preserva as empresas atuais sem cobrança atribuída. Todos os cadastros existentes começam assim.
- **Em teste:** exige data final; acesso indisponível depois do vencimento.
- **Ativo:** acesso normal com plano contratado.
- **Em atraso:** mantém acesso para permitir negociação; a suspensão é uma decisão explícita.
- **Suspenso / cancelado:** bloqueia acesso operacional no servidor e pausa cadências ativas. Reativar não reinicia as cadências automaticamente. O espaço original do proprietário é protegido contra suspensão pelo painel.

Os limites são aplicados por empresa em triggers do banco, incluindo APIs e importações. Não é permitido contratar um plano ou reduzir seus limites abaixo do uso atual. A contagem de usuários considera vínculos ativos; um usuário em duas empresas ocupa um vínculo em cada uma. Contatos são linhas existentes na base de leads/clientes.

A indisponibilidade da empresa também é verificada pelo scheduler e novamente antes de autorizar um envio. Operações já autorizadas/em trânsito antes de uma suspensão não podem ser desfeitas pelo painel. As flags globais de envio continuam independentes e desligadas.

## Personalização

Nome de apresentação e cor são editáveis por empresa e aparecem na identificação da operação. Book Antiqua permanece global. Isso não inclui upload de logotipo, domínio próprio ou substituição completa da marca em todos os templates.

## Preparação para comercialização

O painel permite administrar clientes e registrar contratos de uma venda atendida pelo proprietário. Antes de automatizar recebimentos, conectar e homologar gateway, eventos de pagamento, emissão fiscal e comunicações. Cadastro/checkout público, cobrança recorrente automática e portal de autoatendimento não fazem parte desta entrega. Nenhum plano, preço ou contrato comercial real é criado pela migration.

## Implantação e segurança

1. Backup privado do schema e dos dados `crm`.
2. Rodar typecheck, build, testes SQL/RLS, Playwright e Deno.
3. Aplicar **somente a migration pendente** `20260926230000_platform_console.sql` em transação; registrar a versão individualmente. Não executar db push indiscriminadamente no projeto compartilhado.
4. Publicar `crm-admin-users`, mantendo JWT/secrets; a ação `create-master` exige proprietário no servidor. Publicar frontend pelo workflow Cloudflare existente.
5. Conferir a visão geral, as oito áreas e os vínculos existentes sem salvar dados fictícios em produção.

As tabelas administrativas têm RLS e não concedem acesso direto a usuários autenticados comuns. A RPC `platform_console` verifica proprietário antes de qualquer leitura ou alteração. Nem master nem administrador operacional recebe autorização de plataforma. O snapshot contém cadastros, contratos e contagens, sem contatos comerciais, mensagens, credenciais ou senhas.

As novas empresas permanecem com envios desativados. Planos e contratos não alteram flags de IA, envio ou Snov. A migration não modifica senhas, memberships existentes, dados operacionais nem o schema public. Rollback exige avaliar novos registros antes de restaurar; não remover as tabelas com contratos/lançamentos sem preservar os dados.
