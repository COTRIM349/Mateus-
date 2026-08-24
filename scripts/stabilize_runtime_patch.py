from pathlib import Path

path = Path("app/(app)/balanco-hidrico/page.tsx")
text = path.read_text(encoding="utf-8")


def rep(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, found {count}")
    text = text.replace(old, new, 1)


rep(
'''  type WaterStatus,\n  type HydricStatus,\n} from "@/modules/water-balance/services";''',
'''  type WaterStatus,\n  type HydricStatus,\n  type InitialMoistureUnit,\n} from "@/modules/water-balance/services";''',
"import InitialMoistureUnit",
)

rep(
'''  return dates;\n}\n\n// séries climáticas extras''',
'''  return dates;\n}\n\nfunction addDaysIso(iso: string, days: number): string {\n  const d = new Date(`${iso}T12:00:00Z`);\n  d.setUTCDate(d.getUTCDate() + days);\n  return d.toISOString().slice(0, 10);\n}\n\n// séries climáticas extras''',
"addDaysIso",
)

rep(
'''  efficiency: number;\n  farm_id: string;''',
'''  efficiency: number;\n  application_efficiency: number | null;\n  farm_id: string;''',
"pivot application efficiency",
)

rep(
'''  planting_date: string;\n  emergence_date: string | null;''',
'''  planting_date: string;\n  management_start_date: string | null;\n  emergence_date: string | null;''',
"assignment management start",
)

rep(
'''  ks_function_override: string | null;\n  active: boolean;\n}''',
'''  ks_function_override: string | null;\n  initial_soil_moisture_pct: number | null;\n  initial_moisture_unit: InitialMoistureUnit | null;\n  initial_moisture_is_cc: boolean | null;\n  deficit_irrigation: boolean | null;\n  stress_point_irrigation: boolean | null;\n  active: boolean;\n}''',
"assignment initial moisture",
)

rep(
'''interface WeatherReading {\n  id: string;\n  date: string;\n  et0_source: number | null;''',
'''interface WeatherReading {\n  id: string;\n  date: string;\n  et0_calculated: number | null;''',
"weather canonical eto",
)

rep(
'''interface IrrigationEvent {\n  id: string;\n  pivot_id: string;\n  started_at: string;\n  depth_mm: number;\n}\n\ninterface StoredBalance''',
'''interface IrrigationEvent {\n  id: string;\n  pivot_id: string;\n  parcel_id: string | null;\n  started_at: string;\n  depth_mm: number;\n}\n\ninterface HydricAnchor {\n  effectiveDate: string;\n  source: "measured" | "field_capacity_confirmed";\n  moistureValue: number | null;\n  moistureUnit: InitialMoistureUnit;\n  isFieldCapacity: boolean;\n}\n\ninterface StoredBalance''',
"irrigation parcel + anchor type",
)

rep(
'''  const [phases, setPhases] = useState<CulturePhase[]>([]);\n  const [balanceRows, setBalanceRows] = useState<DailyBalanceRow[]>([]);''',
'''  const [phases, setPhases] = useState<CulturePhase[]>([]);\n  const [hydricAnchor, setHydricAnchor] = useState<HydricAnchor | null>(null);\n  const [balanceRows, setBalanceRows] = useState<DailyBalanceRow[]>([]);''',
"anchor state",
)

rep(
'''        .select("id, name, area, flow_rate, efficiency, farm_id, specific_consumption, pump_power, installed_power_kw, motor_efficiency, energy_cost, latitude, longitude")''',
'''        .select("id, name, area, flow_rate, efficiency, application_efficiency, farm_id, specific_consumption, pump_power, installed_power_kw, motor_efficiency, energy_cost, latitude, longitude")''',
"pivot select application efficiency",
)

rep(
'''      setSoilLayers([]);\n      setPhases([]);\n      return;''',
'''      setSoilLayers([]);\n      setPhases([]);\n      setHydricAnchor(null);\n      return;''',
"clear anchor when pivot cleared",
)

# There is a second early-return when the pivot has no assignment.
needle = '''        setSoilLayers([]);\n        setPhases([]);\n        return;'''
if text.count(needle) != 1:
    raise SystemExit(f"clear anchor when no assignment: expected 1 match, found {text.count(needle)}")
text = text.replace(needle, '''        setSoilLayers([]);\n        setPhases([]);\n        setHydricAnchor(null);\n        return;''', 1)

rep(
'''      setCulture(cultureData as Culture | null);\n      setSoil(soilData as Soil | null);\n      setSoilLayers(mapDbLayersToProfile(layerData ?? []));\n      setPhases((phaseData ?? []) as CulturePhase[]);\n\n      if (a.planting_date) {\n        const start = a.planting_date;''',
'''      const todayIso = new Date().toISOString().slice(0, 10);\n      const { data: anchorData } = await supabase\n        .from("hydric_initial_conditions")\n        .select("effective_date,source,moisture_value,moisture_unit,is_field_capacity")\n        .eq("pivot_crop_assignment_id", a.id)\n        .lte("effective_date", todayIso)\n        .order("effective_date", { ascending: false })\n        .limit(1)\n        .maybeSingle();\n\n      const anchor = anchorData && (anchorData.source === "measured" || anchorData.source === "field_capacity_confirmed")\n        ? {\n            effectiveDate: anchorData.effective_date as string,\n            source: anchorData.source as HydricAnchor["source"],\n            moistureValue: anchorData.moisture_value == null ? null : Number(anchorData.moisture_value),\n            moistureUnit: anchorData.moisture_unit as InitialMoistureUnit,\n            isFieldCapacity: anchorData.is_field_capacity === true,\n          }\n        : null;\n      setHydricAnchor(anchor);\n      setCulture(cultureData as Culture | null);\n      setSoil(soilData as Soil | null);\n      setSoilLayers(mapDbLayersToProfile(layerData ?? []));\n      setPhases((phaseData ?? []) as CulturePhase[]);\n\n      if (a.planting_date) {\n        const start = anchor ? addDaysIso(anchor.effectiveDate, 1) : (a.management_start_date ?? a.planting_date);''',
"load anchor and choose initial date",
)

rep(
'''      const pivot = pivots.find((p) => p.id === selectedPivotId);\n      if (!pivot) throw new Error("Pivô não encontrado");\n\n      // 1. Get weather readings for the farm stations''',
'''      const pivot = pivots.find((p) => p.id === selectedPivotId);\n      if (!pivot) throw new Error("Pivô não encontrado");\n\n      const legacyInitialValue = assignment.initial_soil_moisture_pct;\n      const hasLegacyInitial = assignment.initial_moisture_is_cc === true\n        || (legacyInitialValue != null && Number.isFinite(Number(legacyInitialValue)));\n      if (!hydricAnchor && !hasLegacyInitial) {\n        throw new Error("Balanço bloqueado: defina uma condição inicial confiável do solo (medição ou capacidade de campo confirmada).");\n      }\n      const calculationStart = hydricAnchor\n        ? addDaysIso(hydricAnchor.effectiveDate, 1)\n        : (assignment.management_start_date ?? assignment.planting_date);\n      if (calculationStart > dateEnd) {\n        throw new Error("Balanço bloqueado: a condição inicial é posterior ao período selecionado.");\n      }\n\n      // 1. Get weather readings for the farm stations''',
"trusted calculation start",
)

text = text.replace('.gte("date", dateStart)\n            .lte("date", dateEnd)', '.gte("date", calculationStart)\n            .lte("date", dateEnd)', 2)

rep(
'''            .select("id, date, et0_source, precipitation, station_id")''',
'''            .select("id, date, et0_calculated, precipitation, station_id")''',
"canonical eto select",
)

rep(
'''      // 2. Get irrigation events for the pivot\n      const { data: irrEvents } = await supabase\n        .from("irrigation_events")\n        .select("id, pivot_id, started_at, depth_mm")\n        .eq("pivot_id", selectedPivotId)\n        .gte("started_at", dateStart + "T00:00:00")\n        .lte("started_at", dateEnd + "T23:59:59");\n\n      const irrigationByDate = sumGrossDepthByDate(\n        ((irrEvents ?? []) as IrrigationEvent[]).map((ev) => ({\n          started_at: ev.started_at,\n          depth_mm: ev.depth_mm,\n        })),\n      );\n\n      // 3. Get any manually stored balance entries (applied_depth)\n      const { data: storedBalances } = await supabase\n        .from("water_balances")\n        .select("date, applied_depth")\n        .eq("pivot_crop_assignment_id", assignment.id)\n        .gte("date", dateStart)\n        .lte("date", dateEnd);\n\n      for (const sb of (storedBalances ?? []) as { date: string; applied_depth: number }[]) {\n        if (sb.applied_depth > 0 && !irrigationByDate[sb.date]) {\n          irrigationByDate[sb.date] = sb.applied_depth;\n        }\n      }\n\n      // 4. Build weather lookup by date''',
'''      // 2. Get irrigation events for the selected parcel. Eventos antigos sem\n      // parcel_id só são aceitos quando existe uma única parcela ativa no pivô.\n      const [{ data: irrEvents }, { count: activeAssignmentCount }] = await Promise.all([\n        supabase\n          .from("irrigation_events")\n          .select("id,pivot_id,parcel_id,started_at,depth_mm")\n          .eq("pivot_id", selectedPivotId)\n          .gte("started_at", calculationStart + "T00:00:00")\n          .lte("started_at", dateEnd + "T23:59:59"),\n        supabase\n          .from("pivot_crop_assignments")\n          .select("id", { count: "exact", head: true })\n          .eq("pivot_id", selectedPivotId)\n          .eq("active", true)\n          .or("status.is.null,status.eq.ativa"),\n      ]);\n      const allEvents = (irrEvents ?? []) as IrrigationEvent[];\n      const sectorized = (activeAssignmentCount ?? 0) > 1;\n      if (sectorized && allEvents.some((ev) => ev.parcel_id == null)) {\n        throw new Error("Balanço bloqueado: há irrigação antiga sem parcela identificada em pivô setorizado.");\n      }\n      const relevantEvents = allEvents.filter((ev) =>\n        ev.parcel_id === assignment.id || (!sectorized && ev.parcel_id == null),\n      );\n      const eventKeys = new Set<string>();\n      for (const ev of relevantEvents) {\n        const key = `${ev.started_at}|${Number(ev.depth_mm)}`;\n        if (eventKeys.has(key)) {\n          throw new Error(`Balanço bloqueado: irrigação duplicada detectada em ${ev.started_at.slice(0, 10)}.`);\n        }\n        eventKeys.add(key);\n      }\n      const irrigationByDate = sumGrossDepthByDate(relevantEvents.map((ev) => ({\n        started_at: ev.started_at,\n        depth_mm: ev.depth_mm,\n      })));\n\n      // 3. Build weather lookup by date''',
"parcel irrigation and remove stored balance fallback",
)

rep(
'''        const r = readingsById.get(readingId);\n        if (r?.et0_source != null) weatherByDate[date] = { et0: r.et0_source, precip: r.precipitation };\n      });\n\n      const missingApprovedDates = datesInRange(dateStart, dateEnd)''',
'''        const r = readingsById.get(readingId);\n        if (r?.et0_calculated != null) weatherByDate[date] = { et0: r.et0_calculated, precip: r.precipitation };\n      });\n\n      // Chuva manual é a observação local preferida, mas só substitui P em um\n      // dia que já possui ETo operacional aprovada.\n      const { data: manualRainRows } = await supabase\n        .from("manual_rainfall_entries")\n        .select("date,precipitation_mm")\n        .eq("farm_id", activeFarmId!)\n        .gte("date", calculationStart)\n        .lte("date", dateEnd);\n      for (const row of manualRainRows ?? []) {\n        const current = weatherByDate[row.date as string];\n        const rain = Number(row.precipitation_mm);\n        if (current && Number.isFinite(rain) && rain >= 0) {\n          weatherByDate[row.date as string] = { ...current, precip: rain };\n        }\n      }\n\n      const missingApprovedDates = datesInRange(calculationStart, dateEnd)''',
"canonical eto and manual rain",
)

rep(
'''          ks_function_override: assignment.ks_function_override,\n        },''',
'''          ks_function_override: assignment.ks_function_override,\n          initial_soil_moisture_pct: hydricAnchor ? hydricAnchor.moistureValue : assignment.initial_soil_moisture_pct,\n          initial_moisture_unit: hydricAnchor ? hydricAnchor.moistureUnit : assignment.initial_moisture_unit,\n          initial_moisture_is_cc: hydricAnchor ? hydricAnchor.isFieldCapacity : assignment.initial_moisture_is_cc,\n          deficit_irrigation: assignment.deficit_irrigation,\n          stress_point_irrigation: assignment.stress_point_irrigation,\n        },''',
"engine initial condition",
)

rep(
'''        pivot: { efficiency: pivot.efficiency, area: pivot.area, flow_rate: pivot.flow_rate },\n        weatherByDate: engineWeatherByDate,\n        irrigationByDate,\n        dateStart,\n        dateEnd,\n      });\n\n      // adapta a saída do motor ao formato de exibição da tela\n      const rows: DailyBalanceRow[] = series.map((d) => ({''',
'''        pivot: { application_efficiency: pivot.application_efficiency, efficiency: pivot.efficiency, area: pivot.area, flow_rate: pivot.flow_rate },\n        weatherByDate: engineWeatherByDate,\n        irrigationByDate,\n        dateStart: calculationStart,\n        dateEnd,\n      });\n      if (series.length === 0) {\n        throw new Error("Balanço bloqueado: valide condição inicial, solo, fases/Kc e eficiência de aplicação.");\n      }\n      const visibleSeries = series.filter((d) => d.date >= dateStart);\n\n      // adapta a saída do motor ao formato de exibição da tela\n      const rows: DailyBalanceRow[] = visibleSeries.map((d) => ({''',
"engine trusted start and visible series",
)

start = text.find('''      // fator p real usado pelo motor (afd / adt)''')
end = text.find('''    } catch (err) {''', start)
if start < 0 or end < 0:
    raise SystemExit("remove client persistence markers not found")
text = text[:start] + '''      setBalanceRows(rows);\n''' + text[end:]

old_dep = '''  }, [assignment, culture, soil, soilLayers, phases, dateStart, dateEnd, selectedPivotId, pivots, activeFarmId, supabase]);'''
new_dep = '''  }, [assignment, culture, soil, soilLayers, phases, hydricAnchor, dateStart, dateEnd, selectedPivotId, pivots, activeFarmId, supabase]);'''
rep(old_dep, new_dep, "calculation dependencies")

start = text.find('''  // Load existing balance from DB when pivot/dates change''')
end = text.find('''  const summary = useMemo''', start)
if start < 0 or end < 0:
    raise SystemExit("remove stale balance loader markers not found")
text = text[:start] + '''  // O balanço corrente é sempre recalculado de entradas confiáveis; histórico\n  // persistido não é usado como estado atual nem como seed do ARM.\n  useEffect(() => {\n    setBalanceRows([]);\n  }, [assignment?.id, dateStart, dateEnd]);\n\n''' + text[end:]

rep(
'''      // estação ativa da fazenda\n      const { data: st } = await supabase\n        .from("weather_stations")\n        .select("id, name, latitude, longitude")\n        .eq("farm_id", activeFarmId)\n        .eq("active", true)\n        .order("name")\n        .limit(1)\n        .maybeSingle();''',
'''      // mesma estação que venceu a seleção operacional no último dia.\n      const { data: latestSelection } = await supabase\n        .from("weather_daily_selection")\n        .select("selected_station_id")\n        .eq("farm_id", activeFarmId)\n        .eq("operational_approved", true)\n        .lte("date", dateEnd)\n        .order("date", { ascending: false })\n        .limit(1)\n        .maybeSingle();\n      const selectedStationId = latestSelection?.selected_station_id as string | undefined;\n      const { data: st } = selectedStationId\n        ? await supabase\n            .from("weather_stations")\n            .select("id,name,latitude,longitude")\n            .eq("id", selectedStationId)\n            .maybeSingle()\n        : { data: null };''',
"trace actual selected station",
)

rep(
'''    efficiency: selPivot ? selPivot.efficiency * 100 : null,''',
'''    efficiency: selPivot ? ((selPivot.application_efficiency ?? selPivot.efficiency) * 100) : null,''',
"display application efficiency",
)

path.write_text(text, encoding="utf-8")
print("balance page patched without changing JSX structure")
