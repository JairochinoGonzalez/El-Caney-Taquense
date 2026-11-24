import React, { useState } from 'react';
import {
  ArrowRightLeft,
  Beer,
  CheckCircle2,
  ClipboardList,
  Copy,
  Crown,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Plus,
  ShieldCheck,
  Ticket,
  Trash2,
  Unlock,
  UserCheck,
  UserCog,
  UserX,
  X,
} from 'lucide-react';
import {
  createEmailPasswordAuthUser,
  emailToDocId,
  linkOrUpdateMyPassword,
  sendUserPasswordReset,
} from '../firebase';
import { StaffUserAccount, UserRole } from '../types';
import { formatDateSpanish, formatTime } from '../utils/formatters';

interface SettingsUsersModuleProps {
  currentUserEmail: string;
  primaryAdminEmail: string;
  staffUsers: StaffUserAccount[];
  allowEmployeeProductEdit: boolean;
  onToggleAllowEmployeeEdit: (allowed: boolean) => void;
  onSaveStaffUser: (params: {
    name: string;
    email: string;
    role: UserRole;
    active: boolean;
  }) => Promise<void>;
  onDeleteStaffUser: (userId: string) => Promise<void>;
  onTransferPrimaryAdmin: (params: {
    newEmail: string;
    newName: string;
    keepPreviousAsAdmin: boolean;
  }) => Promise<void>;
  onMarkUserPasswordUpdated: (userId: string) => Promise<void>;
  previewRole: UserRole;
  onChangePreviewRole: (role: UserRole) => void;
}

export const SettingsUsersModule: React.FC<SettingsUsersModuleProps> = ({
  currentUserEmail,
  primaryAdminEmail,
  staffUsers,
  allowEmployeeProductEdit,
  onToggleAllowEmployeeEdit,
  onSaveStaffUser,
  onDeleteStaffUser,
  onTransferPrimaryAdmin,
  onMarkUserPasswordUpdated,
  previewRole,
  onChangePreviewRole,
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [showStaffPass, setShowStaffPass] = useState(false);
  const [role, setRole] = useState<UserRole>('caja');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<StaffUserAccount | null>(
    null
  );

  // Primary Admin Transfer state
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [transferEmail, setTransferEmail] = useState('');
  const [transferName, setTransferName] = useState('');
  const [keepPreviousAsAdmin, setKeepPreviousAsAdmin] = useState(true);
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  // Per-User Password Management Modal state
  const [passwordTarget, setPasswordTarget] = useState<StaffUserAccount | null>(
    null
  );
  const [targetNewPassword, setTargetNewPassword] = useState('');
  const [showTargetPass, setShowTargetPass] = useState(true);
  const [savingTargetPass, setSavingTargetPass] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [targetPassError, setTargetPassError] = useState<string | null>(null);
  const [targetPassSuccess, setTargetPassSuccess] = useState<string | null>(
    null
  );

  // Admin own email password state
  const [myPassword, setMyPassword] = useState('');
  const [showMyPass, setShowMyPass] = useState(false);
  const [savingMyPass, setSavingMyPass] = useState(false);
  const [myPassError, setMyPassError] = useState<string | null>(null);

  const normalizedPrimaryEmail = primaryAdminEmail.trim().toLowerCase();
  const normalizedCurrentEmail = currentUserEmail.trim().toLowerCase();
  const primaryOwnerRecord = staffUsers.find(
    (u) => u.email.trim().toLowerCase() === normalizedPrimaryEmail
  );

  const showFlash = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 4500);
  };

  const handleSetMyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMyPassError(null);
    if (myPassword.length < 6) {
      setMyPassError('La clave debe tener al menos 6 caracteres.');
      return;
    }
    setSavingMyPass(true);
    try {
      await linkOrUpdateMyPassword(myPassword);
      await onMarkUserPasswordUpdated(emailToDocId(normalizedCurrentEmail));
      setMyPassword('');
      showFlash(
        `Clave actualizada correctamente para ${currentUserEmail}. Ya puedes entrar con correo y clave.`
      );
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed') {
        setMyPassError(
          'Primero activa el método "Correo electrónico/contraseña" en Firebase Console → Authentication → Sign-in method.'
        );
      } else if (code === 'auth/weak-password') {
        setMyPassError('La clave es muy débil. Usa al menos 6 caracteres.');
      } else {
        setMyPassError(
          'No se pudo actualizar la clave. Verifica e intenta de nuevo.'
        );
      }
    } finally {
      setSavingMyPass(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();
    if (!cleanName || !cleanEmail.includes('@')) {
      setFormError('Ingresa un nombre válido y un correo electrónico real.');
      return;
    }
    if (staffPassword && staffPassword.length < 6) {
      setFormError(
        'Si asignas una clave inicial, debe tener al menos 6 caracteres.'
      );
      return;
    }

    setSaving(true);
    try {
      await onSaveStaffUser({
        name: cleanName,
        email: cleanEmail,
        role,
        active: true,
      });

      let extraNote = '';
      if (staffPassword.length >= 6) {
        try {
          const res = await createEmailPasswordAuthUser(
            cleanEmail,
            staffPassword
          );
          await onMarkUserPasswordUpdated(emailToDocId(cleanEmail));
          extraNote =
            res === 'created'
              ? ' Se creó la clave y se envió enlace de verificación al correo.'
              : ' El correo ya tenía cuenta registrada; usa "Contraseña" en la lista para enviar enlace de cambio.';
        } catch (authErr: unknown) {
          const code = (authErr as { code?: string })?.code || '';
          extraNote =
            code === 'auth/operation-not-allowed'
              ? ' (Autorizado para Google; activa Correo/Clave en Firebase Console para habilitar la clave).'
              : ' (Autorizado en lista; el usuario puede activar su clave desde el login).';
        }
      }

      setName('');
      setEmail('');
      setStaffPassword('');
      setRole('caja');
      showFlash(
        `Usuario ${cleanName} (${cleanEmail}) guardado con éxito.${extraNote}`
      );
    } catch {
      setFormError('No se pudo guardar el usuario. Verifica tu conexión.');
    } finally {
      setSaving(false);
    }
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTransferError(null);
    const cleanEmail = transferEmail.trim().toLowerCase();
    const cleanName = transferName.trim();
    if (!cleanName || !cleanEmail.includes('@')) {
      setTransferError(
        'Ingresa el nombre y un correo electrónico válido para el nuevo Administrador Total.'
      );
      return;
    }
    setTransferring(true);
    try {
      await onTransferPrimaryAdmin({
        newEmail: cleanEmail,
        newName: cleanName,
        keepPreviousAsAdmin,
      });
      setTransferEmail('');
      setTransferName('');
      setShowTransferForm(false);
      showFlash(
        `Propiedad principal transferida a ${cleanName} (${cleanEmail}). Ahora es el Administrador Total / Dueño.`
      );
    } catch {
      setTransferError(
        'No se pudo transferir el correo principal. Verifica tu conexión e intenta de nuevo.'
      );
    } finally {
      setTransferring(false);
    }
  };

  const openPasswordModal = (user: StaffUserAccount) => {
    setPasswordTarget(user);
    setTargetNewPassword('');
    setShowTargetPass(true);
    setTargetPassError(null);
    setTargetPassSuccess(null);
  };

  const handleSaveTargetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordTarget) return;
    setTargetPassError(null);
    setTargetPassSuccess(null);

    if (targetNewPassword.length < 6) {
      setTargetPassError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    const isSelf =
      passwordTarget.email.trim().toLowerCase() === normalizedCurrentEmail;

    setSavingTargetPass(true);
    try {
      if (isSelf) {
        await linkOrUpdateMyPassword(targetNewPassword);
        await onMarkUserPasswordUpdated(passwordTarget.id);
        setTargetPassSuccess(
          'Tu contraseña se actualizó inmediatamente en Firebase Auth.'
        );
        showFlash(`Contraseña actualizada para ${passwordTarget.email}.`);
      } else {
        const res = await createEmailPasswordAuthUser(
          passwordTarget.email,
          targetNewPassword
        );
        await onMarkUserPasswordUpdated(passwordTarget.id);
        if (res === 'created') {
          setTargetPassSuccess(
            'Clave inicial creada en Firebase Auth y correo de verificación enviado. Cópiala antes de cerrar esta ventana si deseas entregarla ahora.'
          );
          showFlash(`Clave inicial asignada a ${passwordTarget.name}.`);
        } else {
          await sendUserPasswordReset(passwordTarget.email);
          setTargetPassSuccess(
            `Esta cuenta ya tenía clave en Firebase Auth. Por seguridad, se envió automáticamente un enlace de cambio de contraseña a ${passwordTarget.email}.`
          );
          showFlash(
            `Enlace de cambio de contraseña enviado a ${passwordTarget.email}.`
          );
        }
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed') {
        setTargetPassError(
          'Activa "Correo electrónico/contraseña" en Firebase Console → Authentication → Sign-in method.'
        );
      } else if (code === 'auth/weak-password') {
        setTargetPassError('Clave muy débil. Usa al menos 6 caracteres.');
      } else {
        setTargetPassError(
          'No se pudo actualizar la contraseña. Intenta enviar el enlace de restablecimiento.'
        );
      }
    } finally {
      setSavingTargetPass(false);
    }
  };

  const handleSendResetEmail = async (user: StaffUserAccount) => {
    setTargetPassError(null);
    setTargetPassSuccess(null);
    setSendingReset(true);
    try {
      await sendUserPasswordReset(user.email);
      await onMarkUserPasswordUpdated(user.id);
      const msg = `Se envió un enlace seguro para cambiar la contraseña a ${user.email}.`;
      setTargetPassSuccess(msg);
      showFlash(msg);
    } catch {
      setTargetPassError(
        'No se pudo enviar el correo de cambio de contraseña. Verifica que el usuario ya haya activado su cuenta o intenta asignar una clave inicial.'
      );
    } finally {
      setSendingReset(false);
    }
  };

  const handleRoleUpdate = async (user: StaffUserAccount, nextRole: UserRole) => {
    if (user.email.trim().toLowerCase() === normalizedPrimaryEmail) return;
    await onSaveStaffUser({
      name: user.name,
      email: user.email,
      role: nextRole,
      active: user.active,
    });
    showFlash(`Rol de ${user.name} actualizado.`);
  };

  const handleToggleActive = async (user: StaffUserAccount) => {
    if (user.email.trim().toLowerCase() === normalizedPrimaryEmail) return;
    await onSaveStaffUser({
      name: user.name,
      email: user.email,
      role: user.role,
      active: !user.active,
    });
    showFlash(
      !user.active
        ? `Acceso activado para ${user.name}.`
        : `Acceso pausado para ${user.name}.`
    );
  };

  const getRoleBadge = (r: UserRole, isOwner = false) => {
    if (r === 'admin' && isOwner) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0F172A] text-[#FBBF24] text-xs font-bold">
          <Crown className="w-3.5 h-3.5" />
          Administrador Total / Dueño
        </span>
      );
    }
    if (r === 'admin') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-[#1D4ED8] text-xs font-bold">
          <ShieldCheck className="w-3.5 h-3.5" />
          Administrador
        </span>
      );
    }
    if (r === 'taquilla') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-[#065F46] text-xs font-bold">
          <Ticket className="w-3.5 h-3.5" />
          Taquilla (Puerta)
        </span>
      );
    }
    if (r === 'mesero') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold">
          <ClipboardList className="w-3.5 h-3.5" />
          Mesero (Mesas)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-300 text-[#0F172A] text-xs font-bold">
        <Beer className="w-3.5 h-3.5" />
        Caja / Barra (Operador)
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {flash && (
        <div className="bg-[#0F172A] text-white px-4 py-3 rounded-xl text-sm font-semibold flex items-center gap-2 shadow-sm">
          <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
          <span>{flash}</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-[#1D4ED8]">
            Configuración y Seguridad
          </div>
          <h2 className="font-display font-bold text-xl text-[#0F172A] mt-0.5">
            Gestión de Usuarios y Permisos por Estación
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Sesión actual:{' '}
            <strong className="tabular-nums text-[#0F172A]">
              {currentUserEmail}
            </strong>{' '}
            · Crea cuentas por correo Google para asignar exactamente qué ve
            cada trabajador.
          </p>
        </div>

        {/* Admin Preview Switcher */}
        <div className="bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl p-2.5 space-y-1.5 shrink-0">
          <div className="text-[11px] font-bold uppercase text-slate-500">
            Probar Vista de Estación (Solo Admin)
          </div>
          <div className="inline-flex flex-wrap gap-1">
            {(
              [
                ['admin', 'Admin'],
                ['taquilla', 'Taquilla'],
                ['caja', 'Caja / Barra'],
                ['mesero', 'Mesero'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => onChangePreviewRole(val)}
                className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                  previewRole === val
                    ? 'bg-[#1D4ED8] text-white'
                    : 'bg-white border border-[#CBD5E1] text-slate-700 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Role Matrix Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-[#CBD5E1] rounded-2xl p-4 space-y-1.5">
          <div className="flex items-center gap-2 font-display font-bold text-sm text-[#065F46]">
            <Ticket className="w-4 h-4 text-[#10B981]" />
            Rol: Taquilla
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Solo ve <strong>Taquilla (Entradas)</strong>,{' '}
            <strong>Calendario</strong>, <strong>Inventario</strong> y el{' '}
            <strong>Cierre del Evento</strong> al finalizar. Bloqueado en Barra,
            Finanzas y Configuración.
          </p>
        </div>

        <div className="bg-white border border-[#CBD5E1] rounded-2xl p-4 space-y-1.5">
          <div className="flex items-center gap-2 font-display font-bold text-sm text-[#0F172A]">
            <Beer className="w-4 h-4 text-[#1D4ED8]" />
            Rol: Caja / Barra
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Solo ve <strong>Caja y Barra (Licores)</strong>, cobra las mesas de
            meseros, ve <strong>Calendario</strong>, <strong>Inventario</strong> y
            el <strong>Cierre</strong>. Bloqueado en Taquilla y Finanzas.
          </p>
        </div>

        <div className="bg-white border border-[#CBD5E1] rounded-2xl p-4 space-y-1.5">
          <div className="flex items-center gap-2 font-display font-bold text-sm text-amber-900">
            <ClipboardList className="w-4 h-4 text-[#F59E0B]" />
            Rol: Mesero (Mesas)
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Solo registra <strong>Mesas y Pedidos</strong> de bebidas, pide el
            cierre al Cajero y visualiza el <strong>cierre total a pagar</strong>{' '}
            en tiempo real. No puede cobrar ni cerrar facturas solo.
          </p>
        </div>

        <div className="bg-white border border-[#CBD5E1] rounded-2xl p-4 space-y-1.5">
          <div className="flex items-center gap-2 font-display font-bold text-sm text-[#1D4ED8]">
            <ShieldCheck className="w-4 h-4" />
            Rol: Administrador (Dueño)
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Acceso completo: Taquilla, Caja/Barra, Mesas, Calendario, Inventario
            con valor en dinero, Finanzas/BCV, Nómina y Creación de Usuarios.
          </p>
        </div>
      </div>

      {/* Main "Usuarios y Permisos" Card — Owner Management + Authorized Emails + Password Controls */}
      <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl overflow-hidden">
        <div className="px-5 py-4 bg-[#0F172A] text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-[#FBBF24] shrink-0" />
            <div>
              <h3 className="font-display font-bold text-lg leading-tight">
                Usuarios y Permisos
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Propietario principal, correos autorizados en Firestore y gestión de contraseñas.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 text-xs font-bold text-[#FBBF24] shrink-0">
            <Crown className="w-3.5 h-3.5" />
            Administrador Total / Dueño
          </span>
        </div>

        {/* Current Primary Owner Banner + Transfer Ownership Form */}
        <div className="p-5 bg-[#F8FAFC] border-b border-[#CBD5E1] space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Administrador Total Actual (Dueño de la App)
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display font-bold text-lg text-[#0F172A]">
                  {primaryOwnerRecord?.name || 'Yohelly Bracho'}
                </span>
                {getRoleBadge('admin', true)}
              </div>
              <div className="text-sm font-semibold text-[#1D4ED8] tabular-nums">
                {normalizedPrimaryEmail}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setShowTransferForm((v) => !v);
                setTransferError(null);
              }}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-[#CBD5E1] bg-white hover:bg-slate-100 text-[#0F172A] text-xs font-bold flex items-center justify-center gap-2 transition-colors shrink-0"
            >
              <ArrowRightLeft className="w-4 h-4 text-[#1D4ED8]" />
              {showTransferForm
                ? 'Cancelar Transferencia'
                : 'Transferir / Editar Correo Principal'}
            </button>
          </div>

          {showTransferForm && (
            <form
              onSubmit={handleTransferSubmit}
              className="p-4 rounded-xl bg-white border border-blue-200 space-y-3"
            >
              <div className="text-xs font-bold text-[#1D4ED8]">
                Transferir Propiedad Principal (Sin modificar código)
              </div>
              <p className="text-xs text-slate-600">
                El nuevo correo recibirá automáticamente el rol de{' '}
                <strong>Administrador Total / Dueño</strong> y acceso completo a
                Inventario, Eventos, Caja/POS, Tasa BCV, Finanzas/Reportes y
                Configuración en Firestore.
              </p>

              {transferError && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
                  {transferError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nombre del Nuevo Dueño
                  </label>
                  <input
                    type="text"
                    required
                    value={transferName}
                    onChange={(e) => setTransferName(e.target.value)}
                    placeholder="Ej: Yohelly Bracho"
                    className="w-full min-h-[42px] px-3 py-2 border border-[#CBD5E1] rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nuevo Correo Principal
                  </label>
                  <input
                    type="email"
                    required
                    value={transferEmail}
                    onChange={(e) => setTransferEmail(e.target.value)}
                    placeholder="nuevo.dueno@gmail.com"
                    className="w-full min-h-[42px] px-3 py-2 border border-[#CBD5E1] rounded-xl text-sm tabular-nums"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={keepPreviousAsAdmin}
                  onChange={(e) => setKeepPreviousAsAdmin(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#1D4ED8]"
                />
                Mantener al correo anterior ({normalizedPrimaryEmail}) como
                Administrador secundario autorizado
              </label>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowTransferForm(false)}
                  className="min-h-[40px] px-4 rounded-xl border border-[#CBD5E1] bg-white text-xs font-bold text-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={transferring}
                  className="min-h-[40px] px-4 rounded-xl bg-[#1D4ED8] hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  {transferring
                    ? 'Transfiriendo...'
                    : 'Confirmar Nuevo Dueño Principal'}
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="p-5 grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Create User Form */}
          <form
            onSubmit={handleCreateSubmit}
            className="xl:col-span-5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-2xl p-5 space-y-4"
          >
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
            <UserCog className="w-5 h-5 text-[#1D4ED8]" />
            <h3 className="font-display font-bold text-lg text-[#0F172A]">
              Crear / Autorizar Nuevo Usuario
            </h3>
          </div>

          {formError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Nombre del Trabajador / Socio
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Mariana Gómez (Taquilla)"
              className="w-full min-h-[44px] px-3.5 py-2 border border-[#CBD5E1] rounded-xl text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Correo Electrónico
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ejemplo@gmail.com"
              className="w-full min-h-[44px] px-3.5 py-2 border border-[#CBD5E1] rounded-xl text-sm tabular-nums"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Clave Inicial de Acceso (Opcional)
            </label>
            <div className="relative">
              <input
                type={showStaffPass ? 'text' : 'password'}
                value={staffPassword}
                onChange={(e) => setStaffPassword(e.target.value)}
                placeholder="Mín. 6 caracteres (o dejar vacío para Google)"
                className="w-full min-h-[44px] pl-3.5 pr-10 py-2 border border-[#CBD5E1] rounded-xl text-sm"
              />
              <button
                type="button"
                onClick={() => setShowStaffPass((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                {showStaffPass ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Estación y Permisos Asignados
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full min-h-[44px] px-3.5 py-2 border border-[#CBD5E1] rounded-xl text-sm bg-white font-semibold"
            >
              <option value="taquilla">
                Taquilla (Solo Entradas + Eventos + Inventario + Cierre)
              </option>
              <option value="caja">
                Caja / Barra (Solo Bebidas + Cobro de Mesas + Eventos + Inventario)
              </option>
              <option value="mesero">
                Mesero (Solo Mesas y Pedidos · Cierre en Caja)
              </option>
              <option value="admin">
                Administrador (Acceso Total + Finanzas + Usuarios)
              </option>
            </select>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full min-h-[48px] px-5 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] disabled:opacity-50 text-white font-display font-bold text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {saving ? 'Guardando Usuario...' : 'Autorizar Usuario'}
          </button>

          {/* Operational Inventory Toggle */}
          <div className="pt-4 border-t border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-bold text-[#0F172A]">
                {allowEmployeeProductEdit ? (
                  <Unlock className="w-4 h-4 text-[#10B981]" />
                ) : (
                  <Lock className="w-4 h-4 text-[#1D4ED8]" />
                )}
                <span>Edición de Precios en Inventario</span>
              </div>
              <button
                type="button"
                onClick={() =>
                  onToggleAllowEmployeeEdit(!allowEmployeeProductEdit)
                }
                className={`min-h-[34px] px-3 py-1 rounded-lg border text-xs font-bold transition-colors ${
                  allowEmployeeProductEdit
                    ? 'bg-[#ECFDF5] border-[#10B981] text-[#065F46]'
                    : 'bg-slate-100 border-[#CBD5E1] text-slate-700 hover:bg-slate-200'
                }`}
              >
                {allowEmployeeProductEdit ? 'Habilitado' : 'Solo Admin'}
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Por defecto, los empleados pueden recibir mercancía y ver cuánto
              queda, pero solo el Admin puede editar precios después de crear el
              producto.
            </p>
          </div>
        </form>

        {/* Users List */}
        <div className="xl:col-span-7 bg-white border border-[#CBD5E1] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <div>
              <h3 className="font-display font-bold text-lg text-[#0F172A]">
                Correos Autorizados ({staffUsers.length})
              </h3>
              <p className="text-[11px] text-slate-500">
                Gestiona roles, acceso y contraseñas de todos los usuarios.
              </p>
            </div>
            <span className="text-xs text-slate-500 shrink-0">
              Firestore en vivo
            </span>
          </div>

          <div className="divide-y divide-slate-200">
            {staffUsers.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Aún no hay usuarios registrados adicionalmente.
              </div>
            ) : (
              staffUsers.map((u) => {
                const isPrimaryOwner =
                  u.email.trim().toLowerCase() === normalizedPrimaryEmail;
                const isSelf =
                  u.email.trim().toLowerCase() === normalizedCurrentEmail;
                return (
                  <div
                    key={u.id}
                    className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      u.active ? '' : 'bg-slate-50 opacity-75'
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display font-bold text-base text-[#0F172A] truncate">
                          {u.name}
                        </span>
                        {getRoleBadge(u.role, isPrimaryOwner)}
                        {!u.active && (
                          <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-[11px] font-bold">
                            Suspendido
                          </span>
                        )}
                      </div>
                      <div className="text-xs tabular-nums text-slate-600 truncate">
                        {u.email}
                        {isSelf && ' · (Tu sesión)'}
                      </div>
                      {u.passwordUpdatedAt && (
                        <div className="text-[11px] text-slate-500 tabular-nums">
                          Última gestión de clave:{' '}
                          {formatDateSpanish(u.passwordUpdatedAt.slice(0, 10))}{' '}
                          {formatTime(u.passwordUpdatedAt)}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => openPasswordModal(u)}
                        title="Gestionar o cambiar contraseña"
                        className="min-h-[38px] px-3 py-1 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-[#1D4ED8] text-xs font-bold flex items-center gap-1.5 transition-colors"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        Contraseña
                      </button>

                      <select
                        disabled={isPrimaryOwner}
                        value={u.role}
                        onChange={(e) =>
                          handleRoleUpdate(u, e.target.value as UserRole)
                        }
                        aria-label={`Cambiar rol de ${u.name}`}
                        className="min-h-[38px] px-2.5 py-1 border border-[#CBD5E1] rounded-lg text-xs font-semibold bg-white disabled:bg-slate-100 disabled:text-slate-500"
                      >
                        <option value="caja">Caja / Operador</option>
                        <option value="taquilla">Taquilla</option>
                        <option value="mesero">Mesero</option>
                        <option value="admin">Administrador</option>
                      </select>

                      {!isPrimaryOwner && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(u)}
                            title={
                              u.active ? 'Pausar acceso' : 'Reactivar acceso'
                            }
                            className={`min-h-[38px] px-3 py-1 rounded-lg border text-xs font-bold flex items-center gap-1 ${
                              u.active
                                ? 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
                                : 'bg-[#ECFDF5] border-[#10B981] text-[#065F46] hover:bg-emerald-100'
                            }`}
                          >
                            {u.active ? (
                              <>
                                <UserX className="w-3.5 h-3.5" />
                                Pausar
                              </>
                            ) : (
                              <>
                                <UserCheck className="w-3.5 h-3.5" />
                                Activar
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => setConfirmDelete(u)}
                            title="Eliminar usuario"
                            className="min-h-[38px] px-2.5 py-1 rounded-lg bg-[#EF4444] hover:bg-red-600 text-white text-xs font-bold"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        </div>
      </div>

      {/* Bind / Update Password for Current Logged-in Account */}
      <form
        onSubmit={handleSetMyPassword}
        className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl p-5 flex flex-col lg:flex-row lg:items-end justify-between gap-4"
      >
        <div className="space-y-1 max-w-xl">
          <div className="flex items-center gap-2 text-sm font-display font-bold text-[#0F172A]">
            <KeyRound className="w-4 h-4 text-[#1D4ED8]" />
            <span>Asignar o Cambiar Clave a Mi Correo ({currentUserEmail})</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Si ingresaste con Google, aquí puedes vincular una clave a tu correo
            para entrar también desde cualquier tablet con{' '}
            <strong>Correo y Clave</strong>.
          </p>
          {myPassError && (
            <p className="text-xs font-semibold text-red-700 pt-1">
              {myPassError}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
          <div className="relative">
            <input
              type={showMyPass ? 'text' : 'password'}
              value={myPassword}
              onChange={(e) => setMyPassword(e.target.value)}
              placeholder="Nueva clave (mín. 6 car.)"
              className="w-full sm:w-60 min-h-[44px] pl-3.5 pr-10 py-2 border border-[#CBD5E1] rounded-xl text-sm"
            />
            <button
              type="button"
              onClick={() => setShowMyPass((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
            >
              {showMyPass ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
          <button
            type="submit"
            disabled={savingMyPass}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#1D4ED8] hover:bg-blue-800 disabled:opacity-50 text-white font-bold text-xs whitespace-nowrap transition-colors"
          >
            {savingMyPass ? 'Guardando...' : 'Guardar Clave'}
          </button>
        </div>
      </form>

      {/* Per-User Password Management Modal */}
      {passwordTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl border border-[#CBD5E1] shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-[#0F172A] text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <KeyRound className="w-5 h-5 text-[#FBBF24] shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-display font-bold text-base truncate">
                    Contraseña · {passwordTarget.name}
                  </h3>
                  <p className="text-[11px] text-slate-300 tabular-nums truncate">
                    {passwordTarget.email}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPasswordTarget(null)}
                className="text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {passwordTarget.email.trim().toLowerCase() !==
                normalizedCurrentEmail && (
                <div className="p-3 rounded-xl bg-slate-50 border border-[#CBD5E1] text-xs text-slate-700 leading-relaxed">
                  <strong>Protección de contraseñas:</strong> Firebase cifra las
                  contraseñas y no permite leer claves anteriores en texto
                  plano. Desde aquí puedes{' '}
                  <strong>asignar una clave inicial visible</strong> (para
                  cuentas nuevas) o{' '}
                  <strong>enviar un enlace inmediato de cambio</strong> al
                  correo del usuario.
                </div>
              )}

              {targetPassError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
                  {targetPassError}
                </div>
              )}

              {targetPassSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800">
                  {targetPassSuccess}
                </div>
              )}

              <form onSubmit={handleSaveTargetPassword} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    {passwordTarget.email.trim().toLowerCase() ===
                    normalizedCurrentEmail
                      ? 'Nueva Contraseña para Tu Cuenta'
                      : 'Asignar Clave Inicial (Visible antes de guardar)'}
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showTargetPass ? 'text' : 'password'}
                        value={targetNewPassword}
                        onChange={(e) => setTargetNewPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres..."
                        className="w-full min-h-[44px] pl-3.5 pr-10 py-2 border border-[#CBD5E1] rounded-xl text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowTargetPass((v) => !v)}
                        aria-label="Mostrar u ocultar clave"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                      >
                        {showTargetPass ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    {targetNewPassword && (
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard?.writeText(targetNewPassword);
                          showFlash('Clave copiada al portapapeles.');
                        }}
                        title="Copiar clave"
                        className="min-h-[44px] px-3 rounded-xl border border-[#CBD5E1] bg-slate-50 hover:bg-slate-100 text-slate-700"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingTargetPass || targetNewPassword.length < 6}
                  className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-[#1D4ED8] hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-bold transition-colors"
                >
                  {savingTargetPass
                    ? 'Aplicando...'
                    : passwordTarget.email.trim().toLowerCase() ===
                        normalizedCurrentEmail
                      ? 'Cambiar Mi Contraseña Ahora'
                      : 'Guardar Clave Inicial / Activar Acceso'}
                </button>
              </form>

              <div className="pt-3 border-t border-slate-200 space-y-2">
                <button
                  type="button"
                  disabled={sendingReset}
                  onClick={() => handleSendResetEmail(passwordTarget)}
                  className="w-full min-h-[44px] px-4 py-2 rounded-xl border border-[#CBD5E1] bg-slate-50 hover:bg-slate-100 text-[#0F172A] text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  <Mail className="w-4 h-4 text-[#1D4ED8]" />
                  {sendingReset
                    ? 'Enviando enlace...'
                    : 'Enviar Enlace de Cambio de Contraseña por Correo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl border border-[#CBD5E1] shadow-2xl p-5 space-y-4">
            <h3 className="font-display font-bold text-lg text-[#0F172A]">
              ¿Eliminar acceso de usuario?
            </h3>
            <p className="text-sm text-slate-600">
              Se revocará el acceso inmediato de{' '}
              <strong className="text-[#0F172A]">{confirmDelete.name}</strong> (
              <span className="tabular-nums">{confirmDelete.email}</span>).
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="min-h-[42px] px-4 rounded-xl border border-[#CBD5E1] bg-white text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  await onDeleteStaffUser(confirmDelete.id);
                  setConfirmDelete(null);
                  showFlash('Usuario eliminado del sistema.');
                }}
                className="min-h-[42px] px-4 rounded-xl bg-[#EF4444] hover:bg-red-600 text-white text-sm font-bold"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
