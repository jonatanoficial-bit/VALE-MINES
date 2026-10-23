# VALE MINES - FRONTLINE

Campo Minado tático responsivo, em pt-BR, para navegador e PWA. A primeira entrega é uma experiência jogável localmente, com modo solo e operação hotseat de 2 a 10 pessoas no mesmo dispositivo.

## O que está funcional

- Campanha solo: primeira revelação segura, minas aleatórias por seed, flood-fill iterativo, sinalizadores, derrota ao acionar uma mina e revanche.
- Operação local: 2 a 10 participantes, três vidas por participante, rodízio automático a cada ação válida, eliminação individual e placar permanente na tela.
- Pontuação: descoberta manual, bônus limitado do flood-fill, penalidade por mina e validação de sinalizadores no encerramento.
- XP, níveis e patentes locais; ranking local real e histórico mantidos no dispositivo.
- Salvamento automático em IndexedDB (com fallback localStorage), pausa, continuar operação e PWA instalável.
- Visual mobile/desktop com o general apontando para o campo e um posto de comando no fundo.

## Rodar localmente

```bash
pnpm install
pnpm dev
```

Verificações:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Controle

- Clique/toque no setor: revela no modo **Revelar**.
- Botão **Sinalizar**: alterna o modo persistente para bandeiras em telas de toque.
- Clique direito: posiciona/remove sinalizador no desktop.
- Tecla `F` em uma célula focada: posiciona/remove sinalizador.

## Nuvem e multiplayer online

A primeira versão funciona localmente e offline. O arquivo `.env.example` e as regras do Firestore estão incluídos para a próxima fase, mas a sincronização só deve ser ativada depois de configurar um projeto Firebase real. O multiplayer em aparelhos diferentes é futuro e não é anunciado como pronto nesta versão.

## GitHub Pages

Para publicar a versão estática, execute `pnpm build` e distribua o conteúdo de `dist/` em GitHub Pages ou em outra hospedagem estática. Se o app for servido em um subdiretório, ajuste a propriedade `base` em `vite.config.ts` antes do build.
