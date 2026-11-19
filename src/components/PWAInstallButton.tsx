import React, { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  compact = false,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={
          compact
            ? 'min-h-[36px] px-2.5 py-1.5 rounded-lg bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0'
            : 'w-full min-h-[40px] px-3 py-2 rounded-xl bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors'
        }
      >
        <Download className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
        <span>{compact ? 'Instalar' : 'Instalar App en Dispositivo'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={
            compact
              ? 'min-h-[36px] px-2.5 py-1.5 rounded-lg border border-[#CBD5E1] bg-slate-50 hover:bg-slate-100 text-[#0F172A] text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0'
              : 'w-full min-h-[40px] px-3 py-2 rounded-xl border border-[#CBD5E1] bg-slate-50 hover:bg-slate-100 text-[#0F172A] text-xs font-bold flex items-center justify-center gap-2 transition-colors'
          }
        >
          <Smartphone className="w-3.5 h-3.5 text-[#1D4ED8] shrink-0" />
          <span>{compact ? 'Instalar iOS' : 'Agregar a Pantalla de Inicio'}</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white border border-[#CBD5E1] rounded-2xl max-w-sm w-full overflow-hidden shadow-2xl">
              <div className="bg-[#0F172A] text-white px-5 py-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img
                    src="/logo.png"
                    alt="El Caney Taquense"
                    className="w-9 h-9 rounded-lg object-contain shrink-0"
                  />
                  <div>
                    <h3 className="font-display font-bold text-sm">
                      Instalar El Caney en iPhone / iPad
                    </h3>
                    <p className="text-[11px] text-slate-300">
                      Acceso directo como aplicación
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="text-slate-300 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-3 text-xs text-slate-700 leading-relaxed">
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-blue-50 text-[#1D4ED8] font-bold flex items-center justify-center shrink-0">
                    1
                  </span>
                  <span>
                    Toca el botón{' '}
                    <strong className="inline-flex items-center gap-1 text-[#0F172A]">
                      Compartir <Share className="w-3.5 h-3.5" />
                    </strong>{' '}
                    en la barra de Safari.
                  </span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-blue-50 text-[#1D4ED8] font-bold flex items-center justify-center shrink-0">
                    2
                  </span>
                  <span>
                    Desliza hacia abajo y toca{' '}
                    <strong className="text-[#0F172A]">
                      &ldquo;Agregar a inicio&rdquo;
                    </strong>{' '}
                    (Add to Home Screen).
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="w-full min-h-[42px] mt-2 rounded-xl bg-[#0F172A] hover:bg-slate-800 text-white font-bold text-xs transition-colors"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
