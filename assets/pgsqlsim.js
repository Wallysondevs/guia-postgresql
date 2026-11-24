/* =====================================================================
   Guia PostgreSQL — simulador de psql (pgsqlsim.js)
   ---------------------------------------------------------------------
   Terminal fictício ana@notebook@loja_aurora com PostgreSQL 16.
   Suporta meta-comandos (\l \dt \d \c \du \q \?) e SQL:
   CREATE DATABASE/TABLE, INSERT, SELECT (WHERE/ORDER/LIMIT/JOIN/
   GROUP BY/agregações), UPDATE, DELETE, BEGIN/COMMIT/ROLLBACK,
   CREATE INDEX/VIEW, EXPLAIN, DROP, TRUNCATE.
   ===================================================================== */
(function () {
  "use strict";

  var USER = "ana", HOST = "notebook", VERSAO = "16.4";

  function estadoInicial() {
    return {
      bancoAtual: "loja_aurora",
      emTransacao: false,
      bancos: {
        postgres: { tabelas: {} },
        loja_aurora: { tabelas: {
          clientes: {
            colunas: [
              { nome: "id", tipo: "integer", restr: "PRIMARY KEY" },
              { nome: "nome", tipo: "text", restr: "NOT NULL" },
              { nome: "email", tipo: "text", restr: "UNIQUE" },
              { nome: "cidade", tipo: "text", restr: "" },
              { nome: "estado", tipo: "char(2)", restr: "" },
              { nome: "criado_em", tipo: "date", restr: "DEFAULT CURRENT_DATE" }
            ],
            linhas: [
              { id: 1, nome: "Ana Souza", email: "ana@email.com", cidade: "Teresina", estado: "PI", criado_em: "2026-01-10" },
              { id: 2, nome: "Beto Lima", email: "beto@email.com", cidade: "Parnaíba", estado: "PI", criado_em: "2026-02-05" },
              { id: 3, nome: "Carla Reis", email: "carla@email.com", cidade: "São Paulo", estado: "SP", criado_em: "2026-03-12" },
              { id: 4, nome: "Diego Alves", email: "diego@email.com", cidade: "Recife", estado: "PE", criado_em: "2026-05-20" },
              { id: 5, nome: "Eva Nike", email: "eva@email.com", cidade: "Teresina", estado: "PI", criado_em: "2026-08-01" }
            ],
            seq: 6
          },
          produtos: {
            colunas: [
              { nome: "id", tipo: "integer", restr: "PRIMARY KEY" },
              { nome: "nome", tipo: "text", restr: "NOT NULL" },
              { nome: "preco", tipo: "numeric(10,2)", restr: "CHECK (preco >= 0)" },
              { nome: "estoque", tipo: "integer", restr: "DEFAULT 0" }
            ],
            linhas: [
              { id: 1, nome: "Camiseta", preco: 59.90, estoque: 20 },
              { id: 2, nome: "Caneca", preco: 29.90, estoque: 50 },
              { id: 3, nome: "Adesivo", preco: 4.50, estoque: 200 },
              { id: 4, nome: "Poster", preco: 19.90, estoque: 0 },
              { id: 5, nome: "Boné", preco: 49.90, estoque: 15 }
            ],
            seq: 6
          },
          pedidos: {
            colunas: [
              { nome: "id", tipo: "integer", restr: "PRIMARY KEY" },
              { nome: "cliente_id", tipo: "integer", restr: "REFERENCES clientes(id)" },
              { nome: "data", tipo: "date", restr: "DEFAULT CURRENT_DATE" },
              { nome: "status", tipo: "text", restr: "DEFAULT 'pendente'" }
            ],
            linhas: [
              { id: 1, cliente_id: 1, data: "2026-11-20", status: "entregue" },
              { id: 2, cliente_id: 2, data: "2026-11-22", status: "enviado" },
              { id: 3, cliente_id: 1, data: "2026-11-23", status: "pendente" }
            ],
            seq: 4
          },
          itens_pedido: {
            colunas: [
              { nome: "pedido_id", tipo: "integer", restr: "REFERENCES pedidos(id)" },
              { nome: "produto_id", tipo: "integer", restr: "REFERENCES produtos(id)" },
              { nome: "qtd", tipo: "integer", restr: "" },
              { nome: "preco", tipo: "numeric(10,2)", restr: "" }
            ],
            linhas: [
              { pedido_id: 1, produto_id: 1, qtd: 2, preco: 59.90 },
              { pedido_id: 1, produto_id: 3, qtd: 3, preco: 4.50 },
              { pedido_id: 2, produto_id: 2, qtd: 1, preco: 29.90 },
              { pedido_id: 3, produto_id: 5, qtd: 1, preco: 49.90 }
            ],
            seq: 0
          }
        } }
      },
      usuarios: ["postgres (superuser)", "ana (CREATE DATABASE)"]
    };
  }

  var estado = estadoInicial();
  var backupTransacao = null;

  /* ---------- utilidades ---------- */
  function banco() { return estado.bancos[estado.bancoAtual]; }
  function tabela(nome) {
    var b = banco();
    return b && b.tabelas[nome.toLowerCase()];
  }
  function fmt(v) {
    if (v === null || v === undefined) return "";
    if (typeof v === "number") return String(v);
    return String(v);
  }
  function tabelaSaida(colunas, linhas) {
    // colunas: [{nome, largura}]
    var out = "";
    var larguras = colunas.map(function (c) { return Math.max(c.nome.length, 12); });
    linhas.forEach(function (l) {
      larguras = larguras.map(function (w, i) { return Math.max(w, fmt(l[i]).length); });
    });
    function linhaBorda() {
      return "+" + larguras.map(function (w) { return Array(w + 2).join("-"); }).join("+") + "+";
    }
    out += linhaBorda() + "\n";
    out += "|" + colunas.map(function (c, i) { return " " + pad(c.nome, larguras[i]) + " "; }).join("|") + "|\n";
    out += linhaBorda() + "\n";
    linhas.forEach(function (l) {
      out += "|" + l.map(function (v, i) { return " " + pad(fmt(v), larguras[i]) + " "; }).join("|") + "|\n";
    });
    out += linhaBorda() + "\n";
    out += "(" + linhas.length + (linhas.length === 1 ? " row" : " rows") + ")";
    return out;
  }
  function pad(s, n) { s = String(s); while (s.length < n) s += " "; return s; }

  /* ---------- avaliador de WHERE ---------- */
  function literal(tok) {
    tok = tok.trim();
    if (/^'.*'$/.test(tok)) return tok.slice(1, -1);
    if (/^-?\d+(\.\d+)?$/.test(tok)) return parseFloat(tok);
    if (tok === "true") return true;
    if (tok === "false") return false;
    if (tok === "null") return null;
    return tok; // nome de coluna
  }

  // resolve "alias.col" ou "col" para a chave da linha (linhas guardam as duas formas)
  function resolverCol(ref) {
    return ref;
  }
  function campoDe(linha, ref) {
    if (linha[ref] !== undefined) return linha[ref];
    if (ref.indexOf(".") !== -1) return linha[ref.split(".")[1]];
    return undefined;
  }

  function avaliarCond(cond, linha, mapaAlias) {
    function valorDe(ref) { return campoDe(linha, ref); }
    function termo(t) {
      t = t.trim().replace(/^\(|\)$/g, "");
      var m;
      if ((m = /^([\w.]+)\s+LIKE\s+'([^']*)'$/i.exec(t))) {
        var val = valorDe(m[1]);
        var pattern = "^" + m[2].replace(/%/g, ".*").replace(/_/g, ".") + "$";
        return new RegExp(pattern, "i").test(String(val));
      }
      if ((m = /^([\w.]+)\s+IN\s*\(([^)]*)\)$/i.exec(t))) {
        var vals = m[2].split(",").map(literal);
        return vals.indexOf(valorDe(m[1])) !== -1;
      }
      if ((m = /^([\w.]+)\s*(>=|<=|<>|!=|=|>|<)\s*(.+)$/.exec(t))) {
        var a = valorDe(m[1]);
        var b = literal(m[3]);
        if (typeof b === "string" && !/^'/.test(m[3].trim()) && isNaN(Number(m[3])) && m[3].trim() !== "true" && m[3].trim() !== "false" && m[3].trim() !== "null") {
          b = valorDe(m[3]); // lado direito era coluna
        }
        switch (m[2]) {
          case "=": return a === b;
          case "<>": case "!=": return a !== b;
          case ">": return a > b;
          case "<": return a < b;
          case ">=": return a >= b;
          case "<=": return a <= b;
        }
      }
      if ((m = /^NOT\s+(.+)$/i.exec(t))) return !termo(m[1]);
      return !!valorDe(t);
    }
    var orPartes = cond.split(/\s+OR\s+/i);
    return orPartes.some(function (op) {
      return op.split(/\s+AND\s+/i).every(termo);
    });
  }

  /* ---------- parser de valores SQL ---------- */
  function parseValores(str) {
    // separa por vírgula fora de aspas
    var vals = [], cur = "", aspas = false;
    for (var i = 0; i < str.length; i++) {
      var c = str[i];
      if (c === "'") { aspas = !aspas; cur += c; continue; }
      if (c === "," && !aspas) { vals.push(cur.trim()); cur = ""; continue; }
      cur += c;
    }
    if (cur.trim()) vals.push(cur.trim());
    return vals.map(literal);
  }

  /* ---------- comandos SQL ---------- */
  function sqlSelect(rest) {
    var m = /^([\s\S]+?)\s+FROM\s+([\w]+)(?:\s+(?:AS\s+)?(?!WHERE\b|GROUP\b|ORDER\b|LIMIT\b|HAVING\b|JOIN\b|INNER\b|LEFT\b|RIGHT\b|FULL\b|ON\b)(\w+))?([\s\S]*)$/i.exec(rest);
    if (!m) return 'ERROR:  syntax error at or near "' + rest.slice(0, 20) + '"';
    var colsRaw = m[1].trim();
    var tabelaNome = m[2].toLowerCase();
    var alias1 = (m[3] || tabelaNome).toLowerCase();
    var resto = m[4];

    var t = tabela(tabelaNome);
    if (!t) return 'ERROR:  relation "' + tabelaNome + '" does not exist';

    var mapaAlias = {};
    mapaAlias[alias1] = tabelaNome;
    mapaAlias[tabelaNome] = tabelaNome;

    // linhas com chaves simples + prefixadas pelo alias
    var linhas = t.linhas.map(function (l) {
      var o = {};
      for (var k in l) { o[k] = l[k]; o[alias1 + "." + k] = l[k]; }
      return o;
    });

    // JOIN
    var jm = /\s+(INNER\s+|LEFT\s+|RIGHT\s+|FULL\s+)?JOIN\s+([\w]+)(?:\s+(?:AS\s+)?(?!ON\b|WHERE\b|GROUP\b|ORDER\b|LIMIT\b|HAVING\b)(\w+))?\s+ON\s+([\w.]+)\s*=\s*([\w.]+)/i.exec(resto);
    if (jm) {
      var t2nome = jm[2].toLowerCase();
      var alias2 = (jm[3] || t2nome).toLowerCase();
      var t2 = tabela(t2nome);
      if (!t2) return 'ERROR:  relation "' + t2nome + '" does not exist';
      mapaAlias[alias2] = t2nome;
      mapaAlias[t2nome] = t2nome;
      var tipo = (jm[1] || "INNER").trim().toUpperCase();
      var novas = [];
      linhas.forEach(function (l) {
        var v1 = campoDe(l, jm[4]);
        var match = t2.linhas.filter(function (l2) {
          return l2[jm[5].split(".")[1]] === v1;
        });
        match.forEach(function (l2) {
          var o = Object.assign({}, l);
          for (var k in l2) { o[alias2 + "." + k] = l2[k]; }
          novas.push(o);
        });
        if (match.length === 0 && (tipo === "LEFT" || tipo === "FULL")) {
          var o2 = Object.assign({}, l);
          t2.colunas.forEach(function (c) { o2[alias2 + "." + c.nome] = null; });
          novas.push(o2);
        }
      });
      linhas = novas;
      resto = resto.replace(jm[0], " ");
    }

    // WHERE
    var wm = /\s+WHERE\s+([\s\S]+?)(\s+GROUP\s+BY\s+|\s+ORDER\s+BY\s+|\s+LIMIT\s+|\s+HAVING\s+|$)/i.exec(resto);
    if (wm) {
      linhas = linhas.filter(function (l) { return avaliarCond(wm[1], l, mapaAlias); });
      resto = resto.replace(wm[0], " ");
    }

    // GROUP BY
    var gm = /\s+GROUP\s+BY\s+([\w.,\s]+?)(\s+HAVING\s+|\s+ORDER\s+BY\s+|\s+LIMIT\s+|$)/i.exec(resto);
    var groupCols = gm ? gm[1].split(",").map(function (s) { return s.trim(); }) : null;

    // HAVING
    var hm = /\s+HAVING\s+([\s\S]+?)(\s+ORDER\s+BY\s+|\s+LIMIT\s+|$)/i.exec(resto);

    // ORDER BY
    var om = /\s+ORDER\s+BY\s+([\w.,\s]+?)(\s+LIMIT\s+|$)/i.exec(resto);
    var orderCols = om ? om[1].split(",").map(function (s) {
      var p = s.trim().split(/\s+/);
      return { col: p[0], desc: (p[1] || "").toUpperCase() === "DESC" };
    }) : null;

    // LIMIT
    var lm = /\s+LIMIT\s+(\d+)/i.exec(resto);
    var limit = lm ? parseInt(lm[1], 10) : null;

    // colunas de saída
    var outCols = [];
    var agreg = null;
    if (colsRaw === "*") {
      t.colunas.forEach(function (c) { outCols.push({ nome: c.nome, expr: c.nome }); });
    } else {
      colsRaw.split(",").forEach(function (p) {
        var am = /^\s*(COUNT|SUM|AVG|MIN|MAX)\s*\(\s*([\w*]+)\s*\)\s*(?:AS\s+(\w+))?\s*$/i.exec(p);
        if (am) {
          agreg = agreg || [];
          agreg.push({ fn: am[1].toUpperCase(), col: am[2], alias: am[3] || am[1].toLowerCase() + "(" + am[2] + ")" });
          outCols.push({ nome: am[3] || (am[1].toLowerCase() + "(" + am[2] + ")"), agreg: agreg[agreg.length - 1] });
          return;
        }
        var cm = /^\s*([\w.]+)(?:\s+AS\s+(\w+))?\s*$/i.exec(p);
        if (cm) outCols.push({ nome: cm[2] || cm[1], expr: cm[1] });
      });
    }

    // grupos
    var grupos = [linhas];
    if (groupCols) {
      grupos = [];
      var mapa = {};
      linhas.forEach(function (l) {
        var chave = groupCols.map(function (g) { return fmt(campoDe(l, g)); }).join("|");
        if (!mapa[chave]) { mapa[chave] = []; grupos.push(mapa[chave]); }
        mapa[chave].push(l);
      });
    }

    // projeta: com agregação agrupa; sem agregação, uma linha por registro
    var temAgreg = outCols.some(function (c) { return c.agreg; });
    var resultado;
    if (temAgreg || groupCols) {
      resultado = grupos.map(function (g) {
        var primeira = g[0] || {};
        var linha = {};
        outCols.forEach(function (oc) {
          if (oc.agreg) {
            var vals = g.map(function (l) { return campoDe(l, oc.agreg.col); });
            if (oc.agreg.col === "*") vals = g.map(function () { return 1; });
            switch (oc.agreg.fn) {
              case "COUNT": linha[oc.nome] = vals.length; break;
              case "SUM": linha[oc.nome] = vals.reduce(function (a, b) { return a + (Number(b) || 0); }, 0); break;
              case "AVG": linha[oc.nome] = vals.length ? (vals.reduce(function (a, b) { return a + (Number(b) || 0); }, 0) / vals.length).toFixed(2) : null; break;
              case "MIN": linha[oc.nome] = vals.length ? Math.min.apply(null, vals) : null; break;
              case "MAX": linha[oc.nome] = vals.length ? Math.max.apply(null, vals) : null; break;
            }
          } else {
            linha[oc.nome] = campoDe(primeira, oc.expr);
          }
        });
        return linha;
      });
    } else {
      resultado = linhas.map(function (l) {
        var linha = {};
        outCols.forEach(function (oc) { linha[oc.nome] = campoDe(l, oc.expr); });
        return linha;
      });
    }

    // HAVING
    if (hm) {
      resultado = resultado.filter(function (l) { return avaliarCond(hm[1], l, {}); });
    }

    // ORDER BY
    if (orderCols) {
      resultado.sort(function (a, b) {
        for (var i = 0; i < orderCols.length; i++) {
          var c = orderCols[i].col;
          var va = a[c];
          var vb = b[c];
          if (va === vb) continue;
          var cmp = va > vb ? 1 : -1;
          return orderCols[i].desc ? -cmp : cmp;
        }
        return 0;
      });
    }

    if (limit !== null) resultado = resultado.slice(0, limit);

    return tabelaSaida(outCols, resultado.map(function (l) { return outCols.map(function (c) { return l[c.nome]; }); }));
  }

  function sqlInsert(rest) {
    var m = /^([\w]+)\s*(?:\(([^)]*)\))?\s*VALUES\s*\((.+)\)\s*;?\s*$/i.exec(rest);
    if (!m) return 'ERROR:  syntax error at or near "INSERT"';
    var t = tabela(m[1].toLowerCase());
    if (!t) return 'ERROR:  relation "' + m[1].toLowerCase() + '" does not exist';
    var vals = parseValores(m[3]);
    var cols = m[2] ? m[2].split(",").map(function (s) { return s.trim().toLowerCase(); }) : t.colunas.map(function (c) { return c.nome; });
    if (vals.length !== cols.length) return "ERROR:  INSERT has more expressions than target columns";
    var linha = {};
    cols.forEach(function (c, i) { linha[c] = vals[i]; });
    // PK serial
    t.colunas.forEach(function (c) {
      if (c.restr.indexOf("PRIMARY KEY") !== -1 && linha[c.nome] === undefined) linha[c.nome] = t.seq++;
      if (linha[c.nome] === undefined) linha[c.nome] = null;
    });
    // unique email
    if (cols.indexOf("email") !== -1) {
      var dup = t.linhas.some(function (l) { return l.email === linha.email; });
      if (dup) return 'ERROR:  duplicate key value violates unique constraint "' + t.colunas[0].nome + '_"' + '"\nDETAIL:  Key (email)=(' + linha.email + ') already exists.';
    }
    // FK
    if (t === banco().tabelas.pedidos && linha.cliente_id !== null) {
      var ok = banco().tabelas.clientes.linhas.some(function (l) { return l.id === linha.cliente_id; });
      if (!ok) return 'ERROR:  insert or update on table "pedidos" violates foreign key constraint "pedidos_cliente_id_fkey"\nDETAIL:  Key (cliente_id)=(' + linha.cliente_id + ') is not present in table "clientes".';
    }
    t.linhas.push(linha);
    return "INSERT 0 1";
  }

  function sqlUpdate(rest) {
    var m = /^([\w]+)\s+SET\s+([\s\S]+?)(\s+WHERE\s+([\s\S]+))?\s*;?\s*$/i.exec(rest);
    if (!m) return 'ERROR:  syntax error at or near "UPDATE"';
    var t = tabela(m[1].toLowerCase());
    if (!t) return 'ERROR:  relation "' + m[1].toLowerCase() + '" does not exist';
    var sets = m[2].split(",").map(function (s) { return s.trim(); });
    var n = 0;
    t.linhas.forEach(function (l) {
      if (!m[4] || avaliarCond(m[4], l, {})) {
        sets.forEach(function (s) {
          var sm = /^([\w]+)\s*=\s*(.+)$/.exec(s);
          if (sm) l[sm[1].toLowerCase()] = literal(sm[2]);
        });
        n++;
      }
    });
    return "UPDATE " + n;
  }

  function sqlDelete(rest) {
    var m = /^FROM\s+([\w]+)(\s+WHERE\s+([\s\S]+))?\s*;?\s*$/i.exec(rest);
    if (!m) return 'ERROR:  syntax error at or near "DELETE"';
    var t = tabela(m[1].toLowerCase());
    if (!t) return 'ERROR:  relation "' + m[1].toLowerCase() + '" does not exist';
    var antes = t.linhas.length;
    t.linhas = t.linhas.filter(function (l) { return m[3] ? !avaliarCond(m[3], l, {}) : false; });
    return "DELETE " + (antes - t.linhas.length);
  }

  function sqlCreateTable(rest) {
    var m = /^([\w]+)\s*\(([\s\S]+)\)\s*;?\s*$/i.exec(rest);
    if (!m) return 'ERROR:  syntax error at or near "CREATE"';
    var nome = m[1].toLowerCase();
    if (tabela(nome)) return 'ERROR:  relation "' + nome + '" already exists';
    var colunas = [];
    m[2].split(/,(?![^()]*\))/).forEach(function (p) {
      var cm = /^\s*(\w+)\s+([\w()]+)\s*(.*)$/i.exec(p);
      if (cm) colunas.push({ nome: cm[1].toLowerCase(), tipo: cm[2].toLowerCase(), restr: cm[3].toUpperCase() });
    });
    banco().tabelas[nome] = { colunas: colunas, linhas: [], seq: 1 };
    return "CREATE TABLE";
  }

  function sqlCreateDatabase(rest) {
    var m = /^([\w]+)\s*;?\s*$/i.exec(rest);
    if (!m) return 'ERROR:  syntax error';
    var nome = m[1].toLowerCase();
    if (estado.bancos[nome]) return 'ERROR:  database "' + nome + '" already exists';
    estado.bancos[nome] = { tabelas: {} };
    return "CREATE DATABASE";
  }

  function executar(sql) {
    sql = sql.trim().replace(/;$/, "");
    if (!sql) return "";

    // meta-comandos psql
    if (sql[0] === "\\") {
      var partes = sql.slice(1).split(/\s+/);
      var mc = partes[0].toLowerCase(), arg = partes[1];
      switch (mc) {
        case "l": case "list":
          return tabelaSaida([{ nome: "Name" }, { nome: "Owner" }],
            Object.keys(estado.bancos).map(function (b) { return [b, "ana"]; }));
        case "dt":
          var b = banco();
          return tabelaSaida([{ nome: "Name" }, { nome: "Owner" }],
            Object.keys(b.tabelas).map(function (t) { return [t, "ana"]; })) + (Object.keys(b.tabelas).length ? "" : "Did not find any relations.");
        case "d": {
          var t = arg ? tabela(arg.toLowerCase()) : null;
          if (!t) return 'Did not find any relation named "' + (arg || "") + '".';
          return 'Table "public.' + arg.toLowerCase() + '"\n' +
            tabelaSaida([{ nome: "Column" }, { nome: "Type" }, { nome: "Modifiers" }],
              t.colunas.map(function (c) { return [c.nome, c.tipo, c.restr]; }));
        }
        case "c": case "connect":
          if (!estado.bancos[(arg || "").toLowerCase()]) return 'FATAL:  database "' + arg + '" does not exist';
          estado.bancoAtual = arg.toLowerCase();
          return 'You are now connected to database "' + estado.bancoAtual + '" as user "ana".';
        case "du": case "list+":
          return tabelaSaida([{ nome: "Role name" }, { nome: "Attributes" }],
            estado.usuarios.map(function (u) { var p = u.split(" ("); return [p[0], p[1] ? p[1].replace(")", "") : ""]; }));
        case "q": case "quit": return "(simulador) psql encerrado — clique em Reiniciar.";
        case "?": return "Meta-comandos: \\l lista bancos · \\dt lista tabelas · \\d TABELA descreve · \\c BANCO conecta · \\du usuários · \\q sai";
        default: return 'Invalid command \\' + mc + '. Try \\? for help.';
      }
    }

    var m = /^(\w+)\s*([\s\S]*)$/.exec(sql);
    var cmd = (m ? m[1] : "").toUpperCase();
    var rest = m ? m[2] : "";

    switch (cmd) {
      case "SELECT": return sqlSelect(rest);
      case "INSERT": return sqlInsert(rest.replace(/^INTO\s+/i, ""));
      case "UPDATE": return sqlUpdate(rest);
      case "DELETE": return sqlDelete(rest);
      case "CREATE":
        if (/^DATABASE/i.test(rest)) return sqlCreateDatabase(rest.replace(/^DATABASE\s+/i, ""));
        if (/^TABLE/i.test(rest)) return sqlCreateTable(rest.replace(/^TABLE\s+/i, ""));
        if (/^(UNIQUE\s+)?INDEX/i.test(rest)) return "CREATE INDEX";
        if (/^VIEW/i.test(rest)) return "CREATE VIEW";
        return 'ERROR:  syntax error at or near "CREATE"';
      case "DROP":
        var dm = /^TABLE\s+([\w]+)/i.exec(rest);
        if (dm && tabela(dm[1].toLowerCase())) { delete banco().tabelas[dm[1].toLowerCase()]; return "DROP TABLE"; }
        return 'ERROR:  syntax error at or near "DROP"';
      case "TRUNCATE": {
        var tm = /^([\w]+)/i.exec(rest);
        var tt = tm && tabela(tm[1].toLowerCase());
        if (tt) { tt.linhas = []; return "TRUNCATE TABLE"; }
        return 'ERROR:  relation "' + (tm ? tm[1] : "") + '" does not exist';
      }
      case "BEGIN": case "START":
        if (estado.emTransacao) return "WARNING:  there is already a transaction in progress";
        estado.emTransacao = true;
        backupTransacao = JSON.parse(JSON.stringify(estado.bancos));
        return "BEGIN";
      case "COMMIT":
        if (!estado.emTransacao) return "WARNING:  there is no transaction in progress";
        estado.emTransacao = false; backupTransacao = null;
        return "COMMIT";
      case "ROLLBACK":
        if (!estado.emTransacao) return "WARNING:  there is no transaction in progress";
        estado.bancos = backupTransacao; estado.emTransacao = false; backupTransacao = null;
        return "ROLLBACK";
      case "EXPLAIN": {
        var q = rest.replace(/^(\(.*\)\s*)?/i, "");
        return "Seq Scan on " + (q.match(/FROM\s+(\w+)/i) || [,"?"])[1] + "  (cost=0.00..35.50 rows=2550 width=72)";
      }
      case "\\d": return executar("\\d " + rest);
      default:
        return 'ERROR:  syntax error at or near "' + cmd.toLowerCase() + '"\nLINE 1: ' + sql.slice(0, 40) + "\n        ^";
    }
  }

  /* ---------- interface ---------- */
  function montarTerminal(container) {
    var historico = [], histIdx = -1;
    container.classList.add("docker-term");
    var output = document.createElement("div");
    output.className = "term-output";
    var inputLine = document.createElement("div");
    inputLine.className = "term-input-line";
    var prompt = document.createElement("span");
    prompt.className = "term-prompt";
    function atualizaPrompt() { prompt.textContent = USER + "@" + HOST + "=> " + estado.bancoAtual + (estado.emTransacao ? "*" : "") + "> "; }
    atualizaPrompt();
    var input = document.createElement("input");
    input.className = "term-input";
    input.setAttribute("autocomplete", "off");
    input.setAttribute("spellcheck", "false");
    input.setAttribute("autocapitalize", "off");
    inputLine.appendChild(prompt);
    inputLine.appendChild(input);
    container.appendChild(output);
    container.appendChild(inputLine);

    var bv = document.createElement("div");
    bv.className = "term-line term-welcome";
    bv.textContent = "psql (PostgreSQL " + VERSAO + ") simulado — banco " + estado.bancoAtual + ". Tente: \\dt   ou   SELECT * FROM clientes LIMIT 3;";
    output.appendChild(bv);

    function rolar() { output.scrollTop = output.scrollHeight; }
    function print(texto, classe) {
      var div = document.createElement("div");
      div.className = "term-line " + (classe || "");
      if (texto.indexOf("\x1b[2J") === 0) { output.innerHTML = ""; return; }
      div.textContent = texto;
      output.appendChild(div);
      rolar();
    }
    function rodarComando(linha) {
      print(estado.bancoAtual + (estado.emTransacao ? "*" : "") + "=> " + linha, "term-cmd");
      historico.push(linha);
      histIdx = historico.length;
      var resultado = executar(linha);
      atualizaPrompt();
      if (resultado) resultado.split("\n").forEach(function (l) {
        var classe = /^ERROR|^FATAL|^WARNING|^DETAIL/.test(l) ? "term-err" : (/^(INSERT|UPDATE|DELETE|CREATE|BEGIN|COMMIT|ROLLBACK|DROP|TRUNCATE|\()/ .test(l) ? "term-ok" : "term-out");
        print(l, classe);
      });
    }

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { var v = input.value; input.value = ""; rodarComando(v); }
      else if (e.key === "ArrowUp") { e.preventDefault(); if (histIdx > 0) { histIdx--; input.value = historico[histIdx] || ""; } }
      else if (e.key === "ArrowDown") { e.preventDefault(); if (histIdx < historico.length - 1) { histIdx++; input.value = historico[histIdx]; } else { histIdx = historico.length; input.value = ""; } }
      else if (e.key === "l" && e.ctrlKey) { e.preventDefault(); output.innerHTML = ""; }
      else if (e.key === "c" && e.ctrlKey) { e.preventDefault(); print(estado.bancoAtual + "=> ^C", "term-cmd"); input.value = ""; }
    });

    container.addEventListener("click", function () { input.focus({ preventScroll: true }); });
    setTimeout(function () { input.focus({ preventScroll: true }); }, 100);

    var goal = container.getAttribute("data-goal");
    var solucao = container.getAttribute("data-solucao");
    if (goal) {
      var check = setInterval(function () {
        if (output.textContent.indexOf(goal.replace(/^out:/, "")) !== -1) {
          clearInterval(check);
          var badge = document.createElement("div");
          badge.className = "term-missao-ok";
          badge.textContent = "✔ Missão cumprida!";
          container.appendChild(badge);
        }
      }, 500);
    }

    var toolbar = document.createElement("div");
    toolbar.className = "term-toolbar";
    var btnR = document.createElement("button");
    btnR.type = "button"; btnR.className = "term-btn"; btnR.textContent = "Reiniciar";
    btnR.addEventListener("click", function (e) {
      e.stopPropagation();
      estado = estadoInicial();
      output.innerHTML = "";
      var b2 = document.createElement("div");
      b2.className = "term-line term-welcome";
      b2.textContent = "psql reiniciado — banco loja_aurora. Tente \\dt";
      output.appendChild(b2);
      atualizaPrompt();
      input.value = "";
      input.focus({ preventScroll: true });
    });
    toolbar.appendChild(btnR);
    if (solucao) {
      var btnS = document.createElement("button");
      btnS.type = "button"; btnS.className = "term-btn"; btnS.textContent = "Ver comando";
      btnS.addEventListener("click", function (e) { e.stopPropagation(); input.value = solucao; input.focus({ preventScroll: true }); });
      toolbar.appendChild(btnS);
    }
    container.insertBefore(toolbar, container.firstChild);
  }

  function init() { document.querySelectorAll(".try").forEach(montarTerminal); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
