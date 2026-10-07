# Elmavere Lead Agent

Ferramenta local para Windows que, com um clique, gera uma lista de **50 PMEs portuguesas qualificadas e sem website**, escreve uma **mensagem de WhatsApp personalizada** para cada uma e põe tudo numa **Google Sheet** pronta para enviar à mão.

> **Regra inegociável: o sistema NUNCA envia mensagens.**
> Não usa whatsapp-web.js, Baileys, APIs não oficiais, a Cloud API do WhatsApp, simulação de teclado/rato nem temporizadores. Cada linha da folha tem um link `wa.me` que abre a conversa no WhatsApp Desktop com o texto já escrito. É você que carrega em Enter.

---

## Índice

1. [O que faz, passo a passo](#1-o-que-faz-passo-a-passo)
2. [Requisitos e instalação](#2-requisitos-e-instalação)
3. [Obter as chaves (passo a passo)](#3-obter-as-chaves-passo-a-passo)
   - 3.1 [Google Places API (New) com limite de faturação](#31-google-places-api-new-com-limite-de-faturação)
   - 3.2 [API da Anthropic](#32-api-da-anthropic)
   - 3.3 [Conta de serviço Google + Google Sheets API + partilha da folha](#33-conta-de-serviço-google--google-sheets-api--partilha-da-folha)
   - 3.4 [Preencher o `.env`](#34-preencher-o-env)
4. [Testar por fases antes de gastar](#4-testar-por-fases-antes-de-gastar)
5. [Atalho no ambiente de trabalho](#5-atalho-no-ambiente-de-trabalho)
6. [Como usar a Google Sheet](#6-como-usar-a-google-sheet)
7. [Personalizar](#7-personalizar)
8. [Lista de bloqueio](#8-lista-de-bloqueio)
9. [Custos estimados](#9-custos-estimados)
10. [Resolução de problemas comuns](#10-resolução-de-problemas-comuns)
11. [Dados guardados e termos da Places API](#11-dados-guardados-e-termos-da-places-api)
12. [Para programadores](#12-para-programadores)

---

## 1. O que faz, passo a passo

| Etapa | O quê | Custo |
|---|---|---|
| 1. Encontrar candidatos | Sorteia combinações **categoria × cidade** ainda não usadas nesta execução (95 setores × 120 concelhos com mais de ~20 mil habitantes, incluindo Açores e Madeira) e faz uma *Text Search* na Places API (New). | Google |
| 2. Filtros | Ver tabela abaixo. Quem falha é descartado e fica em `logs/descartados-AAAA-MM-DD.csv` com o motivo. | — |
| 3. Repor até 50 | Se um candidato falhar, procura outro, até ter exatamente 50 aprovados, sem duplicados. | — |
| 4. Ordenar | Pontuação 0–100 (mais avaliações e melhor nota pontuam mais; preço MODERATE ou acima dá bónus; sem preço não penaliza). | — |
| 5. Mensagens | O Claude (`claude-sonnet-5-5`) escreve as mensagens seguindo `instrucoes-mensagens.md`. Teste A/B: 25 A + 25 B, alternados pela ordem de pontuação. Cada mensagem é validada e, se falhar, regenerada. | Anthropic |
| 6. Google Sheet | Separador novo `AAAA-MM-DD HHhMM`, link "Abrir no WhatsApp", lista pendente de Estado com cores e um separador fixo "Resumo". | — |

**Filtros (quem falha é descartado):**

| # | Filtro | Como |
|---|---|---|
| 1 | `businessStatus = OPERATIONAL` | Dados do Google |
| 2 | ≥ 30 avaliações e nota ≥ 4,2 | Dados do Google |
| 3 | Telemóvel português (91, 92, 93, 96). Fixos são descartados | Normalização do número |
| 4 | Sem website próprio (Facebook, Instagram, Booksy, Fresha, TheFork, TripAdvisor, linktr.ee, sites.google.com, business.site, negocio.site e wa.me **não contam** como site) | `config.json` |
| 5 | Uma só loja: nome de cadeia (`config/cadeias.json`), ou o mesmo nome noutro `place_id` em Portugal | Lista local + pesquisa do nome |
| 6 | Verificação na web com o Claude + pesquisa web: domínio próprio, várias lojas, franquia ou fechado → descarta. Confiança "baixa" → segunda pesquisa com outra formulação antes de decidir | Anthropic |
| 7 | DNS + HTTP aos domínios óbvios (`nomesemespacos.pt/.com`, `nome-com-hifens.pt/.com`). Se responder com o nome ou o telemóvel do negócio → descarta | Grátis |
| 8 | Lista de bloqueio permanente (`data/bloqueados.csv`) | Grátis |

> Para poupar dinheiro, os filtros grátis correm primeiro: 1–4 e 8 com os dados da pesquisa → cadeias e nomes repetidos → *Place Details* (confirma 1–4 com dados frescos) → pesquisa do nome → **7 (DNS, grátis)** → **6 (Claude, o mais caro) em último lugar**.

---

## 2. Requisitos e instalação

**Precisa de:**

- Windows 10 ou 11.
- **Node.js 22 LTS** (funciona com Node 20 ou mais recente). Descarregue o instalador "LTS" em <https://nodejs.org> e aceite as opções por defeito.
- WhatsApp Desktop (Microsoft Store), com sessão iniciada.
- Uma conta Google (para a Google Sheet e o Google Cloud) e um cartão para ativar a faturação.

**Instalação:**

1. Copie a pasta do projeto para, por exemplo, `C:\Elmavere\lead-agent` (evite pastas sincronizadas pelo OneDrive, que bloqueiam a base de dados SQLite durante a sincronização).
2. Abra o **Terminal** (ou PowerShell) nessa pasta:
   > **[Ecrã]** No Explorador de Ficheiros, abra a pasta, clique com o botão direito num espaço vazio e escolha **"Abrir no Terminal"**.
3. Instale as dependências:
   ```powershell
   npm install
   ```
   Deve terminar sem erros (avisos `npm warn` são normais).
4. Crie o ficheiro de configuração das chaves:
   ```powershell
   copy .env.example .env
   ```
5. Siga a secção 3 para obter as chaves e preencher o `.env`.

---

## 3. Obter as chaves (passo a passo)

As 3 chaves ficam **só** no ficheiro `.env` (e o JSON da conta de serviço na pasta `credenciais\`). Os dois estão no `.gitignore` e nunca aparecem no código.

### 3.1 Google Places API (New) com limite de faturação

**a) Criar o projeto**

1. Vá a <https://console.cloud.google.com> e entre com a sua conta Google.
2. No topo, ao lado do logótipo "Google Cloud", clique no seletor de projetos → **Novo projeto**.
   > **[Ecrã]** Janela "Selecionar um projeto" com a lista de projetos e, no canto superior direito, o botão **NOVO PROJETO**.
3. Nome: `Elmavere Lead Agent` → **Criar**. Espere pela notificação e selecione o projeto novo no seletor.

**b) Ativar a faturação**

1. Menu ☰ (canto superior esquerdo) → **Faturação**.
2. Se ainda não tiver uma conta de faturação: **Gerir contas de faturação → Criar conta**, preencha os dados e o cartão.
   > **[Ecrã]** Página "Faturação" com a mensagem "Este projeto não tem uma conta de faturação" e o botão **ASSOCIAR UMA CONTA DE FATURAÇÃO**.
3. Associe a conta de faturação ao projeto `Elmavere Lead Agent`.

**c) Ativar a Places API (New)**

1. Menu ☰ → **APIs e serviços → Biblioteca**.
2. Pesquise **"Places API (New)"** e abra o resultado com esse nome exato.
   > **[Ecrã]** Lista de resultados com dois cartões: "Places API" (antiga) e **"Places API (New)"**. Escolha o segundo.
3. Clique em **Ativar**.

**d) Criar e restringir a chave**

1. Menu ☰ → **APIs e serviços → Credenciais → + Criar credenciais → Chave de API**.
   > **[Ecrã]** Janela "Chave de API criada" com a chave (começa por `AIza…`) e o botão **Editar chave de API**.
2. Clique em **Editar chave de API**:
   - Nome: `lead-agent-places`.
   - **Restrições da API → Restringir chave** → selecione apenas **Places API (New)** → OK.
   - (Opcional) **Restrições de aplicações → Endereços IP** e indique o IP público da sua ligação. Se o IP mudar com frequência, deixe "Nenhuma".
   - **Guardar**.
   > **[Ecrã]** Página "Editar chave de API" com a secção "Restrições da API", a opção "Restringir chave" marcada e a lista pendente com "Places API (New)" selecionada.
3. Copie a chave para o `.env` em `GOOGLE_PLACES_API_KEY=`.

**e) Limite de faturação**

O Google Cloud não tem um "teto" de gastos automático: um orçamento só envia alertas. Para ter um limite real, use as duas coisas:

1. **Quotas diárias (limite real):** Menu ☰ → **APIs e serviços → APIs e serviços ativados → Places API (New) → separador "Quotas e limites do sistema"**.
   - Procure as linhas de pedidos **por dia** de **Text Search** (`SearchTextRequest`) e de **Place Details** (`GetPlaceRequest`).
   - Clique nos 3 pontos → **Editar quota** → por exemplo **400 por dia** cada (chega para ~2 execuções de 50 leads por dia).
   > **[Ecrã]** Tabela de quotas com colunas "Quota", "Valor", "Utilização atual"; o menu de 3 pontos de uma linha aberto com a opção **Editar quota**.
2. **Alerta de orçamento:** Menu ☰ → **Faturação → Orçamentos e alertas → Criar orçamento**.
   - Âmbito: só o projeto `Elmavere Lead Agent`; Montante: por exemplo **20 €/mês**; Alertas a 50 %, 90 % e 100 %.
   > **[Ecrã]** Assistente "Criar orçamento" em 3 passos (Âmbito, Montante, Ações), com os limiares de alerta em percentagem.
3. Além disso, o próprio agente tem um limite por execução (`config.json` → `custo.limiteEurPorExecucao`, 3 € por defeito; ver secção 9).

> **Quota gratuita:** a Google oferece um número de pedidos gratuitos por mês e por SKU (à data: 1000/mês para os SKUs "Enterprise" de Text Search e Place Details e 5000/mês para "Text Search Pro"). O agente conta os pedidos de cada mês e não os soma ao custo enquanto estiverem dentro dessa quota. Confirme os valores atuais em <https://developers.google.com/maps/billing-and-pricing/pricing> e ajuste `config.json` se mudarem.

### 3.2 API da Anthropic

1. Vá a <https://console.anthropic.com> (Claude Console) e crie conta / entre.
2. **Carregar créditos:** **Settings → Billing → Buy credits** (por exemplo 10 $). Sem créditos, os pedidos falham com "credit balance is too low".
   > **[Ecrã]** Página "Billing" com o saldo atual, o botão **Buy credits** e a opção "Auto-reload" (deixe-a desligada para nunca gastar mais do que carregou).
3. **Limite de gastos:** **Settings → Limits → Spend limit** → defina, por exemplo, **20 $ por mês**.
   > **[Ecrã]** Página "Limits" com o limite mensal da organização e o botão **Change limit**.
4. **Criar a chave:** **API keys → Create key** → nome `elmavere-lead-agent` → **Add**.
   > **[Ecrã]** Janela com a chave completa (começa por `sk-ant-…`) e o aviso de que só é mostrada uma vez, com um botão **Copy key**.
5. Copie a chave para o `.env` em `ANTHROPIC_API_KEY=`. Se a perder, apague-a e crie outra.

### 3.3 Conta de serviço Google + Google Sheets API + partilha da folha

A conta de serviço é um "utilizador robô" que escreve na sua folha. Use o mesmo projeto do passo 3.1.

**a) Ativar a Google Sheets API**

1. Menu ☰ → **APIs e serviços → Biblioteca** → pesquise **"Google Sheets API"** → **Ativar**.

**b) Criar a conta de serviço**

1. Menu ☰ → **IAM e administração → Contas de serviço → + Criar conta de serviço**.
   > **[Ecrã]** Formulário "Detalhes da conta de serviço" com os campos Nome, ID e Descrição.
2. Nome: `elmavere-lead-agent` → **Criar e continuar**.
3. No passo "Conceder acesso a este projeto" **não escolha nenhuma função** → **Continuar → Concluído**. (A conta só precisa de acesso à folha, que lhe vai dar ao partilhar.)
4. Na lista, clique na conta criada e **copie o e-mail** (algo como `elmavere-lead-agent@elmavere-lead-agent.iam.gserviceaccount.com`).

**c) Descarregar a chave JSON**

1. Na página da conta de serviço → separador **Chaves → Adicionar chave → Criar nova chave → JSON → Criar**.
   > **[Ecrã]** Janela "Criar chave privada" com as opções JSON (selecionada) e P12, e o botão **CRIAR**. O navegador descarrega um ficheiro `.json`.
2. Mova esse ficheiro para a pasta `credenciais\` do projeto e mude-lhe o nome para `conta-servico.json`.
3. No `.env`: `GOOGLE_SERVICE_ACCOUNT_JSON=./credenciais/conta-servico.json`.

> Se aparecer "A criação de chaves de contas de serviço está desativada", a sua conta pertence a uma organização Google Workspace com a política `iam.disableServiceAccountKeyCreation`. Ver secção 10.

**d) Criar e partilhar a Google Sheet**

1. Em <https://sheets.google.com> crie uma folha em branco, por exemplo **"Elmavere — Leads"**.
2. Clique em **Partilhar** (canto superior direito), cole o **e-mail da conta de serviço**, escolha **Editor**, desmarque **"Notificar pessoas"** e clique em **Partilhar**.
   > **[Ecrã]** Janela "Partilhar" com o e-mail `…@….iam.gserviceaccount.com` no campo de pessoas, a lista pendente de função em **Editor** e a caixa "Notificar pessoas" desmarcada.
3. Copie o **ID da folha** — a parte do endereço entre `/d/` e `/edit`:
   `https://docs.google.com/spreadsheets/d/`**`1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789`**`/edit#gid=0`
4. No `.env`: `SHEET_ID=1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789` (também aceita o URL completo).

Não precisa de criar separadores: o agente cria o "Resumo", um separador escondido "Todas" (usado pelas fórmulas do Resumo) e um separador por execução.

### 3.4 Preencher o `.env`

Abra o `.env` no Bloco de Notas e confirme que ficou assim (com os seus valores):

```ini
GOOGLE_PLACES_API_KEY=AIza...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_SERVICE_ACCOUNT_JSON=./credenciais/conta-servico.json
SHEET_ID=1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789
```

`GOOGLE_SERVICE_ACCOUNT_JSON` também aceita o conteúdo JSON completo numa só linha, em vez do caminho.

---

## 4. Testar por fases antes de gastar

Corra estes comandos no Terminal, na pasta do projeto, por esta ordem:

| Fase | Comando | O que faz | Custo aproximado |
|---|---|---|---|
| 1 | `npm run testar-ligacoes` | Testa as 3 APIs (1 pesquisa Places, 1 pedido curto ao Claude, cria e apaga um separador temporário na folha) | < 0,05 € |
| 2 | `npm run so-pesquisa` | Pesquisa + filtros 1–5 até 5 candidatos, mostrados no terminal (sem verificação web nem mensagens) | Google (normalmente dentro da quota gratuita) |
| 3–4 | `npm run ensaio` | **Modo de ensaio:** 5 leads completos (filtros 1–8 + mensagens), mostrados no terminal e gravados em `out\ensaio-….csv`. **Não escreve na folha nem na lista de bloqueio** | ~0,3–0,6 € |
| 5 | `npm run gerar` | Execução real: 50 leads, separador novo na folha | ver secção 9 |
| 6 | `npm run atalho` | Cria o atalho no ambiente de trabalho | — |

Outras opções: `npm run gerar -- --dry-run --n 10` (ensaio com 10), `npm run gerar -- --n 20` (execução real com 20).

No fim de cada execução aparece o resumo de custos, incluindo o **custo médio por lead**, para poder calibrar o limite.

---

## 5. Atalho no ambiente de trabalho

```powershell
npm run atalho
```

Cria dois atalhos no ambiente de trabalho:

- **Gerar 50 leads** — abre uma consola com o progresso legível:
  ```
  10:42:13 Encontrados 23/50 – a verificar Barbearia X, Braga…
  10:42:21 ✔ Aprovado: Barbearia X, Braga (Barbearia) — 24/50
  ```
  No fim aparece a notificação do Windows **"Lista pronta: 50 leads na Google Sheet"** (clicar abre a folha). A janela fica aberta até carregar numa tecla.
- **Ensaio (5 leads)** — o mesmo que `npm run ensaio`.

Os atalhos chamam `gerar-leads.cmd`, que pode também abrir com duplo clique.

---

## 6. Como usar a Google Sheet

Cada execução cria um separador `AAAA-MM-DD HHhMM` com as colunas:

**Nº | Bloco | Negócio | Setor | Cidade | Telemóvel | Nota | Nº avaliações | Preço Google | Link Google Maps | Versão (A/B) | Mensagem | Abrir no WhatsApp | Estado | Notas**

- **Bloco:** os primeiros 25 (melhor pontuação) são "Manhã (10h–12h)" e os restantes "Tarde (15h–17h)". A/B fica equilibrado em cada bloco. A saudação acompanha o bloco ("bom dia" de manhã, "boa tarde" à tarde).
- **Abrir no WhatsApp:** fórmula `HYPERLINK` para `https://wa.me/351XXXXXXXXX?text=…`, que lê o texto da coluna Mensagem — se editar a mensagem na folha, o link passa a abrir com o texto novo. No Windows abre o WhatsApp Desktop com a mensagem já escrita (se abrir primeiro o navegador, clique em "Abrir WhatsApp" e marque "Permitir sempre"). **Reveja e carregue em Enter.**
- **Estado:** lista pendente *Por enviar / Enviado / Respondeu / Interessado / Não interessado / Cliente*, com a linha colorida por estado. Atualize-a à medida que envia e recebe respostas.
- **Notas:** livre para si. Se alguma mensagem não tiver passado na validação automática, aparece aqui um aviso "ATENÇÃO: rever a mensagem".

**Separador "Resumo"** (fixo, com fórmulas que somam todas as execuções):

- Por versão (A, B e total): leads, enviados, respostas, **taxa de resposta**, interessados e clientes.
- Por setor: leads, enviados, respostas, taxa de resposta e taxa de cada versão.

"Enviados" conta tudo o que não está em "Por enviar"; "respostas" conta Respondeu, Interessado, Não interessado e Cliente.

---

## 7. Personalizar

| Ficheiro | Para quê |
|---|---|
| `instrucoes-mensagens.md` | **As regras das mensagens.** É lido em cada execução: reescreva-o à vontade (tratamento, versão A, ângulo da versão B…). |
| `config.json` | Nº de leads, limite de custo, filtros (avaliações, nota, prefixos, domínios que não contam como site), modelo, esforço, validação das mensagens (máx. de frases, palavras proibidas), nomes dos blocos e estados. |
| `config/categorias.json` | Setores: `setor` (nome na folha), `termo` (o que se pesquisa) e `tipo` opcional da Places API. |
| `config/cidades.json` | Concelhos. `consulta` resolve ambiguidades (ex.: "Lagoa, Algarve"). |
| `config/cadeias.json` | Cadeias e franquias a excluir (comparação por palavras completas, sem acentos nem maiúsculas). |

Validação automática de cada mensagem (se falhar, o Claude reescreve com o motivo, até 4 vezes):
tem o nome do negócio · não tem links nem domínios · não passa de `maxFrases` (a saudação inicial "Olá, boa tarde." não conta, porque a própria versão A base tem 4 frases contando com ela) · sem emojis · sem as `palavrasProibidas` ("grátis", "de graça", …).

> Se mudar os nomes dos estados em `config.json`, mantenha a ordem: o primeiro é o estado inicial; do segundo em diante contam como "enviados"; do terceiro em diante como "respostas".

---

## 8. Lista de bloqueio

`data/bloqueados.csv` bloqueia para sempre `place_id`s e telefones. Já vem com o Moto Kit:

```csv
tipo,valor,nota
telefone,+351962697356,Moto Kit
```

- **Tudo o que entra na folha é acrescentado automaticamente** (place_id + telemóvel), para nunca se repetir. Os ensaios não acrescentam nada.
- **Acrescentar à mão:** abra o ficheiro no Bloco de Notas e junte linhas `telefone,+3519XXXXXXXX,nota` ou `place_id,ChIJ…,nota`. O número pode estar em qualquer formato (`912 345 678`, `+351912345678`…).
- **Importar listas antigas:** exporte a folha antiga para CSV (Ficheiro → Transferir → CSV) ou junte os números num `.txt`, e corra:
  ```powershell
  npm run importar-bloqueados -- "C:\Users\Martim\Downloads\lista-antiga.csv"
  ```
  O comando encontra todos os números portugueses no ficheiro (em qualquer coluna) e acrescenta os que ainda não estão bloqueados. Pode passar vários ficheiros de uma vez.

---

## 9. Custos estimados

O agente conta **cada pedido** à Places API e à Anthropic e mostra no fim o custo estimado (em euros, câmbio em `config.json`). Os preços estão em `config.json` → `custo.precosUsd`; confirme-os de vez em quando:
Google: <https://developers.google.com/maps/billing-and-pricing/pricing> · Anthropic: <https://www.anthropic.com/pricing>.

**Estimativa para uma execução de 50 leads** (depende muito da taxa de aprovação de cada setor/cidade):

| | Pedidos típicos | Preço de tabela | Custo típico |
|---|---|---|---|
| Google — Text Search (campos completos) | 60–90 | 35 $/1000 | **0 €** dentro da quota gratuita (≈ 10 execuções/mês); fora dela ~2–3 € |
| Google — Place Details | 80–100 | 20 $/1000 | **0 €** dentro da quota; fora dela ~1,5–2 € |
| Google — pesquisa do nome (filtro 5) | 80–100 | 32 $/1000 | **0 €** dentro da quota (5000/mês); fora dela ~2,5–3 € |
| Anthropic — verificação web (filtro 6) | 70–90 verificações, 1–3 pesquisas cada | 2 $/10 $ por milhão de tokens + 10 $/1000 pesquisas | **~2,5–4,5 €** |
| Anthropic — mensagens | 1–2 pedidos | | ~0,05 € |
| **Total** | | | **~2,5–4,5 €** dentro da quota gratuita da Google; ~9–12 € sem ela |

**Atenção ao limite por defeito de 3 €:** com estes valores, uma execução de 50 leads pode chegar ao limite antes do fim. Quando isso acontece, o agente **para de procurar, avisa, e escreve na folha os leads já aprovados** (a notificação diz "Lista parcial"). Recomendo:

1. Correr `npm run ensaio` e ver o "Custo médio por lead aprovado".
2. Ajustar `custo.limiteEurPorExecucao` em `config.json` (por exemplo para 5 €), ou reduzir custos:
   - `anthropic.maxPesquisasWebPorVerificacao`: 3 → 2;
   - `filtros.verificarNomeDuplicadoEmPortugal: false` (poupa um pedido Google por candidato; o filtro 6 continua a detetar várias lojas).

O agente guarda uma reserva (`reservaEurParaMensagens`) para conseguir sempre escrever as mensagens dos leads já encontrados.

---

## 10. Resolução de problemas comuns

| Sintoma | Solução |
|---|---|
| `'node' não é reconhecido…` | Instale o Node.js LTS (secção 2) e **feche e volte a abrir** o Terminal. |
| `npm install` falha em `better-sqlite3` | Use o Node 22 LTS (tem binários pré-compilados). Se mesmo assim falhar, instale as "Ferramentas de compilação do Visual Studio" (opção "Desenvolvimento de ambiente de trabalho com C++") e repita. |
| `Faltam variáveis no ficheiro .env` | Confirme que o ficheiro se chama exatamente `.env` (não `.env.txt`: no Explorador ative "Ver → Extensões de nomes de ficheiros"). |
| Google Places **403 / PERMISSION_DENIED / "has not been used"** | Ative a **Places API (New)** (não a antiga "Places API") no mesmo projeto da chave; confirme que a faturação está associada; nas restrições da chave tem de estar "Places API (New)". Se restringiu por IP, confirme o seu IP atual. |
| Google Places **429 / RESOURCE_EXHAUSTED** | Atingiu a quota diária que definiu (3.1-e). Aumente-a ou espere pelo dia seguinte (hora do Pacífico). |
| Anthropic **401** | Chave errada ou apagada: crie outra (3.2). |
| Anthropic **"credit balance is too low"** | Carregue créditos em Settings → Billing. |
| Anthropic **429** | Muitos pedidos seguidos: espere uns minutos. Contas novas têm limites mais baixos; sobem com o uso. |
| Sheets **"The caller does not have permission"** | Partilhe a folha com o e-mail da conta de serviço como **Editor** (3.3-d). |
| Sheets **404** | `SHEET_ID` errado: copie a parte entre `/d/` e `/edit`. |
| Sheets **"Google Sheets API has not been used…"** | Ative a Google Sheets API no projeto da conta de serviço (3.3-a). |
| Não é possível criar chave da conta de serviço (política da organização) | Use uma conta Google pessoal (Gmail) para o projeto, ou peça ao administrador do Workspace para permitir `iam.disableServiceAccountKeyCreation` neste projeto. |
| Acentos estranhos na consola | Use o atalho ou `gerar-leads.cmd` (ativam UTF-8). No Windows Terminal aparecem bem. |
| A notificação não aparece | Definições → Sistema → Notificações: ative as notificações e desative "Não incomodar"/"Assistente de concentração". Confirme que o Windows PowerShell pode mostrar notificações. |
| O link abre o navegador em vez da app | Instale o WhatsApp Desktop da Microsoft Store; na página do navegador clique em "Abrir WhatsApp" e marque "Permitir sempre". |
| "Limite de custo atingido" | Ver secção 9. A lista parcial é escrita na folha na mesma. |
| Poucos leads / "esgotaram-se as combinações" | Os filtros são exigentes. Acrescente setores/cidades, ou baixe `minAvaliacoes`/`minNota` em `config.json`. |
| Uma mensagem com "ATENÇÃO" nas Notas | Não passou na validação após 4 tentativas. Corrija o texto na coluna Mensagem; o link "Abrir no WhatsApp" passa a usar o texto corrigido. |
| O Resumo mostra `#REF!` depois de apagar um separador | A próxima execução reconstrói as fórmulas. |
| Erro inesperado | Corra `set DEBUG=1` e depois `npm run gerar` para ver o detalhe técnico. Se a escrita na folha falhar, os leads ficam guardados em `out\leads-nao-escritos-….csv`. |

---

## 11. Dados guardados e termos da Places API

- A base de dados local (`data/estado.sqlite`) guarda **apenas** `place_id`, telefone (para o bloqueio) e estado ("lead" ou "descartado", com a data), mais contagens mensais de pedidos para estimar a quota gratuita. Nada de nomes, fotos ou textos de avaliações.
- Descartados recentemente (90 dias, configurável) não voltam a ser verificados, para não pagar duas vezes.
- Não são descarregadas fotos nem textos de avaliações; só os campos do *field mask*:
  `id, displayName, websiteUri, nationalPhoneNumber, internationalPhoneNumber, rating, userRatingCount, priceLevel, businessStatus, primaryType, formattedAddress, googleMapsUri`.
- Os logs de descartes (`logs/`) e os CSV de ensaio (`out/`) são seus ficheiros de trabalho; pode apagá-los quando quiser.

---

## 12. Para programadores

```powershell
npm test            # testes (vitest): telefones, domínios, wa.me, mensagens, filtros, pipeline com APIs simuladas
npm run typecheck   # TypeScript
```

Estrutura:

```
src/
  index.ts              CLI (--dry-run, --n, --so-pesquisa, --testar-ligacoes)
  pipeline.ts           Etapas 1–4 + distribuição A/B e blocos (serviços injetáveis para testes)
  places.ts             Places API (New): Text Search, pesquisa de nome, Place Details
  filtros.ts            Filtros 1–5 (puros)
  telefone.ts           Normalização de números portugueses
  dominios.ts           Domínios que não contam como site
  verificacaoDns.ts     Filtro 7 (DNS + HTTP)
  verificacaoWeb.ts     Filtro 6 (Claude + web search, JSON validado com zod)
  claude.ts             Cliente Anthropic: custo, pause_turn, fallback automático, recusas
  mensagens.ts          Geração das mensagens (saída estruturada + zod + regeneração)
  validacaoMensagens.ts Validação das mensagens
  whatsapp.ts           Link wa.me e fórmula HYPERLINK
  sheets.ts             Separadores, formatação, validação de dados, Resumo
  custo.ts              Contador de pedidos e limite de custo
  baseDados.ts          SQLite (place_id, telefone, estado, uso mensal)
  bloqueio.ts           data/bloqueados.csv
  notificacao.ts        Notificação nativa do Windows (PowerShell, sem dependências)
```

Notas técnicas:

- **Modelo:** `claude-sonnet-5-5`, com esforço `low` na verificação e `medium` nas mensagens (`config.json`).
- **Pesquisa web:** `web_search_20250305` (o pedido original). O Sonnet 5.5 também suporta `web_search_20260209`, com filtragem dinâmica dos resultados; pode mudar em `anthropic.ferramentaPesquisaWeb` e comparar o custo com `npm run ensaio`.
- **Fallback automático:** se o modelo recusar um pedido por engano (classificadores de segurança), o servidor repete-o noutro modelo (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`). Desative com `anthropic.usarFallbackAutomatico: false`. Se a API não aceitar o parâmetro, o agente repete o pedido sem ele.
- **Fórmulas da folha** em sintaxe inglesa (vírgulas), que é a que a API do Google Sheets usa independentemente do idioma da folha.
