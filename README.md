# Guia PostgreSQL 🐘

Curso de PostgreSQL em português, do zero ao avançado, em **3 níveis + projetos + referência**.

Cada aula mostra o comando SQL com saída real de `psql` e deixa você pratiquer no **psql simulado** (`.try`) — máquina `ana@notebook` com PostgreSQL 16 e o banco fictício `loja_aurora` (tabelas clientes, produtos, pedidos, itens_pedido).

Site 100% estático (HTML + CSS + JS, sem build): abre direto no navegador e funciona no GitHub Pages.

## Estrutura

```
index.html                 página inicial
<tema>.html                uma aula por tema
assets/style.css           visual (tema claro/escuro, cor azul PostgreSQL)
assets/site.js             níveis/menu (NIVEIS), Anterior/Próximo, quiz
assets/pgsqlsim.js         simulador de psql + mini engine SQL
CONTRIBUINDO.md            como escrever uma aula
```

## O que o simulador sabe

Meta-comandos: `\l \dt \d TABELA \c BANCO \du \q \?`
SQL: `CREATE DATABASE/TABLE/VIEW/INDEX`, `INSERT`, `SELECT` (WHERE com = <> > < LIKE IN AND OR, JOIN INNER/LEFT, GROUP BY, HAVING, ORDER BY, LIMIT, COUNT/SUM/AVG/MIN/MAX, AS), `UPDATE`, `DELETE`, `DROP TABLE`, `TRUNCATE`, `BEGIN/COMMIT/ROLLBACK`, `EXPLAIN`.
Erros reais: `relation "x" does not exist`, `duplicate key value violates unique constraint`, foreign key violation, syntax error.

## Limitações

- Mini engine: não cobre todas as funções do PostgreSQL real.
- Transações são simuladas (rollback restaura o estado).

## Publicar no GitHub Pages

Envie a pasta para um repositório e ative **Settings → Pages → Deploy from a branch → main / (root)**.
