# Importação de leads para qualificação

Na Fila de Qualificação, **Importar leads em lote** recebe XLSX (primeira aba), CSV ou CSV colado. O modelo CSV contém os campos escalares do cadastro individual. Razão social, CNPJ, contato e telefone são obrigatórios; e-mails preenchidos precisam ser válidos. CNPJ e telefone devem ser texto no Excel para preservar zeros iniciais. Limites: 10 MB, 10.000 linhas e lotes sequenciais de 100 registros.

Mapeie as colunas e valide antes de importar. A prévia mostra 50 linhas e totais de aptas, erros e importadas. Duplicados por CNPJ ou e-mail do contato são rejeitados, sem atualizar cadastros existentes. A comparação com o banco usa apenas a empresa ativa. Linhas inválidas não impedem a importação das válidas; o relatório CSV contém a linha de origem, motivo e dados para correção. Sócios continuam disponíveis no cadastro individual.

A operação fixa a empresa exibida no diálogo. Trocar de empresa desmonta o diálogo e interrompe os próximos lotes; o lote em andamento pode terminar na empresa original. Parar também espera o lote atual. Falhas de transporte são registradas como resultado não confirmado: reenvie o arquivo para deduplicar antes de repetir. A importação não depende de carregar todos os leads no navegador.

## Banco e permissões

A migração `20261014170000_bulk_qualification.sql` adiciona `crm.bulk_qualification(org, rows, preview)`. A função usa `security invoker`, verifica associação ativa e mantém RLS, limites contratuais e restrições existentes. O navegador usa o JWT do usuário, sem service role. A política atual permite criar leads aos membros ativos, como no cadastro individual. O lock transacional por empresa serializa importações concorrentes; CNPJ também possui índice único por organização. O mesmo contato pode existir em empresas distintas.

O servidor revalida campos obrigatórios, CNPJ numérico ou alfanumérico, e-mail e duplicidades mesmo após a prévia. Cria prospects em `Qualificação`, `in_queue=true`, pertencentes ao usuário autenticado. Não insere inscrições em cadências, trabalhos de envio ou fila SDR. Não altera o cadastro individual nem o importador da carteira de clientes.

## Validação antes da produção

1. Aplicar a migração em ambiente de homologação e publicar a branch nesse ambiente.
2. Validar com Graziela o modelo, upload, colagem, mapeamento, prévia e relatório, usando dados de teste.
3. Conferir os leads na Fila de Qualificação da empresa escolhida e testar outro usuário e outra empresa.
4. Testar arquivo repetido, dados inválidos, parada e falha de conexão. Confirmar ausência de e-mails e inscrições automáticas.
5. Publicar em produção somente após validação explícita. Este PR não aplica migrações nem faz deploy.

Testes automatizados: parser e validadores; RPC real em Postgres embarcado com migrações e RLS; upload XLSX, colagem, relatório, falha de permissão, mapeamento e lotes no navegador com transporte simulado. Estes testes não substituem homologação no Supabase de teste.
