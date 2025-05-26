# INPI-Agent

## Descrição

Este projeto contém um agente de inteligência artificial bem simples que tem duas ferramentas: calculadora e acesso à base de dados do Instituto Nacional de Propriedade Intelectual (INPI).

Ele é capaz de lidar com cálculos que requerem diversas passos como "você consegue multiplicar 3x4 e depois dividir o resultado por dois e então adicionar 12 a esse resultado?" e também perguntas que exigem acesso à base de dados do INPI, como "quem detém a marca Nubank?"

## Motivação

O objetivo de publicar esse projeto em português é sobretudo aumentar a visibilidade da linguagem BAML na comunidade brasileira.

Isso, porque BAML apresenta paradigmas relevantes tanto para quem está buscando desenvolver aplicações sofisticadas e altamente integradas a modelos de linguagem, quanto para quem está começando a programar agora. Algumas características relevantes incluem:

1. Prompts são funções: O principal paradígma de BAML é que prompts são funções nas quais você define com clareza a estrutura de dados que um prompt recebe e qual a estrutura de dados que ele retorna. Isso permite um desenvolvimento focado em modelagem de domínio útil para profissionais de LLMOps/AI deployment que atuam em setores complexos como o jurídico, por exemplo.

2. Cada função é testável: Como modelos de linguagem são probabilísticos, é essencial testar diversas variações para garantir que o modelo se comporta de maneira consistente e da forma esperada. BAML tem uma extensão para VSCode que permite iterar facilmente sobre diferentes prompts e assim como em Rust é incentivado que ao final de cada arquivo escreva-se testes para as funções nele contidas.

3. Funciona com qualquer linguagem: O compilador de BAML é escrito em Rust, o que garante uma latência de compilação bem baixa, mas não só permite-se exportar para as principais linguages de programação, como também é possível facilmente configurar uma API REST.

4. Funciona com qualquer modelo: O termo 'Prompt Engineering' de alguma forma passou a ser usado para se referir à alquimia necessaria para extrair o que você precisa dos modelos. O compilador de BAML garante que você vai ter um output alinhado com as estruturas de dados definidas independentemente do comportamento do modelo, o que permite que você passe mais tempo se dedicando à engenharia propriamente dita - explorar diferentes arquiteturas, fluxo de dados, gerenciamento de contexto, ferramentas, etc.

## Stack

- Typescript
- BAML

## Instalação e uso

### Requisitos

- Node
- Git

Caso você precise de ajuda para configurar o ambiente acima, você pode seguir as instruções presentes [aqui](https://www.perplexity.ai/search/instalar-node-no-windows-usand-2IxkJGjETr.yT3WBExh4.g) 

Por enquanto o ambiente para testagem está disponível apenas para VSCode e existe um [syntax highlighter](https://github.com/klepp0/nvim-baml-syntax) criado pela comunidade para Neovim. Suporte para JetBrains e Zed devem vir no futuro.

### Executando o agente

00. Clone o repositório e entre no diretório:

```
git clone https://github.com/oscaromsn/inpi-agent && cd inpi-agent
```

0. Faça uma cópia do `.env.example` e insira a API key do seu modelo de preferência em `.env.local`:

```
cp .env.example .env.local
```

1. Lembre-se de instalar as dependências necessárias:

```
pnpm install
```

O CLI tem dois modos: o principal contém apenas as mensagens finais do agente e você pode iniciar executando:

```
pnpm chat
```

Caso queira também exibir cada chamada ao LLM execute no modo de depuração:

```
pnpm chat -d
```

Para encerrar o agente amigavelmente digite `/exit` ou use seu atalho de saída habitual. Não há persistência entre as conversas, salve você mesmo a conversa conforme julgue necessário.

## Desenvolvimento

O objetivo do repositório é ser um boilerplate simples para prototipação e posterior integração em aplicações maiores. Caso queira se aprofundar no desenvolvimento de agentes usando BAML sugiro fortemente acompanhar o trabalho do [Vaibhav Gupta](https://github.com/hellovai) e [Dexter Horthy](https://github.com/dexhorthy), especialmente a [série de webnars](https://github.com/hellovai/ai-that-works?tab=readme-ov-file) que eles têm feito em conjunto. Os detalhes da arquitetura especificamente usada neste agente está descrita neste [vídeo](https://www.youtube.com/watch?v=yxJDyQ8v6P0).
