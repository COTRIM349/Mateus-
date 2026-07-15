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
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-graphite-900 dark:text-white">{titulo}</h1>
        {descricao && <p className="mt-1 text-[13px] leading-relaxed text-graphite-400 dark:text-gray-500">{descricao}</p>}
      </div>
      {acao && <div className="flex shrink-0 items-center gap-3">{acao}</div>}
    </div>
  );
}
