# Empresas do grupo

O seletor **Empresa atual**, acima de todas as telas, define a operação aberta. O usuário vê apenas empresas ativas às quais está vinculado. A escolha é lembrada por usuário neste navegador. A troca pede confirmação e reinicia as telas, pesquisas e rascunhos; salve antes de trocar. Ela não transfere clientes.

## Cadastro e acessos

1. O administrador do grupo abre **Gerenciar empresas → Cadastrar outra empresa**.
2. Informa nome e, opcionalmente, razão social, CNPJ, e-mail e telefone.
3. **Criar empresa e entrar** abre uma operação vazia e vincula o criador como administrador.
4. Em **Quem pode trabalhar nesta empresa**, informa o e-mail de um usuário já cadastrado e seu perfil local. Para um novo usuário, primeiro usa **Gestão de Usuários**. Convites continuam sujeitos à flag global de envio desligada; nenhum convite é enviado pela criação da empresa ou pelo vínculo de usuário existente.
5. O usuário pode ser SDR na Contabilidade e consultor no Jurídico. Remover seu vínculo em uma empresa preserva os outros e não desativa sua identidade compartilhada com outros sistemas.

A administração da plataforma é uma autorização explícita em `crm.platform_admins`, separada do papel operacional ADMIN. A atualização preserva somente os administradores globais previamente confiáveis do workspace original. Novas concessões exigem operação administrativa no servidor; e-mail, convite e edição de perfil não promovem um usuário.

O dono acessa **Administração da plataforma** para administrar empresas clientes, planos, contratos, limites, registros financeiros, acessos, suporte e configurações. O painel não concede acesso automático aos leads e atividades das empresas. O cadastro de empresas está disponível no painel e em **Gerenciar empresas**, somente para o dono.

O **master** é um vínculo `is_master` explícito por empresa. Pode editar seus dados cadastrais e administrar usuários comuns daquele workspace, inclusive novos usuários em **Gestão de Usuários**. Não cria empresas da plataforma, não promove outros masters, não altera um vínculo master e não acessa o painel do dono. `assign_company_master(org, master_email)` é exclusivo do dono e exige identidade ativa já cadastrada. O papel ADMIN comum não equivale a master. A mesma identidade pode ser master em várias empresas.

Os novos cadastros de identidade usam a API oficial de autenticação administrativa. Contas existentes conservam senha e identidade compartilhada. Criar um usuário não autoriza enviar e-mail: os envios continuam desligados. Um link individual de definição de senha pode ser entregue privadamente; nunca deve entrar no repositório, logs ou PR.

## Separação dos dados

Leads/clientes, interações, agenda, scripts, configurações, onboarding, metas, templates de e-mail, Radar, auditoria e automação usam `organization_id`. A leitura no frontend filtra explicitamente esse ID e todas as gravações o incluem. A camada de dados captura o ID ao abrir a operação, sem variável global mutável; respostas da operação anterior não atualizam a nova tela.

RLS exige vínculo ativo na empresa. IDs de empresa são imutáveis, vínculos de lead/agenda/interação e busca/resultado têm chaves compostas, e responsáveis devem pertencer à empresa. O CNPJ de um cliente pode existir em operações distintas, mas não se repete na mesma empresa. Perfil de identidade e permissões operacionais são separados. Central da IA segue a seleção global. Cadastro de empresa não altera flags de envio, IA ou Snov.

### Operação comercial de cada empresa

Cada empresa nova começa com política de envio desligada e sem agente SDR configurado. No espaço da empresa selecionada, o administrador deve criar ou revisar uma cadência de prospecção, definir remetente e endereço de resposta em **Comunicados**, registrar a finalidade e base de contato, escolher a lista do Radar e configurar o destinatário dos alertas em **Central da IA → Agente SDR**. O endereço de avisos não é herdado de outra empresa. Trocar de empresa limpa o formulário e carrega somente suas configurações, fila e alertas.

A conexão Microsoft 365 atual é única para esta instalação. Empresas do grupo podem usar essa caixa somente com um remetente autorizado para **Enviar como** e endereço de resposta atendido por ela. Isso não cria uma conexão de e-mail independente para cada cliente futuro da plataforma. Antes de habilitar envio para clientes externos, é necessário implementar e testar credenciais, OAuth, leitura de respostas e segregação da caixa por empresa. A conta Snov.io do grupo também não é compartilhada automaticamente com clientes externos.

## Implantação

1. Fazer backup de schema e dados **crm**. Não alterar `public`. A autenticação compartilhada somente recebe novas contas explicitamente autorizadas pela API oficial; nunca redefinir senhas existentes.
2. Executar typecheck, build, testes SQL/RLS e Playwright; validar as funções com Deno.
3. Aplicar as migrations pendentes `20260926200000_company_workspaces.sql` e `20260926210000_platform_owner.sql`, cada uma em transação e somente se ainda não aplicada, registrando as versões no histórico. Conferir previamente quais administradores legados serão preservados como donos.
4. Publicar somente as funções alteradas `crm-admin-users` e `crm-ia`, preservando autenticação e secrets.
5. Publicar o frontend desta branch com o workflow Cloudflare existente. A versão anterior do frontend não deve ser restaurada isoladamente: ela não inclui o escopo obrigatório nas gravações.
6. Validar login, seletor, cadastro de empresas e isolamento em ambiente de teste. Em produção, conferir leitura e formulários sem gerar clientes ou disparos de teste.

Os dados existentes continuam em **Grupo Ciatos**, sem redistribuição automática nem criação de empresas exemplificativas. A migration não apaga clientes ou acessos. Para rollback, avaliar os registros criados após a publicação antes de restaurar o backup; não remover a coluna de empresa com dados novos.

## Validação e limites

O teste `companies.test.ts` executa migrations reais em PostgreSQL descartável e verifica cadastro, perfis por empresa, CNPJ composto, configurações/templates/metas independentes, bloqueio de links cruzados, tentativas de escalada e revogação em apenas uma empresa. O teste de interface usa o app completo com API simulada e cobre troca/cancelamento, gravação na empresa selecionada, seleção persistente, Central coerente e criação de operação vazia.

Ainda não há transferência ou compartilhamento de clientes entre empresas, visão consolidada do grupo, múltiplos contratos por cliente, domínio próprio por empresa ou SDR conversacional completo. As regras atuais de colaboração dentro de uma empresa permanecem; o isolamento desta entrega é entre empresas. Endpoints externos não foram acionados com envios reais.

No projeto compartilhado existente, as migrations anteriores do CRM foram aplicadas manualmente. Não executar db push indiscriminadamente contra esse projeto; conferir o histórico antes de futuras aplicações. A migration de multiempresas foi registrada individualmente após a execução transacional.

### Primeiro acesso em autenticação compartilhada
O link privado aponta ao CRM com token de recuperação no fragmento. O aplicativo remove o token da URL e o valida pela API oficial `verifyOtp` antes de exibir a definição de senha. Tokens inválidos ou expirados não abrem essa tela, mesmo se houver outra sessão no navegador. Não registrar URLs de ativação em telemetria. Esse fluxo evita o redirecionamento padrão de outra aplicação sem modificar a configuração compartilhada. Referência: https://supabase.com/docs/reference/javascript/auth-verifyotp .

### Senha inicial de novas identidades
Novas contas criadas por `crm-admin-users` recebem uma senha aleatória (ninguém a conhece), a marca administrativa `crm_password_change_required` e um e-mail de convite com link para criar a própria senha. O convite é transacional e sai mesmo com `CRM_LIVE_SEND_ENABLED` desligado. Cadastrar de novo uma conta que ainda está com a marca reenvia o link. Contas de autenticação já existentes conservam a senha. Antes da troca, `password_ready()` bloqueia `tenant_member()` e `platform_admin()`, incluindo chamadas diretas ao banco e funções operacionais. A marca fica em app_metadata, que o usuário não pode editar.

A ação autenticada `complete-password` muda a senha e remove a marca em uma única atualização administrativa, sempre na identidade do solicitante. A senha pessoal deve ter de 8 a 128 caracteres, maiúscula, minúscula e número; a senha inicial não é aceita. O frontend renova a sessão antes de carregar as empresas, conserva o formulário após erro e permite sair. A migration `20260926220000_first_password.sql` não altera senhas ou marcas de contas existentes. Publicar junto a função crm-admin-users e o frontend. Nenhum novo secret é necessário.

Sessões emitidas com a marca de senha inicial permanecem bloqueadas pelo banco após a troca, até receberem um token atualizado. A liberação exige tanto a marca administrativa atual removida quanto um token sem a marca provisória.

## Painel do proprietário

A administração comercial da plataforma agora é feita em oito áreas descritas em [ADMINISTRACAO_PLATAFORMA.md](ADMINISTRACAO_PLATAFORMA.md): empresas, planos/limites, contratos, registros financeiros, usuários, suporte, histórico e configurações. A migration 20260926230000 preserva as empresas existentes como uso interno, sem preços atribuídos. Limites e suspensão são aplicados no servidor. A personalização inicial cobre nome de apresentação e cor; cobrança automática e white-label completo dependem de integrações adicionais.
