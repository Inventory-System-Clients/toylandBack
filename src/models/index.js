import MovimentacaoVeiculo from "./MovimentacaoVeiculo.js";
import GastoVariavel from "./GastoVariavel.js";
import Usuario from "./Usuario.js";
import Loja from "./Loja.js";
import Maquina from "./Maquina.js";
import Produto from "./Produto.js";
import Movimentacao from "./Movimentacao.js";
import MovimentacaoProduto from "./MovimentacaoProduto.js";
import LogAtividade from "./LogAtividade.js";
import UsuarioLoja from "./UsuarioLoja.js";
import EstoqueLoja from "./EstoqueLoja.js";
import MovimentacaoEstoqueLoja from "./MovimentacaoEstoqueLoja.js";
import MovimentacaoEstoqueLojaProduto from "./MovimentacaoEstoqueLojaProduto.js";
import AlertaIgnorado from "./AlertaIgnorado.js";
import Veiculo from "./Veiculo.js";
import RegistroDinheiro from "./RegistroDinheiro.js";
import GastoFixoLoja from "./GastoFixoLoja.js";
import GastoTotalFixoLoja from "./GastoTotalFixoLoja.js";
import FechamentoMensalRelatorio from "./FechamentoMensalRelatorio.js";
import Manutencao from "./Manutencao.js";
import ManutencaoUsuario from "./ManutencaoUsuario.js";
import Sangria from "./Sangria.js";
import ListaComprasPendente from "./ListaComprasPendente.js";
import ListaComprasLoja from "./ListaComprasLoja.js";
import ListaComprasProduto from "./ListaComprasProduto.js";
import Fornecedor from "./Fornecedor.js";
import CompraFornecedor from "./CompraFornecedor.js";
import CompraFornecedorProduto from "./CompraFornecedorProduto.js";
// Movimentação de Veículo -> Veículo e Usuário
MovimentacaoVeiculo.belongsTo(Veiculo, {
  as: "veiculo",
  foreignKey: "veiculoId",
});
MovimentacaoVeiculo.belongsTo(Usuario, {
  as: "usuario",
  foreignKey: "usuarioId",
});

// Relacionamentos
MovimentacaoEstoqueLoja.belongsTo(Loja, { foreignKey: "lojaId", as: "loja" });
Loja.hasMany(MovimentacaoEstoqueLoja, {
  foreignKey: "lojaId",
  as: "movimentacoesEstoque",
});

MovimentacaoEstoqueLoja.belongsTo(Usuario, {
  foreignKey: "usuarioId",
  as: "usuario",
});
Usuario.hasMany(MovimentacaoEstoqueLoja, {
  foreignKey: "usuarioId",
  as: "movimentacoesEstoque",
});

// Loja -> Máquinas
Loja.hasMany(Maquina, { foreignKey: "lojaId", as: "maquinas" });
Maquina.belongsTo(Loja, { foreignKey: "lojaId", as: "loja" });

// Máquina -> Movimentações
Maquina.hasMany(Movimentacao, { foreignKey: "maquinaId", as: "movimentacoes" });
Movimentacao.belongsTo(Maquina, { foreignKey: "maquinaId", as: "maquina" });

// Usuário -> Movimentações
Usuario.hasMany(Movimentacao, { foreignKey: "usuarioId", as: "movimentacoes" });
Movimentacao.belongsTo(Usuario, { foreignKey: "usuarioId", as: "usuario" });

// Movimentação <-> Produtos (many-to-many)
Movimentacao.belongsToMany(Produto, {
  through: MovimentacaoProduto,
  foreignKey: "movimentacaoId",
  otherKey: "produtoId",
  as: "produtos",
});

Produto.belongsToMany(Movimentacao, {
  through: MovimentacaoProduto,
  foreignKey: "produtoId",
  otherKey: "movimentacaoId",
  as: "movimentacoes",
});

// Acesso direto à tabela intermediária
Movimentacao.hasMany(MovimentacaoProduto, {
  foreignKey: "movimentacaoId",
  as: "detalhesProdutos",
});
MovimentacaoProduto.belongsTo(Movimentacao, { foreignKey: "movimentacaoId" });
MovimentacaoProduto.belongsTo(Produto, {
  foreignKey: "produtoId",
  as: "produto",
});

// Usuário -> Logs
Usuario.hasMany(LogAtividade, { foreignKey: "usuarioId", as: "logs" });
LogAtividade.belongsTo(Usuario, { foreignKey: "usuarioId", as: "usuario" });

// Usuário <-> Lojas (RBAC - many-to-many)
Usuario.belongsToMany(Loja, {
  through: UsuarioLoja,
  foreignKey: "usuarioId",
  otherKey: "lojaId",
  as: "lojasPermitidas",
});

Loja.belongsToMany(Usuario, {
  through: UsuarioLoja,
  foreignKey: "lojaId",
  otherKey: "usuarioId",
  as: "usuariosPermitidos",
});

// Acesso direto à tabela UsuarioLoja
Usuario.hasMany(UsuarioLoja, {
  foreignKey: "usuarioId",
  as: "permissoesLojas",
});
Loja.hasMany(UsuarioLoja, { foreignKey: "lojaId", as: "permissoesUsuarios" });
UsuarioLoja.belongsTo(Usuario, { foreignKey: "usuarioId" });
UsuarioLoja.belongsTo(Loja, { foreignKey: "lojaId" });

// Loja <-> Produtos (Estoque - many-to-many)
Loja.belongsToMany(Produto, {
  through: EstoqueLoja,
  foreignKey: "lojaId",
  otherKey: "produtoId",
  as: "estoqueProdutos",
});

Produto.belongsToMany(Loja, {
  through: EstoqueLoja,
  foreignKey: "produtoId",
  otherKey: "lojaId",
  as: "estoqueLoja",
});

// Relacionamento MovimentacaoEstoqueLoja <-> Produto
MovimentacaoEstoqueLoja.hasMany(MovimentacaoEstoqueLojaProduto, {
  foreignKey: "movimentacaoEstoqueLojaId",
  as: "produtosEnviados",
});
MovimentacaoEstoqueLojaProduto.belongsTo(MovimentacaoEstoqueLoja, {
  foreignKey: "movimentacaoEstoqueLojaId",
  as: "movimentacao",
});
MovimentacaoEstoqueLojaProduto.belongsTo(Produto, {
  foreignKey: "produtoId",
  as: "produto",
});
Loja.hasMany(EstoqueLoja, {
  foreignKey: "lojaId",
  as: "estoques",
});
Produto.hasMany(EstoqueLoja, {
  foreignKey: "produtoId",
  as: "estoquesEmLojas",
});
EstoqueLoja.belongsTo(Loja, { foreignKey: "lojaId", as: "loja" });
EstoqueLoja.belongsTo(Produto, { foreignKey: "produtoId", as: "produto" });

Loja.hasMany(GastoFixoLoja, {
  foreignKey: "lojaId",
  sourceKey: "id",
  as: "gastosFixos",
});
GastoFixoLoja.belongsTo(Loja, {
  foreignKey: "lojaId",
  targetKey: "id",
  as: "loja",
});

Loja.hasMany(GastoTotalFixoLoja, {
  foreignKey: "lojaId",
  sourceKey: "id",
  as: "gastosFixosTotaisMensais",
});
GastoTotalFixoLoja.belongsTo(Loja, {
  foreignKey: "lojaId",
  targetKey: "id",
  as: "loja",
});

Loja.hasMany(FechamentoMensalRelatorio, {
  foreignKey: "lojaId",
  sourceKey: "id",
  as: "fechamentosMensaisRelatorio",
});
FechamentoMensalRelatorio.belongsTo(Loja, {
  foreignKey: "lojaId",
  targetKey: "id",
  as: "loja",
});

Usuario.hasMany(FechamentoMensalRelatorio, {
  foreignKey: "fechadoPorUsuarioId",
  sourceKey: "id",
  as: "fechamentosMensaisCriados",
});
FechamentoMensalRelatorio.belongsTo(Usuario, {
  foreignKey: "fechadoPorUsuarioId",
  targetKey: "id",
  as: "fechadoPor",
});

Usuario.hasMany(Manutencao, {
  foreignKey: "criadoPorId",
  as: "manutencoesCriadas",
});
Manutencao.belongsTo(Usuario, {
  foreignKey: "criadoPorId",
  as: "criadoPor",
});

Usuario.hasMany(Manutencao, {
  foreignKey: "resolvidoPorId",
  as: "manutencoesResolvidas",
});
Manutencao.belongsTo(Usuario, {
  foreignKey: "resolvidoPorId",
  as: "resolvidoPor",
});

Manutencao.belongsToMany(Usuario, {
  through: ManutencaoUsuario,
  foreignKey: "manutencaoId",
  otherKey: "usuarioId",
  as: "funcionariosPermitidos",
});

Usuario.belongsToMany(Manutencao, {
  through: ManutencaoUsuario,
  foreignKey: "usuarioId",
  otherKey: "manutencaoId",
  as: "manutencoesPermitidas",
});

Manutencao.hasMany(ManutencaoUsuario, {
  foreignKey: "manutencaoId",
  as: "vinculosUsuarios",
});
ManutencaoUsuario.belongsTo(Manutencao, { foreignKey: "manutencaoId" });
ManutencaoUsuario.belongsTo(Usuario, {
  foreignKey: "usuarioId",
  as: "usuario",
});

Loja.hasMany(Manutencao, {
  foreignKey: "lojaId",
  as: "manutencoes",
});
Manutencao.belongsTo(Loja, {
  foreignKey: "lojaId",
  as: "loja",
});

Loja.hasMany(Sangria, {
  foreignKey: "lojaId",
  as: "sangrias",
});
Sangria.belongsTo(Loja, {
  foreignKey: "lojaId",
  as: "loja",
});

Usuario.hasMany(Sangria, {
  foreignKey: "usuarioId",
  as: "sangriasCriadas",
});
Sangria.belongsTo(Usuario, {
  foreignKey: "usuarioId",
  as: "usuario",
});

// Lista de Compras Pendentes
ListaComprasPendente.hasMany(ListaComprasLoja, {
  foreignKey: "listaId",
  as: "lojas",
  onDelete: "CASCADE",
});
ListaComprasLoja.belongsTo(ListaComprasPendente, {
  foreignKey: "listaId",
  as: "lista",
});

ListaComprasLoja.hasMany(ListaComprasProduto, {
  foreignKey: "listaLojaId",
  as: "produtos",
  onDelete: "CASCADE",
});
ListaComprasProduto.belongsTo(ListaComprasLoja, {
  foreignKey: "listaLojaId",
  as: "listaLoja",
});

Fornecedor.hasMany(CompraFornecedor, {
  foreignKey: "fornecedorId",
  as: "compras",
});
CompraFornecedor.belongsTo(Fornecedor, {
  foreignKey: "fornecedorId",
  as: "fornecedor",
});
Loja.hasMany(CompraFornecedor, {
  foreignKey: "destinoLojaId",
  as: "comprasRecebidas",
});
CompraFornecedor.belongsTo(Loja, {
  foreignKey: "destinoLojaId",
  as: "destino",
});
Usuario.hasMany(CompraFornecedor, {
  foreignKey: "usuarioId",
  as: "comprasRegistradas",
});
CompraFornecedor.belongsTo(Usuario, {
  foreignKey: "usuarioId",
  as: "usuario",
});
CompraFornecedor.hasMany(CompraFornecedorProduto, {
  foreignKey: "compraId",
  as: "produtos",
  onDelete: "CASCADE",
});
CompraFornecedorProduto.belongsTo(CompraFornecedor, {
  foreignKey: "compraId",
  as: "compra",
});
CompraFornecedorProduto.belongsTo(Produto, {
  foreignKey: "produtoId",
  as: "produto",
});

export {
  Usuario,
  Loja,
  Maquina,
  Produto,
  Movimentacao,
  MovimentacaoProduto,
  LogAtividade,
  UsuarioLoja,
  EstoqueLoja,
  MovimentacaoEstoqueLoja,
  MovimentacaoEstoqueLojaProduto,
  AlertaIgnorado,
  Veiculo,
  MovimentacaoVeiculo,
  RegistroDinheiro,
  GastoVariavel,
  GastoFixoLoja,
  GastoTotalFixoLoja,
  FechamentoMensalRelatorio,
  Manutencao,
  ManutencaoUsuario,
  Sangria,
  ListaComprasPendente,
  ListaComprasLoja,
  ListaComprasProduto,
  Fornecedor,
  CompraFornecedor,
  CompraFornecedorProduto,
};
