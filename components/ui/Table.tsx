import { cn } from "@/utils/cn";

export interface Column<T> {
  header: string;
  render: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
}

const alignClass = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export function Table<T>({
  columns,
  data,
  getKey,
}: {
  columns: Column<T>[];
  data: T[];
  getKey: (row: T) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            {columns.map((col, i) => (
              <th
                key={i}
                className={cn(
                  "px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500",
                  alignClass[col.align ?? "left"],
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={getKey(row)} className="border-b border-gray-100 transition-colors hover:bg-gray-50">
              {columns.map((col, i) => (
                <td key={i} className={cn("px-3 py-3 text-graphite-900", alignClass[col.align ?? "left"])}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
