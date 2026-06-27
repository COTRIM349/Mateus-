export const BRAZILIAN_STATES = [
  { value: "AC", label: "Acre" },
  { value: "AL", label: "Alagoas" },
  { value: "AP", label: "Amapá" },
  { value: "AM", label: "Amazonas" },
  { value: "BA", label: "Bahia" },
  { value: "CE", label: "Ceará" },
  { value: "DF", label: "Distrito Federal" },
  { value: "ES", label: "Espírito Santo" },
  { value: "GO", label: "Goiás" },
  { value: "MA", label: "Maranhão" },
  { value: "MT", label: "Mato Grosso" },
  { value: "MS", label: "Mato Grosso do Sul" },
  { value: "MG", label: "Minas Gerais" },
  { value: "PA", label: "Pará" },
  { value: "PB", label: "Paraíba" },
  { value: "PR", label: "Paraná" },
  { value: "PE", label: "Pernambuco" },
  { value: "PI", label: "Piauí" },
  { value: "RJ", label: "Rio de Janeiro" },
  { value: "RN", label: "Rio Grande do Norte" },
  { value: "RS", label: "Rio Grande do Sul" },
  { value: "RO", label: "Rondônia" },
  { value: "RR", label: "Roraima" },
  { value: "SC", label: "Santa Catarina" },
  { value: "SP", label: "São Paulo" },
  { value: "SE", label: "Sergipe" },
  { value: "TO", label: "Tocantins" },
] as const;

export const SOIL_TEXTURES = [
  { value: "arenoso", label: "Arenoso" },
  { value: "franco-arenoso", label: "Franco-arenoso" },
  { value: "franco", label: "Franco" },
  { value: "franco-argiloso", label: "Franco-argiloso" },
  { value: "argiloso", label: "Argiloso" },
  { value: "muito-argiloso", label: "Muito argiloso" },
] as const;

export const PIVOT_STATUSES = [
  { value: "irrigando", label: "Irrigando" },
  { value: "parado", label: "Parado" },
  { value: "manutencao", label: "Manutenção" },
  { value: "alerta", label: "Alerta" },
] as const;

export const CROP_STAGES = [
  { value: "germinacao", label: "Germinação" },
  { value: "vegetativo", label: "Vegetativo" },
  { value: "floracao", label: "Floração" },
  { value: "enchimento", label: "Enchimento" },
  { value: "maturacao", label: "Maturação" },
  { value: "colheita", label: "Colheita" },
] as const;

export const STATION_TYPES = [
  { value: "automatica", label: "Automática" },
  { value: "manual", label: "Manual" },
  { value: "virtual", label: "Virtual" },
] as const;

export const DATA_SOURCES = [
  { value: "manual", label: "Entrada manual" },
  { value: "api_inmet", label: "API INMET" },
  { value: "api_nasa_power", label: "NASA POWER" },
  { value: "davis_link", label: "Davis WeatherLink" },
  { value: "campo_station", label: "Estação de campo" },
  { value: "outro", label: "Outro" },
] as const;

export const STATION_STATUSES = [
  { value: "ativa", label: "Ativa" },
  { value: "inativa", label: "Inativa" },
  { value: "manutencao", label: "Manutenção" },
] as const;
