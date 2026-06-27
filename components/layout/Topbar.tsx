/**
 * Barra superior fixa.
 * Exibe busca, ações rápidas e o perfil do usuário (estático nesta etapa).
 */
export function Topbar() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-6 lg:px-8">
      {/* Espaço à esquerda (compensa o botão hambúrguer no mobile) */}
      <div className="flex items-center gap-3 pl-12 lg:pl-0">
        <div className="hidden text-sm text-gray-500 sm:block">
          Safra 2025/2026 · Fazenda Santa Helena
        </div>
      </div>

      {/* Busca */}
      <div className="mx-4 hidden max-w-md flex-1 md:block">
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.3-4.3m1.3-5.2a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
            </svg>
          </span>
          <input
            type="search"
            placeholder="Buscar pivôs, culturas, alertas..."
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-3 text-sm text-graphite-900 outline-none focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>

      {/* Ações + perfil */}
      <div className="flex items-center gap-3">
        {/* Notificações */}
        <button
          type="button"
          aria-label="Notificações"
          className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-graphite-900"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0" />
          </svg>
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
        </button>

        {/* Perfil */}
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-white">
            CI
          </div>
          <div className="hidden text-left sm:block">
            <p className="text-sm font-medium text-graphite-900">Equipe Cotrim</p>
            <p className="text-xs text-gray-500">Gestor agrícola</p>
          </div>
        </div>
      </div>
    </header>
  );
}
