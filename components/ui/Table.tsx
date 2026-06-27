import { cn } from "@/lib/format";

/** Definição de uma coluna da tabela genérica. */
export interface Coluna<T> {
  /** Cabeçalho exibido. */
  header: string;
  /** Função que renderiza a célula a partir da linha. */
  render: (linha: T) => React.ReactNode;
  /** Alinhamento opcional do conteúdo. */
  align?: "left" | "right" | "center";
}

/**
 * Tabela genérica e tipada, reutilizável em todo o sistema.
 */
export function Table<T>({
  colunas,
  dados,
  getKey,
}: {
  colunas: Coluna<T>[];
  dados: T[];
  getKey: (linha: T) => string;
}) {
  const alinhamento = {
    left: "text-left",
    right: "text-right",
    center: "text-center",
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            {colunas.map((coluna, i) => (
              <th
                key={i}
                className={cn(
                  "px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500",
                  alinhamento[coluna.align ?? "left"],
                )}
              >
                {coluna.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dados.map((linha) => (
            <tr
              key={getKey(linha)}
              className="border-b border-gray-100 transition-colors hover:bg-gray-50"
            >
              {colunas.map((coluna, i) => (
                <td
                  key={i}
                  className={cn(
                    "px-3 py-3 text-graphite-900",
                    alinhamento[coluna.align ?? "left"],
                  )}
                >
                  {coluna.render(linha)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
