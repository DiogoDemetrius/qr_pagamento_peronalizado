# QR de Pagamento Personalizado

Sistema para pagar comissões por Pix sem digitar nada: cada funcionário tem sua chave e seu valor, o sistema gera um QR Code Pix com o valor embutido, quem paga escaneia no app de qualquer banco e confirma. Depois, o pagamento é confirmado no sistema manualmente, pelo extrato ou pela API do banco.

## O que tem

- **Funcionários**: cadastro com chave Pix (CPF, CNPJ, e-mail, celular ou aleatória), comissão **fixa** (valor no cadastro) ou **variável** (valor por competência).
- **Comissões variáveis**, de quatro formas:
  - lançamento manual na tela;
  - planilha CSV ou Excel (`.xlsx`);
  - webhook, para outro sistema (CRM, ERP, automação) enviar os valores;
  - consulta a outro banco de dados (Postgres ou MySQL).
- **Pagamentos**: geração do lote da competência (um QR por funcionário), QR individual, Pix copia e cola, modo "pagar em sequência" (escaneia, confirma e já abre o próximo), cancelamento e desfazer confirmação.
- **Conciliação**: importa o extrato da conta que paga (OFX ou CSV) ou busca pela API do Inter Empresas, e confirma automaticamente os pagamentos que encontrar.
- **Painel**: previsto, pago e pendente da competência, pendências (prontos para gerar, sem comissão lançada, pendentes há dias, saídas do extrato sem correspondência), pagamentos por dia e por competência.
- **Gerador avulso** (`/gerador`): a página simples original, que roda sem servidor.

## Requisitos

- Node.js 18 ou mais novo
- PostgreSQL 13 ou mais novo (tem um `docker-compose.yml` pronto)

## Como rodar

```bash
cp .env.example .env          # ajuste DATABASE_URL, ADMIN_USER e ADMIN_PASSWORD
docker compose up -d          # opcional: sobe um Postgres local
npm install
npm run migrate               # cria as tabelas
npm run seed                  # opcional: funcionários de exemplo (apaga os dados!)
npm start                     # http://localhost:3000
```

O painel pede usuário e senha (`ADMIN_USER` / `ADMIN_PASSWORD`). Em produção, rode atrás de HTTPS.

### Migrations

| Comando | O que faz |
|---|---|
| `npm run migrate` | aplica as migrations pendentes |
| `npm run migrate:rollback` | desfaz o último lote |
| `npm run migrate:status` | mostra o que já foi aplicado |

As migrations ficam em `migrations/` e usam [Knex](https://knexjs.org). Tabelas:

| Tabela | Conteúdo |
|---|---|
| `funcionarios` | cadastro, chave Pix, modo e valor da comissão, referência em outro sistema |
| `comissoes` | valor variável por funcionário e competência (`AAAA-MM`), com a origem |
| `pagamentos` | cada Pix gerado: valor, txid, BR Code, situação (`pendente`, `pago`, `cancelado`), como foi confirmado |
| `importacoes_extrato` | cada arquivo ou consulta de extrato importada |
| `transacoes_extrato` | saídas do extrato e o pagamento a que correspondem |

Regras garantidas pelo banco: um pagamento ativo por funcionário e competência, pagamento pago sempre com data e forma de confirmação, valores maiores que zero.

## Fluxo do mês

1. Cadastre os funcionários (uma vez).
2. Lance as comissões variáveis da competência (tela, planilha, webhook ou outro banco).
3. Em **Pagamentos**, clique em **Gerar lote**.
4. Clique em **Pagar em sequência**: escaneie cada QR no app do banco, pague e clique em **Pago, próximo**.
5. Ou pague tudo e depois importe o extrato em **Conciliação** para confirmar de uma vez.

## Fontes de comissão

### Planilha

CSV (`;` ou `,`) ou `.xlsx`, com cabeçalho na primeira linha. Uma coluna que identifique a pessoa e a coluna `valor`:

```csv
documento;ref_externa;email;valor
11144477735;;;850,00
;VEND-02;;1534,90
```

Identificadores aceitos: `funcionario_id`, `documento` (ou `cpf`/`cnpj`), `ref_externa` e `email`. Valores podem estar em `1.234,56` ou `1234.56`. Se a mesma pessoa aparecer mais de uma vez, os valores são somados. Há um modelo em `/modelos/comissoes.csv`.

### Webhook

Defina `WEBHOOK_TOKEN` no `.env`. O outro sistema envia:

```bash
curl -X POST https://seu-servidor/api/webhooks/comissoes \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: SEU_TOKEN" \
  -d '{"competencia":"2026-10","itens":[{"ref_externa":"VEND-02","valor":1534.90}]}'
```

A resposta traz quantos valores foram gravados, os erros (pessoa não encontrada, valor inválido) e avisos.

### Outro banco de dados

Defina no `.env`:

```env
EXTERNAL_DB_CLIENT=pg            # ou mysql2
EXTERNAL_DB_URL=postgres://leitura:senha@host:5432/vendas
EXTERNAL_DB_QUERY=select vendedor_id as ref_externa, sum(comissao) as valor from vendas where to_char(data_venda, 'YYYY-MM') = :competencia group by vendedor_id
```

A consulta recebe `:competencia` e deve devolver `valor` e uma das colunas de identificação. Use um usuário somente leitura. Evite `::tipo` na consulta (use `cast(x as tipo)`), porque `:` marca parâmetros.

## Confirmação de pagamento

Com QR estático, o banco de quem paga não avisa o sistema sozinho. Por isso há três formas de confirmar:

1. **Manual**: botão "Marcar como pago", com data e comprovante opcional.
2. **Extrato (OFX ou CSV)**: em Conciliação, importe o extrato da conta que paga. Lançamentos repetidos são ignorados.
3. **API do banco (Inter Empresas)**: em Conciliação, escolha o período e clique em "Buscar saídas Pix".

A conciliação automática casa cada saída com um pagamento pendente de **mesmo valor**, nesta ordem: identificador (txid), chave Pix, primeiro e último nome do recebedor e, se só houver um pendente com aquele valor e a saída não trouxer nome, pelo valor. Em caso de empate, nada é confirmado sozinho: a saída fica "sem correspondência" e pode ser vinculada à mão, com sugestões de pagamentos do mesmo valor.

### API do Inter Empresas

No Internet Banking PJ, crie uma integração com o escopo **extrato.read** e baixe o certificado. No `.env`:

```env
INTER_CLIENT_ID=...
INTER_CLIENT_SECRET=...
INTER_CERT_PATH=./certs/inter.crt
INTER_KEY_PATH=./certs/inter.key
# INTER_CONTA_CORRENTE=...   (se a integração tiver mais de uma conta)
```

A pasta `certs/` está no `.gitignore`. A API tem limite de poucas chamadas por minuto; consulte períodos curtos.

## Como o QR é montado

Padrão BR Code do Banco Central (EMV QRCPS-MPM). Cada campo é `ID + tamanho + conteúdo`:

| ID | Campo |
|----|-------|
| 00 | Formato do payload (`01`) |
| 26 | Conta Pix: `br.gov.bcb.pix` + chave + descrição opcional |
| 52 | Categoria (`0000`) |
| 53 | Moeda (`986` = BRL) |
| 54 | Valor |
| 58 | País (`BR`) |
| 59 | Nome do recebedor (até 25) |
| 60 | Cidade (até 15) |
| 62 | Identificador (txid) |
| 63 | CRC16-CCITT |

Observações:

- O app do banco mostra o nome cadastrado na chave Pix, não necessariamente o do QR.
- Em QR estático, alguns bancos deixam editar o valor antes de confirmar.
- Cancelar um pagamento no sistema não invalida a imagem do QR: quem já tem a imagem ainda consegue pagar.

## Testes

```bash
npm test
```

Cobrem a geração do BR Code (inclusive o exemplo oficial do Banco Central), a leitura de extratos OFX e CSV, a leitura de planilhas, as regras de conciliação e a conversão da resposta da API do banco.

## Estrutura

```
migrations/        tabelas (Knex)
seeds/             dados de exemplo
src/
  lib/             BR Code, CSV, extrato e regras de conciliação (sem dependências)
  services/        regras de negócio, banco externo, API do banco, painel
  routes/          API HTTP
  server.js
public/            telas (HTML, CSS e JS sem build)
test/
```
