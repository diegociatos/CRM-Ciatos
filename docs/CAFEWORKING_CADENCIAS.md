# Cadências CafeWorking

A empresa CafeWorking possui dois rascunhos separados no CRM:

- **Indicação de endereço fiscal** — quatro e-mails para escritórios que podem indicar clientes.
- **Rede nacional de parceiros** — seis e-mails para contabilidades, escritórios de advocacia e consultorias com espaço para endereço fiscal e aluguel de salas. Explica a adesão sem custo, o repasse de 75% ou 85% conforme condições da parceria e a divisão via Asaas. Inclui a história da sede ociosa que deu origem ao coworking. Não promete ganhos.

Os textos completos e a configuração de espera estão preservados em `supabase/ops/cafeworking-indicacao.sql` e `supabase/ops/cafeworking-rede-parceiros.sql`. O segundo script atualiza exclusivamente o rascunho indicado e exige que não haja inscrições. Nenhum script liga a cadência ou inscreve contatos.

No aplicativo: escolha **CafeWorking**, abra **Central da IA → Cadências**, e clique em **Ler os e-mails** na campanha. As duas também aparecem no painel inicial da empresa. O agente SDR permanece desligado até configuração explícita.
