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
    <div className="mb-6 flex flex-col gap-3 border-b border-santa-100/80 pb-4 dark:border-white/[0.08] sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="border-l-[3px] border-santa-500 pl-3 text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-santa-900 dark:text-white sm:text-[24px]">{titulo}</h1>
        {descricao && <p className="mt-2 pl-[15px] text-[14px] leading-relaxed text-graphite-500 dark:text-gray-400">{descricao}</p>}
      </div>
      {acao && <div className="flex shrink-0 items-center gap-3">{acao}</div>}
    </div>
  );
}
