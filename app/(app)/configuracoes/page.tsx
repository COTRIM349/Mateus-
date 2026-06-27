"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { useAuth, useTheme } from "@/components/providers";
import { Button } from "@/components/ui/Button";

export default function ConfiguracoesPage() {
  const { profile, farms, activeFarmId, setActiveFarm } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const roleLabels: Record<string, string> = {
    admin: "Administrador",
    manager: "Gestor",
    operator: "Operador",
    viewer: "Visualizador",
  };

  return (
    <div>
      <PageHeader titulo="Configurações" descricao="Perfil, fazenda ativa e preferências" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-graphite-900 dark:text-white">Perfil</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Nome</span>
              <span className="font-medium text-graphite-900 dark:text-gray-200">{profile?.name ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">E-mail</span>
              <span className="font-medium text-graphite-900 dark:text-gray-200">{profile?.email ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Papel</span>
              <span className="font-medium text-graphite-900 dark:text-gray-200">{roleLabels[profile?.role ?? "viewer"]}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Empresa</span>
              <span className="font-medium text-graphite-900 dark:text-gray-200">{profile?.companyName ?? "—"}</span>
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 text-sm font-semibold text-graphite-900 dark:text-white">Fazenda ativa</h3>
          {farms.length > 0 ? (
            <div className="space-y-3">
              {farms.map((farm) => (
                <button
                  key={farm.id}
                  type="button"
                  onClick={() => setActiveFarm(farm.id)}
                  className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-sm transition-colors ${
                    farm.id === activeFarmId
                      ? "border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-900/20 dark:text-brand-400"
                      : "border-gray-200 text-graphite-900 hover:border-gray-300 dark:border-graphite-700 dark:text-gray-200 dark:hover:border-graphite-600"
                  }`}
                >
                  <span className="font-medium">{farm.name}</span>
                  {farm.id === activeFarmId && (
                    <span className="text-xs font-semibold text-brand-600 dark:text-brand-400">Ativa</span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Nenhuma fazenda vinculada ao seu perfil.
            </p>
          )}
        </Card>

        <Card>
          <h3 className="mb-4 text-sm font-semibold text-graphite-900 dark:text-white">Aparência</h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-graphite-900 dark:text-gray-200">Tema</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {theme === "dark" ? "Modo escuro ativo" : "Modo claro ativo"}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={toggleTheme}>
              {theme === "dark" ? "Modo claro" : "Modo escuro"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
