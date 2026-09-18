require("dotenv").config();

const express = require("express");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const db = new Database("tarefas.db");

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET não foi definido no arquivo .env");
}

app.use(express.json());

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tarefas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    concluida INTEGER NOT NULL DEFAULT 0,
    usuario_id INTEGER
  );
`);

const colunas = db.prepare("PRAGMA table_info(tarefas)").all();

if (!colunas.some((coluna) => coluna.name === "usuario_id")) {
  db.exec("ALTER TABLE tarefas ADD COLUMN usuario_id INTEGER");
}

function formatarTarefa(tarefa) {
  return {
    ...tarefa,
    concluida: Boolean(tarefa.concluida)
  };
}

function autenticar(req, res, next) {
  const cabecalho = req.headers.authorization;

  if (!cabecalho || !cabecalho.startsWith("Bearer ")) {
    return res.status(401).json({
      erro: "Token de acesso não enviado."
    });
  }

  const token = cabecalho.substring(7);

  try {
    const dados = jwt.verify(token, process.env.JWT_SECRET);
    req.usuarioId = dados.usuarioId;
    next();
  } catch {
    return res.status(401).json({
      erro: "Token inválido ou expirado."
    });
  }
}

app.post("/auth/cadastro", (req, res) => {
  const { nome, email, senha } = req.body;

  if (!nome || !email || !senha) {
    return res.status(400).json({
      erro: "Nome, e-mail e senha são obrigatórios."
    });
  }

  if (senha.length < 8) {
    return res.status(400).json({
      erro: "A senha deve ter pelo menos 8 caracteres."
    });
  }

  const emailNormalizado = email.trim().toLowerCase();

  const usuarioExistente = db
    .prepare("SELECT id FROM usuarios WHERE email = ?")
    .get(emailNormalizado);

  if (usuarioExistente) {
    return res.status(409).json({
      erro: "Este e-mail já está cadastrado."
    });
  }

  const senhaHash = bcrypt.hashSync(senha, 12);

  db.prepare(
    "INSERT INTO usuarios (nome, email, senha_hash) VALUES (?, ?, ?)"
  ).run(nome.trim(), emailNormalizado, senhaHash);

  res.status(201).json({
    mensagem: "Usuário cadastrado com sucesso."
  });
});

app.post("/auth/login", (req, res) => {
  const { email, senha } = req.body;

  const usuario = db
    .prepare("SELECT * FROM usuarios WHERE email = ?")
    .get(email?.trim().toLowerCase());

  if (!usuario || !bcrypt.compareSync(senha || "", usuario.senha_hash)) {
    return res.status(401).json({
      erro: "E-mail ou senha inválidos."
    });
  }

  const token = jwt.sign(
    { usuarioId: usuario.id },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  res.json({ token });
});

app.get("/tarefas", autenticar, (req, res) => {
  const tarefas = db
    .prepare("SELECT * FROM tarefas WHERE usuario_id = ?")
    .all(req.usuarioId)
    .map(formatarTarefa);

  res.json(tarefas);
});

app.get("/tarefas/:id", autenticar, (req, res) => {
  const tarefa = db
    .prepare("SELECT * FROM tarefas WHERE id = ? AND usuario_id = ?")
    .get(Number(req.params.id), req.usuarioId);

  if (!tarefa) {
    return res.status(404).json({
      erro: "Tarefa não encontrada."
    });
  }

  res.json(formatarTarefa(tarefa));
});

app.post("/tarefas", autenticar, (req, res) => {
  const { titulo } = req.body;

  if (!titulo || !titulo.trim()) {
    return res.status(400).json({
      erro: "O título da tarefa é obrigatório."
    });
  }

  const resultado = db
    .prepare(
      "INSERT INTO tarefas (titulo, concluida, usuario_id) VALUES (?, ?, ?)"
    )
    .run(titulo.trim(), 0, req.usuarioId);

  const novaTarefa = db
    .prepare("SELECT * FROM tarefas WHERE id = ?")
    .get(resultado.lastInsertRowid);

  res.status(201).json(formatarTarefa(novaTarefa));
});

app.patch("/tarefas/:id", autenticar, (req, res) => {
  const { concluida } = req.body;

  if (typeof concluida !== "boolean") {
    return res.status(400).json({
      erro: "O campo concluida deve ser true ou false."
    });
  }

  const tarefa = db
    .prepare("SELECT * FROM tarefas WHERE id = ? AND usuario_id = ?")
    .get(Number(req.params.id), req.usuarioId);

  if (!tarefa) {
    return res.status(404).json({
      erro: "Tarefa não encontrada."
    });
  }

  db.prepare("UPDATE tarefas SET concluida = ? WHERE id = ?")
    .run(Number(concluida), tarefa.id);

  const tarefaAtualizada = db
    .prepare("SELECT * FROM tarefas WHERE id = ?")
    .get(tarefa.id);

  res.json(formatarTarefa(tarefaAtualizada));
});

app.delete("/tarefas/:id", autenticar, (req, res) => {
  const tarefa = db
    .prepare("SELECT * FROM tarefas WHERE id = ? AND usuario_id = ?")
    .get(Number(req.params.id), req.usuarioId);

  if (!tarefa) {
    return res.status(404).json({
      erro: "Tarefa não encontrada."
    });
  }

  db.prepare("DELETE FROM tarefas WHERE id = ?").run(tarefa.id);

  res.json({
    mensagem: "Tarefa removida com sucesso.",
    tarefa: formatarTarefa(tarefa)
  });
});

app.get("/", (req, res) => {
  res.json({
    status: "API de tarefas online"
  })
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor aberto na ${PORT}`);
})