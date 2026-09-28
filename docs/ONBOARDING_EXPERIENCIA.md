# Onboarding do cliente

A área usa a empresa em operação e preserva as jornadas, permissões e integrações existentes. A tela inicial sem clientes apresenta orientação em três passos, acesso à importação de carteira e à base, e prévia de um modelo disponível. A prévia não cria fases ou clientes.

## Fluxo
1. Em Importar carteira de clientes, selecionar Clientes da carteira. Contratos ganhos também entram na seleção.
2. Revisar os modelos pelo atalho que abre Configurações diretamente em Jornadas.
3. Selecionar um cliente e conferir modelo, início, responsável e previsão dos prazos antes de confirmar. Prazos de zero dias são preservados; data vazia impede a criação.
4. Acompanhar o progresso e a próxima fase. Indicadores filtram a carteira e buscas sem resultado não deixam uma jornada de outro cliente visível.
5. Abrir a fase para atualizar andamento, prazos, responsável, anexos e comentários. A tela leva o foco aos detalhes e confirma o descarte de alterações ao trocar a seleção dentro do onboarding.

Falhas de criação preservam a configuração para nova tentativa. Uma falha ao concluir não altera o progresso. Avisos e convites dependem das integrações existentes; mensagens de sucesso da interface não afirmam entrega de e-mail sem confirmação.

## Validação e implantação
Testes de interface em 1440 e 390 px cobrem estado vazio, recuperação de falha de leitura, atalhos, prévia, início com erro e nova tentativa, conclusão com erro, progresso, busca e Minhas fases. Transportes simulados, sem envios reais. Publicação exclusivamente do frontend; sem migrations, credenciais ou alterações de flags. Book Antiqua preservada.
