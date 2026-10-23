# QR de Pagamento Personalizado

Gerador de QR Code Pix estático com valor embutido. Quem paga só escaneia o código no app do banco e confirma, sem digitar chave nem valor.

A ideia é facilitar pagamentos recorrentes para muitas pessoas, como comissões de funcionários: cada pessoa tem sua chave Pix e um valor, e o sistema gera o QR pronto.

## Como usar

Abra o `index.html` no navegador e preencha:

- **Tipo de chave e chave Pix** (e-mail, CPF/CNPJ, celular ou chave aleatória)
- **Nome do recebedor** (até 25 caracteres)
- **Cidade** (até 15 caracteres)
- **Valor**
- **Identificador** (opcional, até 25 caracteres alfanuméricos)

O QR Code e o código "Pix copia e cola" são atualizados na hora.

## Como funciona

O QR segue o padrão BR Code do Banco Central (EMV QRCPS-MPM). Cada campo é escrito como `ID + tamanho + conteúdo`:

| ID | Campo |
|----|-------|
| 00 | Formato do payload (`01`) |
| 26 | Conta Pix: `br.gov.bcb.pix` + chave |
| 52 | Categoria (`0000`) |
| 53 | Moeda (`986` = BRL) |
| 54 | Valor |
| 58 | País (`BR`) |
| 59 | Nome do recebedor |
| 60 | Cidade |
| 62 | Identificador da transação (`***` quando não há) |
| 63 | CRC16-CCITT do payload |

A geração é feita inteiramente no navegador. Nenhum dado é enviado para servidor.

## Observações

- Formato das chaves: CPF/CNPJ só com números, celular como `+5511999999999`, e-mail em minúsculas. A página já normaliza isso.
- Em QR estático, alguns bancos permitem editar o valor antes de confirmar. Ele vem preenchido, mas não fica travado.
- Faça o primeiro teste com um valor baixo, como R$ 1,00.

## Próximos passos

- Versão em lote: ler uma lista de pessoas (planilha ou banco de dados) e gerar um QR para cada uma.
