// Catálogo de permissões configuráveis por usuário (definidas pelo ADMIN).
//
// Usuário com `permissoes` = null segue o comportamento padrão da sua role.
// Usuário com `permissoes` = array de chaves vê/usa apenas o que estiver na lista.
// ADMIN sempre tem acesso total (a lista é ignorada).
//
// Mantenha em sincronia com toylandFront/src/utils/permissoes.js

export const PERMISSOES_VALIDAS = [
  // Abas
  "dashboard",
  "movimentacoes",
  "estoque",
  "relatorios",
  "machinePay",
  "machinePayDetalhado",
  "vouchers",
  "produtos",
  "manutencao",
  "maquinas",
  "lojas",
  "produtosComprar",
  "fornecedores",
  "graficos",
  "alertas",
  "sangrias",
  "veiculos",

  // Funcionalidades
  "movimentacoes.gerenciar",
  "produtos.gerenciar",
  "manutencao.gerenciar",
  "maquinas.gerenciar",
  "lojas.gerenciar",
  "machinePay.valores",
  "machinePay.extrato",
  "machinePay.extratoCompleto",
  "machinePay.creditoRemoto",
  "machinePay.devolucao",
  "machinePay.horario",
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
