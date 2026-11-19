import React from 'react';
import { AlertTriangle, LogOut, RefreshCw } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('App ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let friendlyMsg =
        'Ocurrió un error al sincronizar con la base de datos o procesar los datos.';
      try {
        const parsed = JSON.parse(this.state.message);
        if (parsed?.error) {
          friendlyMsg = `Error de permisos o conexión (${parsed.operationType || 'operación'}): ${parsed.error}`;
        }
      } catch {
        if (this.state.message) {
          friendlyMsg = this.state.message;
        }
      }

      return (
        <div className="min-h-screen bg-[#E2E8F0] flex items-center justify-center p-4">
          <div className="bg-white border border-[#CBD5E1] shadow-lg rounded-2xl max-w-md w-full p-6 space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-[#EF4444] flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="font-display font-bold text-xl text-[#0F172A]">
              EL CANEY TAQUENSE — Aviso del Sistema
            </h2>
            <p className="text-sm text-slate-600 break-words">{friendlyMsg}</p>
            <div className="flex flex-wrap justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0F172A] text-white text-sm font-bold flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Reintentar
              </button>
              <button
                type="button"
                onClick={() => {
                  void signOut(auth).then(() => window.location.reload());
                }}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-[#CBD5E1] bg-white text-sm font-semibold text-[#0F172A] flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
