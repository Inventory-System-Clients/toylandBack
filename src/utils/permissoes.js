// Catálogo de permissões configuráveis por usuário (definidas pelo ADMIN).
//
// Usuário com `permissoes` = null segue o comportamento padrão da sua role.
// Usuário com `permissoes` = array de chaves vê/usa apenas o que estiver na lista.
// ADMIN sempre tem acesso total (a lista é ignorada).
//
// Mantenha em sincronia com frontend/src/utils/permissoes.js

export const PERMISSOES_VALIDAS = [
  // Abas
  "dashboard",
  "movimentacoes",
  "maquinas",
  "lojas",
  "produtos",
  "manutencoes",
  "roteiros",
  "financeiro",
  "machinePay",
  "vouchers",
  "carrinhos",
  "graficos",
  "relatorios",
  "alertasEstoque",
  "veiculos",

  // Funcionalidades
  "movimentacoes.gerenciar",
  "maquinas.gerenciar",
  "maquinas.machinePay",
  "lojas.gerenciar",
  "produtos.gerenciar",
  "manutencoes.atualizar",
  "manutencoes.gerenciar",
  "roteiros.gerenciar",
  "financeiro.machinePay",
  "machinePay.valores",
  "machinePay.extrato",
  "machinePay.creditoRemoto",
  "machinePay.devolucao",
  "machinePay.horario",
  "vouchers.gerenciar",
  "carrinhos.devolver",

  // Seções do dashboard
  "dashboard.resumo",
  "dashboard.buscaLojasMaquinas",
  "dashboard.historicoMovimentacoes",
  "dashboard.alertasMaquinas",
  "dashboard.alertasLojas",
  "dashboard.distribuicaoLojas",
];

// Normaliza o que veio do request: null/undefined => sem personalização,
// array => apenas chaves conhecidas, sem duplicatas.
export const sanitizarPermissoes = (permissoes) => {
  if (permissoes === null || permissoes === undefined) return null;
  if (!Array.isArray(permissoes)) return null;
  return [...new Set(permissoes.filter((p) => PERMISSOES_VALIDAS.includes(p)))];
};

// `rolesLegado`: roles que tinham acesso antes da personalização existir,
// usadas quando o usuário não tem permissões personalizadas.
export const temPermissao = (usuario, chaves, rolesLegado = []) => {
  if (!usuario) return false;
  if (usuario.role === "ADMIN") return true;
  const lista = Array.isArray(chaves) ? chaves : [chaves];
  if (Array.isArray(usuario.permissoes)) {
    return lista.some((c) => usuario.permissoes.includes(c));
  }
  return rolesLegado.includes(usuario.role);
};
