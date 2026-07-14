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
    <div className="overflow-x-auto rounded-xl">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-100 dark:border-white/[0.06]">
            {columns.map((col, i) => (
              <th
                key={i}
                className={cn(
                  "px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-graphite-400 dark:text-gray-500",
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
            <tr
              key={getKey(row)}
              className="border-b border-gray-50 transition-colors duration-100 hover:bg-gray-50/80 dark:border-white/[0.04] dark:hover:bg-white/[0.04]"
            >
              {columns.map((col, i) => (
                <td
                  key={i}
                  className={cn(
                    "px-4 py-3.5 text-graphite-700 dark:text-gray-300",
                    alignClass[col.align ?? "left"],
                  )}
                >
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
