const DEFAULT_LOGIN_URL =
  "https://www.cyberpix.com.br/pix-adesivo-clientes/";

export const getMachinePayLoginConfig = () => {
  const configuredUrl =
    process.env.MACHINE_PAY_LOGIN_URL || DEFAULT_LOGIN_URL;
  const baseUrl = configuredUrl.endsWith("/")
    ? configuredUrl
    : `${configuredUrl}/`;

  return {
    baseUrl,
    login: process.env.MACHINE_PAY_LOGIN || "",
    password: process.env.MACHINE_PAY_PASSWORD || "",
  };
};

export const machinePayLoginConfigurado = () => {
  const { login, password } = getMachinePayLoginConfig();
  return Boolean(login && password);
};
