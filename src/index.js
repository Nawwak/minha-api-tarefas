const express = require("express");
const Database = require("better-sqlite3");

const app = express();
const db = new Database("tarefas.db");

app.use(express.json());

db.exec(`
  CREATE TABLE IF NOT EXISTS tarefas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    concluida INTEGER NOT NULL DEFAULT 0
  )
`);

function formatarTarefa(tarefa) {
  return {
    ...tarefa,
    concluida: Boolean(tarefa.concluida)
  };
}

app.get("/tarefas", (req, res) => {
  const tarefas = db
    .prepare("SELECT * FROM tarefas")
    .all()
    .map(formatarTarefa);

  res.json(tarefas);
});

app.get("/tarefas/:id", (req, res) => {
  const id = Number(req.params.id);

  const tarefa = db
    .prepare("SELECT * FROM tarefas WHERE id = ?")
    .get(id);

  if (!tarefa) {
    return res.status(404).json({
      erro: "Tarefa não encontrada."
    });
  }

  res.json(formatarTarefa(tarefa));
});

app.post("/tarefas", (req, res) => {
  const { titulo } = req.body;

  if (!titulo || !titulo.trim()) {
    return res.status(400).json({
      erro: "O título da tarefa é obrigatório."
    });
  }

  const resultado = db
    .prepare("INSERT INTO tarefas (titulo, concluida) VALUES (?, ?)")
    .run(titulo.trim(), 0);

  const novaTarefa = db
    .prepare("SELECT * FROM tarefas WHERE id = ?")
    .get(resultado.lastInsertRowid);

  res.status(201).json(formatarTarefa(novaTarefa));
});

app.patch("/tarefas/:id", (req, res) => {
  const id = Number(req.params.id);
  const { concluida } = req.body;

  const tarefa = db
    .prepare("SELECT * FROM tarefas WHERE id = ?")
    .get(id);

  if (!tarefa) {
    return res.status(404).json({
      erro: "Tarefa não encontrada."
    });
  }

  if (typeof concluida !== "boolean") {
    return res.status(400).json({
      erro: "O campo concluida deve ser true ou false."
    });
  }

  db
    .prepare("UPDATE tarefas SET concluida = ? WHERE id = ?")
    .run(Number(concluida), id);

  const tarefaAtualizada = db
    .prepare("SELECT * FROM tarefas WHERE id = ?")
    .get(id);

  res.json(formatarTarefa(tarefaAtualizada));
});

app.delete("/tarefas/:id", (req, res) => {
  const id = Number(req.params.id);

  const tarefa = db
    .prepare("SELECT * FROM tarefas WHERE id = ?")
    .get(id);

  if (!tarefa) {
    return res.status(404).json({
      erro: "Tarefa não encontrada."
    });
  }

  db.prepare("DELETE FROM tarefas WHERE id = ?").run(id);

  res.json({
    mensagem: "Tarefa removida com sucesso.",
    tarefa: formatarTarefa(tarefa)
  });
});

app.listen(3000, () => {
  console.log("Servidor aberto em http://localhost:3000");
});