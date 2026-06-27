import { Card } from "./Card";

/**
 * Wrapper para gráficos: título, subtítulo opcional e área do gráfico.
 */
export function ChartCard({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-graphite-900">{titulo}</h3>
        {subtitulo && <p className="text-xs text-gray-500">{subtitulo}</p>}
      </div>
      <div className="h-64 w-full">{children}</div>
    </Card>
  );
}
