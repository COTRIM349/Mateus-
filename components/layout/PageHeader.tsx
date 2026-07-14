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
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-[22px] font-extrabold tracking-tight text-graphite-900 dark:text-white">{titulo}</h1>
        {descricao && <p className="mt-1 text-[13px] text-graphite-400 dark:text-gray-500">{descricao}</p>}
      </div>
      {acao && <div className="flex items-center gap-3">{acao}</div>}
    </div>
  );
}
