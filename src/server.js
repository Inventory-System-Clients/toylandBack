import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { sequelize } from "./database/connection.js";
import routes from "./routes/index.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const dataRetentionEnabled = process.env.DATA_RETENTION_ENABLED === "true";

// Middlewares
app.use(
  helmet({
    contentSecurityPolicy: false, // Permitir recursos inline para a página de relatório
  }),
);

// Configurar CORS para aceitar desenvolvimento e os frontends de produção.
// CORS_ORIGINS pode receber múltiplas URLs separadas por vírgula.
const environmentOrigins = [
  process.env.FRONTEND_URL,
  ...(process.env.CORS_ORIGINS || "").split(","),
]
  .map((origin) => origin?.trim().replace(/\/$/, ""))
  .filter(Boolean);

const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:5174",
  "https://toyland.selfmachine.com.br",
  "https://www.toyland.selfmachine.com.br",
  "https://agarramaisop.selfmachine.com.br",
  "https://grupogk.selfmachine.com.br",
  ...environmentOrigins,
]);

const corsOptions = {
  origin(origin, callback) {
    // Permitir requisições sem origin (como mobile apps, Postman e curl).
    if (!origin) return callback(null, true);

    const normalizedOrigin = origin.replace(/\/$/, "");
    if (allowedOrigins.has(normalizedOrigin) || allowedOrigins.has("*")) {
      return callback(null, true);
    }

    console.warn(`⚠️ Origem bloqueada pelo CORS: ${origin}`);
    return callback(new Error(`Origem não permitida pelo CORS: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(morgan("dev"));
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos da pasta public
app.use("/public", express.static(path.join(__dirname, "..", "public")));

// Root route
app.get("/", (req, res) => {
  res.json({
    message: "Agarra Mais API",
    version: "1.0.0",
    status: "online",
    endpoints: {
      health: "/health",
      auth: "/api/auth",
      usuarios: "/api/usuarios",
      lojas: "/api/lojas",
      maquinas: "/api/maquinas",
      produtos: "/api/produtos",
      movimentacoes: "/api/movimentacoes",
      relatorios: "/api/relatorios",
    },
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Debug endpoint - remover em produção
app.get("/debug/admin", async (req, res) => {
  const { Usuario } = await import("./models/index.js");
  const admin = await Usuario.findOne({
    where: { email: process.env.ADMIN_EMAIL || "admin@agarramais.com" },
  });
  res.json({
    adminExists: !!admin,
    email: admin?.email,
    role: admin?.role,
    ativo: admin?.ativo,
  });
});

// Routes
app.use("/api", routes);

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: {
      message: err.message || "Erro interno do servidor",
      status: err.status || 500,
    },
  });
});

// Database connection and server start
const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ Conexão com PostgreSQL estabelecida com sucesso!");

    // Sync database - cria novas tabelas/colunas mas não altera existentes
    // Para evitar erros de sintaxe SQL ao adicionar constraints
    await sequelize.sync();
    console.log("✅ Database sincronizado!");

    const { obterOuCriarGaragem } = await import(
      "./controllers/movimentacaoEstoqueLojaController.js"
    );
    const garagem = await obterOuCriarGaragem();
    console.log(`✅ Depósito central disponível: ${garagem.nome}`);

    const queryInterface = sequelize.getQueryInterface();
    const colunasRegistroDinheiro =
      await queryInterface.describeTable("registro_dinheiro");
    const colunasFinanceirasRegistro = [
      ["valorPix", "Valor Pix"],
      ["valorCartao", "Valor Cartão"],
      ["valorCartaoLiquido", "Valor Cartão Líquido"],
    ];
    for (const [coluna, comentario] of colunasFinanceirasRegistro) {
      if (!colunasRegistroDinheiro[coluna]) {
        const { DataTypes } = await import("sequelize");
        await queryInterface.addColumn("registro_dinheiro", coluna, {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0,
          comment: comentario,
        });
        console.log(`✅ Coluna ${coluna} adicionada ao registro de dinheiro!`);
      }
    }

    const colunasMaquinas = await queryInterface.describeTable("maquinas");
    if (!colunasMaquinas.machine_pay_pos_id) {
      const { DataTypes } = await import("sequelize");
      await queryInterface.addColumn("maquinas", "machine_pay_pos_id", {
        type: DataTypes.STRING(50),
        allowNull: true,
        unique: true,
      });
      console.log("✅ Coluna Machine Pay adicionada às máquinas!");
    }

    // Criar admin padrão se não existir
    if (!colunasMaquinas.jogadas_boas_por_pelucia) {
      const { DataTypes } = await import("sequelize");
      await queryInterface.addColumn("maquinas", "jogadas_boas_por_pelucia", {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: "Quantidade ideal de jogadas para sair uma pelÃºcia",
      });
      console.log(
        "âœ… Coluna de jogadas boas por pelÃºcia adicionada Ã s mÃ¡quinas!",
      );
    }

    if (!colunasMaquinas.pelucia_gigante) {
      const { DataTypes } = await import("sequelize");
      await queryInterface.addColumn("maquinas", "pelucia_gigante", {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: "Indica se a maquina trabalha com pelucia gigante",
      });
      console.log("Coluna de pelucia gigante adicionada as maquinas!");
    }
    if (!colunasMaquinas.alerta_jogadas_antes_pelucia) {
      const { DataTypes } = await import("sequelize");
      await queryInterface.addColumn(
        "maquinas",
        "alerta_jogadas_antes_pelucia",
        {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment:
            "Quantidade de jogadas antes da meta para alertar pelucia perto de sair",
        },
      );
      console.log(
        "Coluna de alerta de jogadas antes da pelucia adicionada as maquinas!",
      );
    }

    const colunasGastoVariavel =
      await queryInterface.describeTable("GastoVariavel");
    if (!colunasGastoVariavel.usuarioId) {
      const { DataTypes } = await import("sequelize");
      await queryInterface.addColumn("GastoVariavel", "usuarioId", {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "usuarios", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      });
      console.log(
        "âœ… Coluna de responsÃ¡vel adicionada aos gastos variÃ¡veis!",
      );
    }

    const { Usuario } = await import("./models/index.js");
    const adminEmail = process.env.ADMIN_EMAIL || "admin@agarramais.com";
    const adminExistente = await Usuario.findOne({
      where: { email: adminEmail },
    });

    if (!adminExistente) {
      const adminPassword = process.env.ADMIN_PASSWORD || "Admin@123";
      await Usuario.create({
        nome: "Administrador",
        email: adminEmail,
        senha: adminPassword,
        role: "ADMIN",
        telefone: "(11) 99999-9999",
        ativo: true,
      });
      console.log("✅ Usuário admin criado:", adminEmail);
    }

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
      console.log(`📍 http://localhost:${PORT}`);
      console.log(`🏥 Health check: http://localhost:${PORT}/health`);

      // Agendar limpeza automática de dados antigos apenas quando explicitamente habilitada
      if (process.env.NODE_ENV === "production" && dataRetentionEnabled) {
        iniciarLimpezaAutomatica();
      } else {
        console.log("⏸️ Limpeza automática de dados antigos desativada");
      }
    });
  } catch (error) {
    console.error("❌ Erro ao conectar com o banco de dados:", error);
    process.exit(1);
  }
};

// Função para executar limpeza automática diariamente
const iniciarLimpezaAutomatica = async () => {
  const { limparDadosAntigos } = await import("./utils/dataRetention.js");

  const executarLimpeza = async () => {
    const agora = new Date();
    const horas = agora.getHours();

    // Executar apenas às 3h da manhã
    if (horas === 3) {
      console.log("🗑️  Executando limpeza automática de dados antigos...");
      try {
        await limparDadosAntigos();
      } catch (error) {
        console.error("❌ Erro na limpeza automática:", error);
      }
    }
  };

  // Executar a cada 1 hora para verificar se é 3h da manhã
  setInterval(executarLimpeza, 60 * 60 * 1000); // 1 hora em ms
  console.log("⏰ Limpeza automática agendada para 3h da manhã (diariamente)");
};

startServer();

export default app;
