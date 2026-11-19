import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  Mail,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { auth, BOOTSTRAP_ADMIN_EMAIL, googleProvider } from '../firebase';
import { PWAInstallButton } from './PWAInstallButton';

interface LoginScreenProps {
  authLoading: boolean;
  needsEmailVerification?: boolean;
  pendingVerificationEmail?: string | null;
  onRefreshVerification?: () => Promise<void>;
  unauthorizedEmail?: string | null;
  unauthorizedReason?: 'not_registered' | 'inactive' | null;
  onSignOut: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  authLoading,
  needsEmailVerification,
  pendingVerificationEmail,
  onRefreshVerification,
  unauthorizedEmail,
  unauthorizedReason,
  onSignOut,
}) => {
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [signingIn, setSigningIn] = useState(false);
  const [resending, setResending] = useState(false);
  const [checkingVerify, setCheckingVerify] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const mapAuthError = (err: unknown): string => {
    const code = (err as { code?: string })?.code || '';
    if (code === 'auth/operation-not-allowed') {
      return 'El inicio de sesión con Correo y Clave aún no está activado en Firebase Console (Authentication → Sign-in method → Correo electrónico/contraseña). Mientras lo activas, puedes ingresar con Google.';
    }
    if (
      code === 'auth/invalid-credential' ||
      code === 'auth/wrong-password' ||
      code === 'auth/user-not-found'
    ) {
      return 'Correo o clave incorrectos, o este correo aún no tiene clave activada. Usa "Activar Clave" o entra con Google y asigna tu clave en Configuración.';
    }
    if (code === 'auth/invalid-email') {
      return 'El formato del correo electrónico no es válido.';
    }
    if (code === 'auth/email-already-in-use') {
      return 'Este correo ya está registrado. Inicia sesión con tu clave o usa "¿Olvidaste tu clave?".';
    }
    if (code === 'auth/weak-password') {
      return 'La clave debe tener al menos 6 caracteres.';
    }
    if (code === 'auth/too-many-requests') {
      return 'Demasiados intentos seguidos. Espera un minuto o ingresa con Google.';
    }
    return 'No se pudo completar el acceso. Verifica tus datos e intenta de nuevo.';
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('Ingresa un correo electrónico válido.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('La clave debe tener al menos 6 caracteres.');
      return;
    }

    if (authTab === 'register' && password !== confirmPassword) {
      setErrorMsg('Las claves ingresadas no coinciden.');
      return;
    }

    setSigningIn(true);
    try {
      if (authTab === 'login') {
        await signInWithEmailAndPassword(auth, cleanEmail, password);
      } else {
        const cred = await createUserWithEmailAndPassword(
          auth,
          cleanEmail,
          password
        );
        await sendEmailVerification(cred.user);
      }
    } catch (err) {
      setErrorMsg(mapAuthError(err));
    } finally {
      setSigningIn(false);
    }
  };

  const handleResetPassword = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg(
        'Escribe tu correo electrónico arriba para enviarte el enlace de recuperación.'
      );
      return;
    }
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setInfoMsg(
        `Se envió un enlace para restablecer la clave a ${cleanEmail}.`
      );
    } catch (err) {
      setErrorMsg(mapAuthError(err));
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'No se pudo iniciar sesión.';
      if (!msg.includes('popup-closed-by-user')) {
        setErrorMsg('No se pudo completar el inicio de sesión con Google.');
      }
    } finally {
      setSigningIn(false);
    }
  };

  const handleResendVerification = async () => {
    if (!auth.currentUser) return;
    setResending(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      await sendEmailVerification(auth.currentUser);
      setInfoMsg(
        `Correo de verificación reenviado a ${auth.currentUser.email}. Revisa tu bandeja o spam.`
      );
    } catch (err) {
      setErrorMsg(mapAuthError(err));
    } finally {
      setResending(false);
    }
  };

  const handleCheckVerification = async () => {
    if (!onRefreshVerification) return;
    setCheckingVerify(true);
    setErrorMsg(null);
    try {
      await onRefreshVerification();
    } catch {
      setErrorMsg('Aún no aparece verificado. Abre el enlace en tu correo e intenta de nuevo.');
    } finally {
      setCheckingVerify(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#E2E8F0] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl border border-[#CBD5E1] shadow-xl overflow-hidden">
        <div className="bg-[#0F172A] text-white px-6 py-5 flex items-center gap-3.5">
          <img
            src="/logo.png"
            alt="El Caney Taquense"
            className="w-13 h-13 rounded-xl object-contain shrink-0 border border-amber-400/25 shadow-xs"
          />
          <div>
            <h1 className="font-display font-bold text-xl tracking-tight">
              EL CANEY TAQUENSE
            </h1>
            <p className="text-xs text-slate-300 mt-0.5">
              Los Taques, Venezuela · Gestión Operativa y Financiera
            </p>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {authLoading ? (
            <div className="py-10 flex flex-col items-center justify-center gap-3 text-slate-600">
              <Loader2 className="w-8 h-8 animate-spin text-[#1D4ED8]" />
              <p className="text-sm font-medium">
                Verificando sesión y permisos...
              </p>
            </div>
          ) : needsEmailVerification ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                  <Mail className="w-5 h-5 shrink-0" />
                  <span>Verifica tu Correo Electrónico</span>
                </div>
                <p className="text-xs text-amber-900 leading-relaxed">
                  Enviamos un enlace de confirmación a{' '}
                  <strong className="tabular-nums">
                    {pendingVerificationEmail}
                  </strong>
                  . Ábrelo desde tu bandeja de entrada para activar la seguridad
                  de la base de datos.
                </p>
              </div>

              {infoMsg && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{infoMsg}</span>
                </div>
              )}

              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
                  {errorMsg}
                </div>
              )}

              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={checkingVerify}
                  onClick={handleCheckVerification}
                  className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] disabled:opacity-60 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  {checkingVerify ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Ya verifiqué mi correo, Entrar
                </button>

                <button
                  type="button"
                  disabled={resending}
                  onClick={handleResendVerification}
                  className="w-full min-h-[44px] px-4 py-2 rounded-xl border border-[#CBD5E1] bg-white hover:bg-slate-50 text-[#0F172A] font-semibold text-xs flex items-center justify-center gap-2"
                >
                  <Mail className="w-4 h-4" />
                  {resending
                    ? 'Reenviando...'
                    : 'Reenviar Correo de Verificación'}
                </button>

                <button
                  type="button"
                  onClick={onSignOut}
                  className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-[#0F172A] hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  Volver / Usar otra cuenta
                </button>
              </div>
            </div>
          ) : unauthorizedEmail ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 space-y-2">
                <div className="flex items-center gap-2 text-red-800 font-bold text-sm">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span>
                    {unauthorizedReason === 'inactive'
                      ? 'Usuario Desactivado'
                      : 'Correo sin acceso autorizado'}
                  </span>
                </div>
                <p className="text-xs text-red-900 leading-relaxed">
                  La cuenta{' '}
                  <strong className="tabular-nums">{unauthorizedEmail}</strong>{' '}
                  {unauthorizedReason === 'inactive'
                    ? 'se encuentra suspendida temporalmente por el Administrador.'
                    : 'no está registrada en el sistema de El Caney Taquense.'}
                </p>
                <p className="text-xs text-slate-700">
                  Solicita al Dueño / Administrador (
                  <span className="tabular-nums font-semibold">
                    {BOOTSTRAP_ADMIN_EMAIL}
                  </span>
                  ) que agregue o active tu correo en{' '}
                  <strong>Configuración → Usuarios</strong>.
                </p>
              </div>

              <button
                type="button"
                onClick={onSignOut}
                className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-[#0F172A] hover:bg-slate-800 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Cambiar de Cuenta
              </button>
            </div>
          ) : (
            <>
              <div className="flex rounded-xl bg-[#F1F5F9] p-1 border border-[#CBD5E1]">
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('login');
                    setErrorMsg(null);
                    setInfoMsg(null);
                  }}
                  className={`flex-1 min-h-[38px] rounded-lg text-xs font-bold transition-colors ${
                    authTab === 'login'
                      ? 'bg-white text-[#0F172A] shadow-xs'
                      : 'text-slate-600 hover:text-[#0F172A]'
                  }`}
                >
                  Entrar con Correo y Clave
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('register');
                    setErrorMsg(null);
                    setInfoMsg(null);
                  }}
                  className={`flex-1 min-h-[38px] rounded-lg text-xs font-bold transition-colors ${
                    authTab === 'register'
                      ? 'bg-white text-[#1D4ED8] shadow-xs'
                      : 'text-slate-600 hover:text-[#0F172A]'
                  }`}
                >
                  Activar Clave
                </button>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700 leading-relaxed">
                  {errorMsg}
                </div>
              )}

              {infoMsg && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 leading-relaxed">
                  {infoMsg}
                </div>
              )}

              <form onSubmit={handleEmailSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Correo Electrónico
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="correo@ejemplo.com"
                      className="w-full min-h-[44px] pl-10 pr-3.5 py-2 border border-[#CBD5E1] rounded-xl text-sm tabular-nums bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">
                      Clave de Acceso
                    </label>
                    {authTab === 'login' && (
                      <button
                        type="button"
                        onClick={handleResetPassword}
                        className="text-[11px] font-semibold text-[#1D4ED8] hover:underline"
                      >
                        ¿Olvidaste tu clave?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete={
                        authTab === 'login'
                          ? 'current-password'
                          : 'new-password'
                      }
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Ingresa tu clave (mín. 6 caracteres)"
                      className="w-full min-h-[44px] pl-10 pr-10 py-2 border border-[#CBD5E1] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={
                        showPassword ? 'Ocultar clave' : 'Mostrar clave'
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {authTab === 'register' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Confirmar Clave
                    </label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repite la clave"
                        className="w-full min-h-[44px] pl-10 pr-3.5 py-2 border border-[#CBD5E1] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={signingIn}
                  className="w-full min-h-[48px] px-5 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] disabled:opacity-60 text-white font-display font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
                >
                  {signingIn ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <LogIn className="w-4 h-4" />
                  )}
                  {signingIn
                    ? 'Verificando...'
                    : authTab === 'login'
                      ? 'Entrar con Correo y Clave'
                      : 'Registrar Clave y Verificar'}
                </button>
              </form>

              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-slate-200" />
                <span className="shrink mx-3 text-[11px] font-bold uppercase text-slate-400">
                  o acceso rápido
                </span>
                <div className="flex-grow border-t border-slate-200" />
              </div>

              <button
                type="button"
                disabled={signingIn}
                onClick={handleGoogleLogin}
                className="w-full min-h-[48px] px-5 py-2.5 rounded-xl bg-[#1D4ED8] hover:bg-blue-800 disabled:opacity-60 text-white font-display font-bold text-sm flex items-center justify-center gap-2.5 shadow-sm transition-colors"
              >
                <ShieldCheck className="w-4 h-4" />
                Entrar con Correo Google
              </button>

              <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] text-[11px] text-slate-600 leading-relaxed">
                <strong className="text-[#0F172A]">Estaciones por rol:</strong>{' '}
                <strong>Taquilla</strong> (Entradas) ·{' '}
                <strong>Caja</strong> (Licores y Cierres) ·{' '}
                <strong>Mesero</strong> (Mesas y Pedidos) ·{' '}
                <strong>Admin</strong> (Control total y Finanzas).
              </div>

              <PWAInstallButton />
            </>
          )}
        </div>
      </div>
    </div>
  );
};
