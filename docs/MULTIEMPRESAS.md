# Empresas do grupo

O seletor **Empresa atual**, acima de todas as telas, define a operação aberta. O usuário vê apenas empresas ativas às quais está vinculado. A escolha é lembrada por usuário neste navegador. A troca pede confirmação e reinicia as telas, pesquisas e rascunhos; salve antes de trocar. Ela não transfere clientes.

## Cadastro e acessos

1. O administrador do grupo abre **Gerenciar empresas → Cadastrar outra empresa**.
2. Informa nome e, opcionalmente, razão social, CNPJ, e-mail e telefone.
3. **Criar empresa e entrar** abre uma operação vazia e vincula o criador como administrador.
4. Em **Quem pode trabalhar nesta empresa**, informa o e-mail de um usuário já cadastrado e seu perfil local. Para um novo usuário, primeiro usa **Gestão de Usuários**. Convites continuam sujeitos à flag global de envio desligada; nenhum convite é enviado pela criação da empresa ou pelo vínculo de usuário existente.
5. O usuário pode ser SDR na Contabilidade e consultor no Jurídico. Remover seu vínculo em uma empresa preserva os outros e não desativa sua identidade compartilhada com outros sistemas.

A administração do grupo é o perfil global ADMIN com vínculo administrativo ativo no workspace original. Administradores locais cuidam da operação; cadastro de empresas e distribuição de acessos ficam centralizados no grupo. Não se concede administração global por um convite de administrador local. Alterar o próprio vínculo é bloqueado; um administrador ativo deve permanecer.

## Separação dos dados

Leads/clientes, interações, agenda, scripts, configurações, onboarding, metas, templates de e-mail, Radar, auditoria e automação usam `organization_id`. A leitura no frontend filtra explicitamente esse ID e todas as gravações o incluem. A camada de dados captura o ID ao abrir a operação, sem variável global mutável; respostas da operação anterior não atualizam a nova tela.

RLS exige vínculo ativo na empresa. IDs de empresa são imutáveis, vínculos de lead/agenda/interação e busca/resultado têm chaves compostas, e responsáveis devem pertencer à empresa. O CNPJ de um cliente pode existir em operações distintas, mas não se repete na mesma empresa. Perfil de identidade e permissões operacionais são separados. Central da IA segue a seleção global. Cadastro de empresa não altera flags de envio, IA ou Snov.

## Implantação

1. Fazer backup de schema e dados **crm**. Não alterar `public` nem a autenticação compartilhada.
2. Executar typecheck, build, testes SQL/RLS e Playwright; validar as funções com Deno.
3. Aplicar `20260926200000_company_workspaces.sql` em transação e registrar sua versão no histórico de migrations.
4. Publicar somente as funções alteradas `crm-admin-users` e `crm-ia`, preservando autenticação e secrets.
5. Publicar o frontend desta branch com o workflow Cloudflare existente. A versão anterior do frontend não deve ser restaurada isoladamente: ela não inclui o escopo obrigatório nas gravações.
6. Validar login, seletor, cadastro de empresas e isolamento em ambiente de teste. Em produção, conferir leitura e formulários sem gerar clientes ou disparos de teste.

Os dados existentes continuam em **Grupo Ciatos**, sem redistribuição automática nem criação de empresas exemplificativas. A migration não apaga clientes ou acessos. Para rollback, avaliar os registros criados após a publicação antes de restaurar o backup; não remover a coluna de empresa com dados novos.

## Validação e limites

O teste `companies.test.ts` executa migrations reais em PostgreSQL descartável e verifica cadastro, perfis por empresa, CNPJ composto, configurações/templates/metas independentes, bloqueio de links cruzados, tentativas de escalada e revogação em apenas uma empresa. O teste de interface usa o app completo com API simulada e cobre troca/cancelamento, gravação na empresa selecionada, seleção persistente, Central coerente e criação de operação vazia.

Ainda não há transferência ou compartilhamento de clientes entre empresas, visão consolidada do grupo, múltiplos contratos por cliente, branding independente ou SDR conversacional completo. As regras atuais de colaboração dentro de uma empresa permanecem; o isolamento desta entrega é entre empresas. Endpoints externos não foram acionados com envios reais.

No projeto compartilhado existente, as migrations anteriores do CRM foram aplicadas manualmente. Não executar db push indiscriminadamente contra esse projeto; conferir o histórico antes de futuras aplicações. A migration de multiempresas foi registrada individualmente após a execução transacional.
