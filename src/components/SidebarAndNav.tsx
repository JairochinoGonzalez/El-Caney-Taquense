import React from 'react';
import {
  Beer,
  CalendarDays,
  ClipboardList,
  DollarSign,
  LogOut,
  Package,
  RefreshCw,
  Settings,
  ShieldCheck,
  Ticket,
  Zap,
} from 'lucide-react';
import { AppSection, BcvRateState, CalendarEvent, UserRole } from '../types';
import { formatBs } from '../utils/formatters';
import { PWAInstallButton } from './PWAInstallButton';

interface SidebarAndNavProps {
  actualRole: UserRole;
  effectiveRole: UserRole;
  userName: string;
  userEmail: string;
  onPreviewRoleChange: (role: UserRole) => void;
  activeSection: AppSection;
  onSelectSection: (section: AppSection) => void;
  activeParty: CalendarEvent | null;
  bcvState: BcvRateState;
  onRefreshBcv: () => void;
  onSignOut: () => void;
}

export const SidebarAndNav: React.FC<SidebarAndNavProps> = ({
  actualRole,
  effectiveRole,
  userName,
  userEmail,
  onPreviewRoleChange,
  activeSection,
  onSelectSection,
  activeParty,
  bcvState,
  onRefreshBcv,
  onSignOut,
}) => {
  const opLabel =
    effectiveRole === 'taquilla'
      ? 'Taquilla (Entradas)'
      : effectiveRole === 'caja'
        ? 'Caja y Barra'
        : effectiveRole === 'mesero'
          ? 'Mesas y Pedidos'
          : 'Operación Nocturna';
  const opShortLabel =
    effectiveRole === 'taquilla'
      ? 'Taquilla'
      : effectiveRole === 'caja'
        ? 'Barra'
        : effectiveRole === 'mesero'
          ? 'Mesas'
          : 'Operación';
  const OpIcon =
    effectiveRole === 'taquilla'
      ? Ticket
      : effectiveRole === 'caja'
        ? Beer
        : effectiveRole === 'mesero'
          ? ClipboardList
          : Zap;

  const navItems: Array<{
    id: AppSection;
    label: string;
    shortLabel: string;
    icon: React.ComponentType<{ className?: string }>;
    adminOnly?: boolean;
    hideForMesero?: boolean;
  }> = [
    {
      id: 'operacion',
      label: opLabel,
      shortLabel: opShortLabel,
      icon: OpIcon,
    },
    {
      id: 'calendario',
      label: 'Calendario y Eventos',
      shortLabel: 'Eventos',
      icon: CalendarDays,
      hideForMesero: true,
    },
    {
      id: 'inventario',
      label: 'Inventario',
      shortLabel: 'Inventario',
      icon: Package,
      hideForMesero: true,
    },
    {
      id: 'finanzas',
      label: 'Finanzas y Nómina',
      shortLabel: 'Finanzas',
      icon: DollarSign,
      adminOnly: true,
    },
    {
      id: 'configuracion',
      label: 'Configuración y Usuarios',
      shortLabel: 'Config.',
      icon: Settings,
      adminOnly: true,
    },
  ];

  const visibleNavItems = navItems.filter((item) => {
    if (item.adminOnly && effectiveRole !== 'admin') return false;
    if (item.hideForMesero && effectiveRole === 'mesero') return false;
    return true;
  });

  const roleDisplayName =
    effectiveRole === 'admin'
      ? 'Administrador'
      : effectiveRole === 'taquilla'
        ? 'Taquilla'
        : effectiveRole === 'mesero'
          ? 'Mesero'
          : 'Caja / Barra';

  return (
    <>
      {/* Fixed Left Sidebar for iPad Landscape & Desktop */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:left-0 bg-white border-r border-[#CBD5E1] z-30">
        <div className="px-5 py-5 border-b border-[#CBD5E1]">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="El Caney Taquense"
              className="w-10 h-10 rounded-xl object-contain shrink-0 shadow-xs"
            />
            <div className="min-w-0">
              <h1 className="font-display font-bold text-base tracking-tight text-[#0F172A] truncate">
                EL CANEY TAQUENSE
              </h1>
              <p className="text-xs text-slate-500 truncate">
                Los Taques · Venezuela
              </p>
            </div>
          </div>
        </div>

        {/* Active Party Quick Banner in Sidebar */}
        <div className="px-4 pt-4">
          <button
            type="button"
            onClick={() => onSelectSection('operacion')}
            className={`w-full text-left p-3.5 rounded-xl border transition-colors ${
              activeParty
                ? 'bg-[#ECFDF5] border-[#10B981]/40 text-[#065F46]'
                : 'bg-[#F8FAFC] border-[#CBD5E1] text-slate-600 hover:bg-slate-100'
            }`}
          >
            <div className="text-[11px] font-semibold uppercase tracking-wider">
              {activeParty ? 'Fiesta Encendida' : 'Caja en Espera'}
            </div>
            <div className="font-display font-bold text-sm text-[#0F172A] mt-0.5 truncate">
              {activeParty ? activeParty.name : 'Sin evento activo'}
            </div>
            <div className="text-xs mt-1 text-slate-600">
              {activeParty
                ? `Ir a ${opShortLabel}`
                : effectiveRole === 'mesero'
                  ? 'Esperando apertura en Caja'
                  : 'Enciende una fiesta en Calendario'}
            </div>
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            const isFinance = item.id === 'finanzas';
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSection(item.id)}
                className={`w-full min-h-[46px] flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
                  isActive
                    ? isFinance
                      ? 'bg-[#1D4ED8] text-white'
                      : 'bg-[#0F172A] text-white'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-[#0F172A]'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom BCV & Signed User */}
        <div className="p-4 border-t border-[#CBD5E1] space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <div>
              <span className="font-medium text-slate-500">Tasa BCV Activa</span>
              <div className="font-bold text-sm text-[#1D4ED8] tabular-nums mt-0.5">
                {formatBs(bcvState.officialRate)}/$
              </div>
              <div className="text-[11px] text-slate-400 truncate max-w-[165px]">
                {bcvState.source}
              </div>
            </div>
            <button
              type="button"
              onClick={onRefreshBcv}
              disabled={bcvState.isLoading}
              title="Actualizar Tasa BCV"
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg border border-[#CBD5E1] text-slate-600 hover:bg-slate-100 hover:text-[#0F172A] transition-colors"
            >
              <RefreshCw
                className={`w-4 h-4 ${bcvState.isLoading ? 'animate-spin' : ''}`}
              />
            </button>
          </div>

          <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-bold text-[#0F172A] truncate">
                {userName}
              </div>
              <div className="text-[11px] tabular-nums text-slate-500 truncate">
                {userEmail}
              </div>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              title="Cerrar sesión"
              className="min-w-[36px] min-h-[36px] px-2.5 rounded-lg border border-[#CBD5E1] text-slate-600 hover:bg-red-50 hover:text-[#EF4444] hover:border-red-200 flex items-center justify-center transition-colors shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          <PWAInstallButton />
        </div>
      </aside>

      {/* Top Bar (All Viewports) */}
      <header className="sticky top-0 z-20 lg:pl-64 bg-white border-b border-[#CBD5E1]">
        <div className="px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
          {/* Brand on Mobile/Tablet + Section Context */}
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/logo.png"
              alt="El Caney Taquense"
              className="lg:hidden w-9 h-9 rounded-lg object-contain shrink-0 shadow-xs"
            />
            <div className="min-w-0">
              <div className="lg:hidden font-display font-bold text-sm text-[#0F172A] truncate">
                EL CANEY TAQUENSE
              </div>
              <div className="hidden lg:block font-display font-bold text-base text-[#0F172A] truncate">
                {navItems.find((n) => n.id === activeSection)?.label}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold text-[#1D4ED8] tabular-nums">
                  BCV: {formatBs(bcvState.officialRate)}/$
                </span>
                {activeParty && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-[#047857] truncate max-w-[160px] sm:max-w-xs">
                      Activa: {activeParty.name}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Admin Role Preview Switcher OR Locked Station Badge + Mobile Refresh/SignOut */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="lg:hidden">
              <PWAInstallButton compact />
            </div>
            <button
              type="button"
              onClick={onRefreshBcv}
              disabled={bcvState.isLoading}
              aria-label="Actualizar Tasa BCV"
              className="lg:hidden min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg border border-[#CBD5E1] text-slate-600 hover:bg-slate-100"
            >
              <RefreshCw
                className={`w-4 h-4 ${bcvState.isLoading ? 'animate-spin' : ''}`}
              />
            </button>

            {actualRole === 'admin' ? (
              <div
                role="group"
                aria-label="Vista previa de estación"
                className="inline-flex items-center p-1 bg-[#F1F5F9] border border-[#CBD5E1] rounded-xl"
              >
                <button
                  type="button"
                  onClick={() => onPreviewRoleChange('admin')}
                  className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                    effectiveRole === 'admin'
                      ? 'bg-[#1D4ED8] text-white shadow-sm'
                      : 'text-slate-600 hover:text-[#0F172A]'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>Admin</span>
                </button>
                <button
                  type="button"
                  onClick={() => onPreviewRoleChange('taquilla')}
                  className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                    effectiveRole === 'taquilla'
                      ? 'bg-[#10B981] text-white shadow-sm'
                      : 'text-slate-600 hover:text-[#0F172A]'
                  }`}
                >
                  <Ticket className="w-3.5 h-3.5 shrink-0" />
                  <span>Taquilla</span>
                </button>
                <button
                  type="button"
                  onClick={() => onPreviewRoleChange('caja')}
                  className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                    effectiveRole === 'caja'
                      ? 'bg-[#0F172A] text-white shadow-sm'
                      : 'text-slate-600 hover:text-[#0F172A]'
                  }`}
                >
                  <Beer className="w-3.5 h-3.5 shrink-0" />
                  <span>Caja</span>
                </button>
                <button
                  type="button"
                  onClick={() => onPreviewRoleChange('mesero')}
                  className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                    effectiveRole === 'mesero'
                      ? 'bg-[#F59E0B] text-white shadow-sm'
                      : 'text-slate-600 hover:text-[#0F172A]'
                  }`}
                >
                  <ClipboardList className="w-3.5 h-3.5 shrink-0" />
                  <span>Mesero</span>
                </button>
              </div>
            ) : (
              <div className="px-3 py-1.5 rounded-xl bg-slate-100 border border-[#CBD5E1] text-xs font-bold text-[#0F172A] flex items-center gap-1.5">
                {effectiveRole === 'taquilla' ? (
                  <Ticket className="w-3.5 h-3.5 text-[#10B981]" />
                ) : effectiveRole === 'mesero' ? (
                  <ClipboardList className="w-3.5 h-3.5 text-[#F59E0B]" />
                ) : (
                  <Beer className="w-3.5 h-3.5 text-[#1D4ED8]" />
                )}
                <span>{roleDisplayName}</span>
                <span className="hidden sm:inline font-normal text-slate-500">
                  · {userName}
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={onSignOut}
              aria-label="Cerrar sesión"
              className="lg:hidden min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg border border-[#CBD5E1] text-slate-600 hover:bg-red-50 hover:text-[#EF4444]"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile / Tablet Portrait Bottom Navigation Bar */}
      <nav
        aria-label="Navegación principal móvil"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-[#E2E8F0]"
      >
        <div
          className={`grid h-16 ${
            visibleNavItems.length === 5
              ? 'grid-cols-5'
              : visibleNavItems.length === 4
                ? 'grid-cols-4'
                : visibleNavItems.length === 3
                  ? 'grid-cols-3'
                  : visibleNavItems.length === 2
                    ? 'grid-cols-2'
                    : 'grid-cols-1'
          }`}
        >
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            const activeColor =
              item.id === 'finanzas' ? 'text-[#1D4ED8]' : 'text-[#0F172A]';
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSection(item.id)}
                className={`flex flex-col items-center justify-center gap-1 min-h-[48px] transition-colors ${
                  isActive ? `${activeColor} font-bold` : 'text-slate-500 font-medium'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[11px] leading-none whitespace-nowrap">
                  {item.shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
