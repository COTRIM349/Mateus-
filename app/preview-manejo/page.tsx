"use client";

import { useMemo, useState } from "react";
import { ManejoChartWorkspace } from "@/components/charts/ManejoChart";
import { initialManejoVisibility, type ManejoSeriesKey } from "@/modules/reports/services/manejo-chart";
import { MANEJO_PREVIEW_TITLE, buildManejoPreviewRows } from "@/modules/reports/services/manejo-preview-fixture";

export default function PreviewManejoPage() {
  const rows = useMemo(() => buildManejoPreviewRows(), []);
  const [visible, setVisible] = useState(() => initialManejoVisibility());

  return (
    <div className="min-h-screen bg-[#f4f7f5] px-3 py-4 sm:px-6 sm:py-6">
      <p className="mx-auto mb-3 max-w-[1600px] text-[12px] text-slate-500">
        Demonstração da nova tela de gráfico — dados fictícios. No sistema, abra Balanço Hídrico → Calcular → Gráfico.
      </p>
      <div className="mx-auto max-w-[1600px]">
        <ManejoChartWorkspace
          title={MANEJO_PREVIEW_TITLE}
          rows={rows}
          visible={visible}
          onToggle={(k: ManejoSeriesKey) => setVisible((v) => ({ ...v, [k]: !v[k] }))}
          onReset={() => setVisible(initialManejoVisibility())}
        />
      </div>
    </div>
  );
}
