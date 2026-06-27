import { Card } from "./Card";

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-500">
        <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2M12 22a10 10 0 100-20 10 10 0 000 20z" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-graphite-900">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-gray-500">{description}</p>
      <span className="mt-4 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
        Em desenvolvimento · dados fictícios
      </span>
    </Card>
  );
}
