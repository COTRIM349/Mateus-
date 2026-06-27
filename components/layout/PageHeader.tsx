export function PageHeader({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao?: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-graphite-900 dark:text-white">{titulo}</h1>
        {descricao && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{descricao}</p>}
      </div>
      {acao && <div className="flex items-center gap-2">{acao}</div>}
    </div>
  );
}
