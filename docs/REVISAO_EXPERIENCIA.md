# Revisão da experiência — 26/09/2026

## Fluxos implementados e verificados

- Novo lead: três etapas, complementos opcionais, fechar no topo, cancelar no rodapé e Escape. Campos obrigatórios identificados. Ações permanecem visíveis no celular.
- Desistência: confirmação quando há alterações, opção de continuar preenchendo e proteção ao sair da página.
- Gravação: falhas retornadas e exceções mantêm o formulário e seus dados. Após sucesso, abre a fila de qualificação com orientação do próximo passo.
- Qualificação: ações com texto, estado vazio orientativo, ausência de cargo/ICP não é apresentada como dado conhecido. No celular, registros se organizam verticalmente.
- Pipeline: abrir pelo nome com teclado; lista para trocar etapa sem arrastar. Mantidas restrições de papel para movimentação.
- Dossiê: fechamento acessível, proteção de rascunhos, edição aguarda persistência, erro permanece visível.
- Agenda: validação, cancelamento protegido, erro mantém dados, fechamento após persistência, duração padrão de 30 minutos preservando duração de atividades editadas.
- Ajuda: acesso pelo menu e topo, três imagens reais dos componentes com dados fictícios, orientações de rotina e perguntas frequentes.
- Tipografia Book Antiqua preservada.

## Validação

Testes locais usam componentes reais com persistência simulada: não criam clientes nem enviam mensagens. Cobrem sucesso, falha retornada, exceção de conexão, cancelamento, Escape, restauração de foco, celular, qualificação, pipeline, agenda e carregamento das imagens de ajuda. A suíte existente cobre dashboard, busca e Central da IA. Testes de backend usam banco isolado e transportes simulados.

## Limites e próximos trabalhos

Esta revisão não equivale a uma certificação de todas as funcionalidades. Falhas reais de rede e RLS são verificadas em testes isolados; não são induzidas em produção. Exclusões permanentes, disparos e edição de dados reais não fazem parte da verificação visual.

Ainda requerem trabalho específico: base de clientes com múltiplos contratos e oportunidades entre serviços; SDR conversacional; integrações de e-mail/WhatsApp; cobertura completa por papel de permissões; testes de leitores de tela; revisão detalhada de importação, configurações, pós-venda e exclusões. Algumas telas legadas ainda usam alertas e gravação otimista. O guia informa explicitamente os limites do modo de simulação.

## Publicação

Nenhuma migração ou secret novo. Executar `npm run typecheck`, `npm test`, `npm run test:ui` e `npm run build`; publicar com o fluxo existente Deploy Cloudflare Pages na branch revisada. As imagens em `public/help/` devem acompanhar o build. Abrir Como usar e Novo Lead para conferir a versão publicada sem salvar dados reais.
