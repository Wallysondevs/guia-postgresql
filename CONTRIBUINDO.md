# Como contribuir com o Guia PostgreSQL

## Adicionar uma aula

1. Crie `<tema>.html` na raiz copiando a estrutura de uma aula existente (head com tema + script inline de scroll, `<nav class="sidebar">`, `<div class="pager"></div>`, conteúdo, `<script src="assets/site.js?v=1">`).
2. Adicione a página no `NIVEIS` em `assets/site.js`.
3. Missão no psql simulado:

```html
<div class="try" data-goal="TEXTO NA SAÍDA" data-solucao="SELECT …;">
<p class="try-task"><strong>Missão:</strong> …</p>
</div>
```

O simulador (`assets/pgsqlsim.js`) imprime tabelas no formato psql (`+---+` bordas, `(N rows)`), confirmações (`INSERT 0 1`, `UPDATE 3`, `CREATE TABLE`) e erros `ERROR: …`. Confira no pgsqlsim.js a saída exata (ex.: `SELECT * FROM clientes LIMIT 3;` imprime `Ana Souza`; `\dt` imprime `clientes`).

## Padrão de escrita

- Toda aula começa com `<p class="intro">` e `<div class="note">` "Você vai aprender".
- SQL em `<pre class="file">` ou sessão em `<pre class="term">` com prompt `loja_aurora=>`.
- Erros reais em `<div class="warn">`; anatomias em `<dl class="anatomy">`; tabelas em `table.ref`; termine com `div.tip` da próxima aula.

## Testar local

`python3 -m http.server` na pasta e abra `index.html`.
