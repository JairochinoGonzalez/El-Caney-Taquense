import React, { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Edit3,
  Flame,
  Plus,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { CalendarEvent, ClosedShift, EventType } from '../types';
import {
  formatBs,
  formatDateSpanish,
  formatUsd,
  getTodayISO,
} from '../utils/formatters';
import { downloadClosingShiftPdf } from '../utils/pdfGenerator';

interface EventsCalendarProps {
  events: CalendarEvent[];
  closedShifts: ClosedShift[];
  effectiveRate: number;
  activeParty: CalendarEvent | null;
  onCreateEvent: (event: Omit<CalendarEvent, 'id' | 'status'>) => void;
  onUpdateEvent: (
    eventId: string,
    updates: Partial<Omit<CalendarEvent, 'id' | 'status'>>
  ) => void;
  onAddRentalPayment: (eventId: string, amountUsd: number) => void;
  onStartParty: (eventId: string) => void;
  onGoToNightOps: () => void;
}

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const PRIVATE_SUBTYPE_PRESETS = [
  '15 Años',
  'Matrimonio',
  'Cumpleaños',
  'Reunión Familiar',
  'Graduación',
  'Evento Corporativo',
];

const INTERNAL_SUBTYPE_PRESETS = [
  'Fiesta del Local (Con Taquilla)',
  'Noche Vallenata / Música en Vivo',
  'Noche Retro / DJ',
  'Torneo de Dominó / Tasca',
];

export const EventsCalendar: React.FC<EventsCalendarProps> = ({
  events,
  closedShifts,
  effectiveRate,
  activeParty,
  onCreateEvent,
  onUpdateEvent,
  onAddRentalPayment,
  onStartParty,
  onGoToNightOps,
}) => {
  const todayIso = getTodayISO();
  const [todayYear, todayMonth] = todayIso.split('-').map(Number);

  const [viewYear, setViewYear] = useState(todayYear);
  const [viewMonth, setViewMonth] = useState(todayMonth - 1);
  const [selectedDate, setSelectedDate] = useState<string>(
    activeParty?.date || todayIso
  );
  const [selectedEventId, setSelectedEventId] = useState<string>(
    activeParty?.id || events[0]?.id || ''
  );

  // Create / Edit Event Modal
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  const [abonoInput, setAbonoInput] = useState('');
  const [showAbonoModal, setShowAbonoModal] = useState(false);

  // Form fields
  const [formName, setFormName] = useState('');
  const [formOrganizer, setFormOrganizer] = useState('');
  const [formDate, setFormDate] = useState(todayIso);
  const [formStartTime, setFormStartTime] = useState('20:00');
  const [formEndTime, setFormEndTime] = useState('03:00');
  const [formType, setFormType] = useState<EventType>('fiesta');
  const [formSubType, setFormSubType] = useState(
    'Fiesta del Local (Con Taquilla)'
  );
  const [formEntryPrice, setFormEntryPrice] = useState('5.00');
  const [formClient, setFormClient] = useState('');
  const [formTotalRental, setFormTotalRental] = useState('600.00');
  const [formDeposit, setFormDeposit] = useState('300.00');
  const [formNotes, setFormNotes] = useState('');

  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const startOffset = (firstDayOfMonth.getDay() + 6) % 7;

    const cells: Array<{
      dateStr: string | null;
      dayNum: number | null;
      dayEvents: CalendarEvent[];
    }> = [];

    for (let i = 0; i < startOffset; i++) {
      cells.push({ dateStr: null, dayNum: null, dayEvents: [] });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const mm = String(viewMonth + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      const dateStr = `${viewYear}-${mm}-${dd}`;
      const dayEvents = events
        .filter((ev) => ev.date === dateStr)
        .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
      cells.push({ dateStr, dayNum: d, dayEvents });
    }
    return cells;
  }, [viewYear, viewMonth, events]);

  const eventsOnSelectedDate = useMemo(
    () =>
      events
        .filter((ev) => ev.date === selectedDate)
        .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '')),
    [events, selectedDate]
  );

  const selectedEvent =
    eventsOnSelectedDate.find((e) => e.id === selectedEventId) ||
    eventsOnSelectedDate[0] ||
    null;

  const selectedClosedShift = selectedEvent
    ? closedShifts.find((s) => s.eventId === selectedEvent.id)
    : undefined;

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleOpenNewForDate = (dateStr?: string) => {
    const targetDate = dateStr || selectedDate || todayIso;
    setEditingEventId(null);
    setFormDate(targetDate);
    setFormName('');
    setFormOrganizer('');
    setFormStartTime('20:00');
    setFormEndTime('03:00');
    setFormType('fiesta');
    setFormSubType(INTERNAL_SUBTYPE_PRESETS[0]);
    setFormEntryPrice('5.00');
    setFormClient('');
    setFormTotalRental('600.00');
    setFormDeposit('300.00');
    setFormNotes('');
    setShowEventModal(true);
  };

  const handleDateCellClick = (
    dateStr: string,
    dayEvents: CalendarEvent[]
  ) => {
    setSelectedDate(dateStr);
    if (dayEvents.length > 0) {
      setSelectedEventId(dayEvents[0].id);
    } else {
      handleOpenNewForDate(dateStr);
    }
  };

  const handleOpenEditEvent = (ev: CalendarEvent) => {
    setEditingEventId(ev.id);
    setFormName(ev.name);
    setFormOrganizer(ev.organizer || ev.clientName || '');
    setFormDate(ev.date);
    setFormStartTime(ev.startTime || '20:00');
    setFormEndTime(ev.endTime || '03:00');
    setFormType(ev.type);
    setFormSubType(
      ev.eventSubType ||
        (ev.type === 'fiesta'
          ? INTERNAL_SUBTYPE_PRESETS[0]
          : PRIVATE_SUBTYPE_PRESETS[0])
    );
    setFormEntryPrice(String(ev.entryPriceUsd || 0));
    setFormClient(ev.clientName || ev.organizer || '');
    setFormTotalRental(String(ev.totalRentalUsd || 0));
    setFormDeposit(String(ev.depositPaidUsd || 0));
    setFormNotes(ev.notes || '');
    setShowEventModal(true);
  };

  const handleSwitchFormType = (nextType: EventType) => {
    setFormType(nextType);
    if (nextType === 'fiesta') {
      if (PRIVATE_SUBTYPE_PRESETS.includes(formSubType) || !formSubType) {
        setFormSubType(INTERNAL_SUBTYPE_PRESETS[0]);
      }
    } else {
      if (INTERNAL_SUBTYPE_PRESETS.includes(formSubType) || !formSubType) {
        setFormSubType(PRIVATE_SUBTYPE_PRESETS[0]);
      }
    }
  };

  const handleEventSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    const isFiesta = formType === 'fiesta';
    const organizerVal =
      formOrganizer.trim() ||
      (!isFiesta ? formClient.trim() : 'El Caney Taquense');
    const payload: Omit<CalendarEvent, 'id' | 'status'> = {
      name: formName.trim(),
      date: formDate,
      type: formType,
      eventSubType:
        formSubType.trim() ||
        (isFiesta ? 'Fiesta del Local' : 'Evento Privado'),
      organizer: organizerVal || undefined,
      startTime: formStartTime || undefined,
      endTime: formEndTime || undefined,
      entryPriceUsd: isFiesta ? Math.max(0, parseFloat(formEntryPrice) || 0) : 0,
      clientName: !isFiesta ? formClient.trim() || organizerVal : undefined,
      totalRentalUsd: !isFiesta
        ? Math.max(0, parseFloat(formTotalRental) || 0)
        : 0,
      depositPaidUsd: !isFiesta
        ? Math.max(0, parseFloat(formDeposit) || 0)
        : 0,
      notes: formNotes.trim() || undefined,
    };

    if (editingEventId) {
      onUpdateEvent(editingEventId, payload);
    } else {
      onCreateEvent(payload);
    }
    setSelectedDate(formDate);
    setShowEventModal(false);
  };

  const handleAbonoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent) return;
    const val = Math.max(0, parseFloat(abonoInput) || 0);
    if (val <= 0) return;
    onAddRentalPayment(selectedEvent.id, val);
    setAbonoInput('');
    setShowAbonoModal(false);
  };

  const upcomingEvents = [...events].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-xl text-[#0F172A]">
            Calendario de Eventos y Alquileres
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Toca cualquier fecha para programar un evento o ver los eventos del
            día. Puedes registrar varios eventos en una misma fecha por horario.
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleOpenNewForDate(selectedDate)}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#0F172A] hover:bg-slate-800 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />+ Nuevo Evento
        </button>
      </div>

      {/* Main Split: Calendar Grid + Selected Date & Event Card */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Monthly Calendar */}
        <div className="xl:col-span-7 bg-white border border-[#CBD5E1] shadow-xs rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-[#1D4ED8]" />
              <h3 className="font-display font-bold text-lg text-[#0F172A]">
                {MONTHS[viewMonth]} {viewYear}
              </h3>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={prevMonth}
                aria-label="Mes anterior"
                className="min-w-[40px] min-h-[40px] rounded-xl border border-[#CBD5E1] bg-slate-50 flex items-center justify-center hover:bg-slate-100"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewYear(todayYear);
                  setViewMonth(todayMonth - 1);
                  setSelectedDate(todayIso);
                }}
                className="min-h-[40px] px-3 rounded-xl border border-[#CBD5E1] bg-slate-50 text-xs font-semibold hover:bg-slate-100"
              >
                Hoy
              </button>
              <button
                type="button"
                onClick={nextMonth}
                aria-label="Mes siguiente"
                className="min-w-[40px] min-h-[40px] rounded-xl border border-[#CBD5E1] bg-slate-50 flex items-center justify-center hover:bg-slate-100"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-semibold text-slate-600 mb-2">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {calendarDays.map((cell, idx) => {
              if (!cell.dateStr) {
                return (
                  <div
                    key={`empty-${idx}`}
                    className="min-h-[72px] sm:min-h-[88px] rounded-xl bg-slate-100/80"
                  />
                );
              }
              const isToday = cell.dateStr === todayIso;
              const isSelectedDay = cell.dateStr === selectedDate;
              const hasEvents = cell.dayEvents.length > 0;
              return (
                <div
                  key={cell.dateStr}
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    handleDateCellClick(cell.dateStr!, cell.dayEvents)
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleDateCellClick(cell.dateStr!, cell.dayEvents);
                    }
                  }}
                  className={`min-h-[72px] sm:min-h-[88px] p-1.5 rounded-xl border transition-colors flex flex-col justify-between cursor-pointer ${
                    isSelectedDay
                      ? 'border-[#0F172A] ring-2 ring-[#0F172A]/20 bg-white'
                      : isToday
                        ? 'border-[#1D4ED8] bg-blue-50/70'
                        : 'border-[#CBD5E1] bg-[#F8FAFC] hover:bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold tabular-nums ${
                        isToday ? 'text-[#1D4ED8]' : 'text-slate-800'
                      }`}
                    >
                      {cell.dayNum}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenNewForDate(cell.dateStr!);
                      }}
                      title="Agregar evento en esta fecha"
                      className="w-5 h-5 rounded text-slate-500 hover:text-[#0F172A] hover:bg-slate-200 flex items-center justify-center text-xs font-bold"
                    >
                      +
                    </button>
                  </div>

                  <div className="space-y-1 mt-1">
                    {cell.dayEvents.map((ev) => {
                      const isSelected = selectedEvent?.id === ev.id;
                      let colorClass =
                        'bg-white text-[#0F172A] border-slate-300';
                      if (ev.status === 'en_curso') {
                        colorClass =
                          'bg-[#10B981] text-white border-[#10B981]';
                      } else if (ev.type === 'alquiler') {
                        colorClass =
                          'bg-indigo-100 text-indigo-950 border-indigo-300';
                      } else if (ev.status === 'finalizado') {
                        colorClass =
                          'bg-slate-200 text-slate-700 border-slate-300';
                      }
                      return (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDate(cell.dateStr!);
                            setSelectedEventId(ev.id);
                          }}
                          className={`w-full text-left px-1.5 py-1 rounded-md border text-[11px] font-semibold truncate transition-all ${colorClass} ${
                            isSelected ? 'ring-2 ring-[#0F172A]' : ''
                          }`}
                        >
                          {ev.startTime ? `${ev.startTime} ` : ''}
                          {ev.name}
                        </button>
                      );
                    })}
                    {!hasEvents && (
                      <div className="text-[10px] text-slate-400 text-center pb-1">
                        Libre
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Date Events + Selected Event Detail */}
        <div className="xl:col-span-5 space-y-5">
          {/* Day Bar: Shows all events on selectedDate + "Agregar uno más" */}
          <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-slate-500">
                  Fecha seleccionada
                </div>
                <div className="font-display font-bold text-base text-[#0F172A]">
                  {formatDateSpanish(selectedDate)} (
                  {eventsOnSelectedDate.length} evento
                  {eventsOnSelectedDate.length === 1 ? '' : 's'})
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleOpenNewForDate(selectedDate)}
                className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#1D4ED8] hover:bg-blue-800 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                {eventsOnSelectedDate.length > 0
                  ? 'Agregar otro evento este día'
                  : 'Agregar evento este día'}
              </button>
            </div>

            {eventsOnSelectedDate.length > 1 && (
              <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-200">
                {eventsOnSelectedDate.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => setSelectedEventId(ev.id)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
                      selectedEvent?.id === ev.id
                        ? 'bg-[#0F172A] text-white border-[#0F172A]'
                        : 'bg-slate-100 text-slate-700 border-[#CBD5E1] hover:bg-slate-200'
                    }`}
                  >
                    {ev.startTime ? `${ev.startTime} · ` : ''}
                    {ev.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedEvent ? (
            <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-600">
                    {selectedEvent.type === 'fiesta'
                      ? `Evento Interno · ${selectedEvent.eventSubType || 'Con Taquilla'}`
                      : `Evento Privado · ${selectedEvent.eventSubType || 'Alquiler Completo'}`}{' '}
                    · {formatDateSpanish(selectedEvent.date)}
                  </div>
                  <h3 className="font-display font-bold text-xl text-[#0F172A] mt-1">
                    {selectedEvent.name}
                  </h3>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {selectedEvent.status !== 'finalizado' && (
                    <button
                      type="button"
                      onClick={() => handleOpenEditEvent(selectedEvent)}
                      title="Editar evento"
                      className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[#CBD5E1] bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-[#0F172A] flex items-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Editar
                    </button>
                  )}
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-lg whitespace-nowrap ${
                      selectedEvent.status === 'en_curso'
                        ? 'bg-[#ECFDF5] text-[#065F46] border border-[#10B981]/30'
                        : selectedEvent.status === 'finalizado'
                          ? 'bg-slate-200 text-slate-700'
                          : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    {selectedEvent.status === 'en_curso'
                      ? 'Fiesta Activa'
                      : selectedEvent.status === 'finalizado'
                        ? 'Finalizado'
                        : 'Programado'}
                  </span>
                </div>
              </div>

              {/* Organizer & Schedule Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs bg-slate-50 border border-[#CBD5E1] rounded-xl p-3">
                <div className="flex items-center gap-2 text-slate-700">
                  <UserCheck className="w-4 h-4 text-[#1D4ED8] shrink-0" />
                  <div className="min-w-0">
                    <div className="text-slate-500">Organiza</div>
                    <div className="font-bold text-[#0F172A] truncate">
                      {selectedEvent.organizer ||
                        selectedEvent.clientName ||
                        'El Caney Taquense'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-slate-700">
                  <Clock className="w-4 h-4 text-[#1D4ED8] shrink-0" />
                  <div>
                    <div className="text-slate-500">Horario</div>
                    <div className="tabular-nums font-bold text-[#0F172A]">
                      {selectedEvent.startTime || '20:00'} —{' '}
                      {selectedEvent.endTime || '03:00'}
                    </div>
                  </div>
                </div>
              </div>

              {selectedEvent.type === 'fiesta' ? (
                <div className="p-4 rounded-xl bg-slate-100 border border-[#CBD5E1]">
                  <div className="text-xs text-slate-600 font-medium">
                    Precio Entrada en Taquilla
                  </div>
                  <div className="font-extrabold text-2xl text-[#0F172A] tabular-nums mt-0.5">
                    {formatUsd(selectedEvent.entryPriceUsd)}
                  </div>
                  <div className="text-xs text-slate-600 tabular-nums mt-0.5">
                    {formatBs(selectedEvent.entryPriceUsd * effectiveRate)}
                  </div>
                </div>
              ) : (
                <div className="space-y-3 p-4 rounded-xl bg-slate-100 border border-[#CBD5E1]">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 flex items-center gap-1.5 font-medium">
                      <Users className="w-4 h-4" /> Cliente:
                    </span>
                    <span className="font-bold text-[#0F172A]">
                      {selectedEvent.clientName || 'Sin especificar'}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-indigo-800 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-lg">
                    Alquiler de local completo · Sin control de taquilla
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-300 tabular-nums">
                    <div>
                      <div className="text-[11px] text-slate-600">
                        Total Alquiler
                      </div>
                      <div className="tabular-nums font-bold text-base text-[#0F172A]">
                        {formatUsd(selectedEvent.totalRentalUsd)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-600">
                        Abono Reserva
                      </div>
                      <div className="tabular-nums font-bold text-base text-[#059669]">
                        {formatUsd(selectedEvent.depositPaidUsd)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-600">
                        Saldo Pendiente
                      </div>
                      <div className="tabular-nums font-bold text-base text-[#DC2626]">
                        {formatUsd(
                          Math.max(
                            0,
                            selectedEvent.totalRentalUsd -
                              selectedEvent.depositPaidUsd
                          )
                        )}
                      </div>
                    </div>
                  </div>

                  {selectedEvent.totalRentalUsd - selectedEvent.depositPaidUsd >
                    0 && (
                    <button
                      type="button"
                      onClick={() => setShowAbonoModal(true)}
                      className="w-full min-h-[42px] rounded-xl border border-[#CBD5E1] bg-white hover:bg-slate-50 text-xs font-bold text-[#0F172A] transition-colors"
                    >
                      + Registrar Abono de Alquiler
                    </button>
                  )}
                </div>
              )}

              {selectedEvent.notes && (
                <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  {selectedEvent.notes}
                </p>
              )}

              {/* Primary Party Switch Action */}
              {selectedEvent.status === 'en_curso' && (
                <button
                  type="button"
                  onClick={onGoToNightOps}
                  className="w-full min-h-[54px] px-5 py-3 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white font-display font-bold text-base flex items-center justify-center gap-2 transition-colors"
                >
                  <Flame className="w-5 h-5" />
                  Ir a Operación Nocturna (Fiesta Activa)
                </button>
              )}

              {selectedEvent.status === 'programado' && (
                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={Boolean(activeParty)}
                    onClick={() => onStartParty(selectedEvent.id)}
                    className={`w-full min-h-[54px] px-5 py-3 rounded-xl font-display font-bold text-base flex items-center justify-center gap-2 transition-colors ${
                      activeParty
                        ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                        : 'bg-[#10B981] hover:bg-[#059669] text-white'
                    }`}
                  >
                    <Flame className="w-5 h-5" />
                    ENCENDER FIESTA / INICIAR CAJA
                  </button>
                  {activeParty && (
                    <p className="text-xs text-[#B45309] font-semibold text-center">
                      Ya hay una fiesta encendida ({activeParty.name}). Haz el
                      cierre de caja antes de encender otro evento.
                    </p>
                  )}
                </div>
              )}

              {selectedEvent.status === 'finalizado' && selectedClosedShift && (
                <button
                  type="button"
                  onClick={() => downloadClosingShiftPdf(selectedClosedShift)}
                  className="w-full min-h-[48px] px-5 py-2.5 rounded-xl bg-[#1D4ED8] hover:bg-blue-800 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Descargar PDF de Cierre (Móvil)
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl p-6 text-center text-sm text-slate-500 space-y-3">
              <p>No hay eventos asignados para esta fecha.</p>
              <button
                type="button"
                onClick={() => handleOpenNewForDate(selectedDate)}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[#0F172A] text-white text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Programar Evento en {formatDateSpanish(selectedDate)}
              </button>
            </div>
          )}

          {/* Upcoming Agenda List */}
          <div className="bg-white border border-[#CBD5E1] shadow-xs rounded-2xl p-5">
            <h4 className="font-display font-bold text-base text-[#0F172A] mb-3">
              Agenda General de Eventos
            </h4>
            <div className="divide-y divide-slate-200">
              {upcomingEvents.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => {
                    setSelectedDate(ev.date);
                    setSelectedEventId(ev.id);
                  }}
                  className={`w-full py-3 px-2.5 text-left flex items-center justify-between gap-3 hover:bg-slate-100 rounded-lg transition-colors ${
                    selectedEvent?.id === ev.id ? 'bg-slate-100' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-[#0F172A] truncate">
                      {ev.name}
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      {formatDateSpanish(ev.date)}
                      {ev.startTime ? ` · ${ev.startTime}` : ''} ·{' '}
                      {ev.organizer || ev.clientName || 'El Caney Taquense'}
                    </div>
                  </div>
                  <span
                    className={`text-xs font-bold shrink-0 ${
                      ev.status === 'en_curso'
                        ? 'text-[#059669]'
                        : ev.status === 'finalizado'
                          ? 'text-slate-500'
                          : 'text-[#1D4ED8]'
                    }`}
                  >
                    {ev.status === 'en_curso'
                      ? 'En Curso'
                      : ev.status === 'finalizado'
                        ? 'Cerrado'
                        : 'Programado'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modal: New / Edit Event */}
      {showEventModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleEventSubmit}
            className="bg-white w-full max-w-lg rounded-2xl border border-[#CBD5E1] shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-[#0F172A]">
                {editingEventId ? 'Editar Evento' : 'Programar Evento'}
              </h3>
              <button
                type="button"
                onClick={() => setShowEventModal(false)}
                className="p-1 text-slate-500 hover:text-[#0F172A]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Modalidad de Evento
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSwitchFormType('fiesta')}
                    className={`min-h-[48px] px-3 py-2 rounded-xl border text-xs sm:text-sm font-bold transition-colors ${
                      formType === 'fiesta'
                        ? 'bg-[#0F172A] text-white border-[#0F172A]'
                        : 'bg-slate-50 text-slate-700 border-[#CBD5E1]'
                    }`}
                  >
                    Evento Interno (Con Taquilla)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchFormType('alquiler')}
                    className={`min-h-[48px] px-3 py-2 rounded-xl border text-xs sm:text-sm font-bold transition-colors ${
                      formType === 'alquiler'
                        ? 'bg-[#0F172A] text-white border-[#0F172A]'
                        : 'bg-slate-50 text-slate-700 border-[#CBD5E1]'
                    }`}
                  >
                    Evento Privado (Alquiler · Sin Taquilla)
                  </button>
                </div>
              </div>

              {/* Editable Subtype / Category */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Tipo de evento (Editable)
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {(formType === 'alquiler'
                    ? PRIVATE_SUBTYPE_PRESETS
                    : INTERNAL_SUBTYPE_PRESETS
                  ).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setFormSubType(preset)}
                      className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors ${
                        formSubType === preset
                          ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                          : 'bg-slate-100 text-slate-700 border-[#CBD5E1] hover:bg-slate-200'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  required
                  value={formSubType}
                  onChange={(e) => setFormSubType(e.target.value)}
                  placeholder="Ej: 15 Años, Matrimonio, Bautizo, Aniversario..."
                  className="w-full min-h-[42px] px-3.5 py-2 border border-[#CBD5E1] rounded-xl text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Nombre del Evento
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ej: 15 Años de Sofía / Noche Gaitera"
                    className="w-full min-h-[44px] px-3.5 py-2 border border-[#CBD5E1] rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Quién lo organiza
                  </label>
                  <input
                    type="text"
                    required
                    value={formOrganizer}
                    onChange={(e) => setFormOrganizer(e.target.value)}
                    placeholder="Ej: Familia Mendoza / El Caney"
                    className="w-full min-h-[44px] px-3.5 py-2 border border-[#CBD5E1] rounded-xl text-sm"
                  />
                </div>
              </div>

              {/* Date & Schedule */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Fecha
                  </label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 border border-[#CBD5E1] rounded-xl text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Hora Inicio
                  </label>
                  <input
                    type="time"
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 border border-[#CBD5E1] rounded-xl text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Hora Fin
                  </label>
                  <input
                    type="time"
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 border border-[#CBD5E1] rounded-xl text-sm tabular-nums"
                  />
                </div>
              </div>

              {formType === 'fiesta' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Precio de Entrada en Taquilla ($)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={formEntryPrice}
                    onChange={(e) => setFormEntryPrice(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 border border-[#CBD5E1] rounded-xl text-sm tabular-nums"
                  />
                </div>
              ) : (
                <div className="space-y-3 p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200">
                  <div className="text-xs font-semibold text-indigo-900">
                    Alquiler del local completo: no se abrirá taquilla al
                    encender este evento.
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Cliente / Responsable de Pago
                    </label>
                    <input
                      type="text"
                      value={formClient}
                      onChange={(e) => setFormClient(e.target.value)}
                      placeholder="Nombre del cliente (si es distinto al organizador)"
                      className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-[#CBD5E1] rounded-xl text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Monto Total Alquiler ($)
                      </label>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={formTotalRental}
                        onChange={(e) => setFormTotalRental(e.target.value)}
                        className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-[#CBD5E1] rounded-xl text-sm tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Abono de Reserva ($)
                      </label>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={formDeposit}
                        onChange={(e) => setFormDeposit(e.target.value)}
                        className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-[#CBD5E1] rounded-xl text-sm tabular-nums"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Notas del Evento
                </label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Detalles de horario, sonido, agrupación, montaje..."
                  className="w-full px-3.5 py-2 border border-[#CBD5E1] rounded-xl text-sm"
                />
              </div>
            </div>

            <div className="px-5 py-4 bg-slate-100 border-t border-slate-200 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowEventModal(false)}
                className="min-h-[44px] px-4 rounded-xl border border-[#CBD5E1] bg-white text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[44px] px-5 rounded-xl bg-[#0F172A] text-white text-sm font-bold"
              >
                {editingEventId ? 'Guardar Cambios' : 'Guardar Evento'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Registrar Abono */}
      {showAbonoModal && selectedEvent && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleAbonoSubmit}
            className="bg-white w-full max-w-sm rounded-2xl border border-[#CBD5E1] shadow-2xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display font-bold text-base text-[#0F172A]">
                Registrar Abono · {selectedEvent.name}
              </h3>
              <button
                type="button"
                onClick={() => setShowAbonoModal(false)}
                className="p-1 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="text-xs text-slate-600">
                Saldo pendiente actual:{' '}
                <span className="tabular-nums font-bold text-[#EF4444]">
                  {formatUsd(
                    Math.max(
                      0,
                      selectedEvent.totalRentalUsd - selectedEvent.depositPaidUsd
                    )
                  )}
                </span>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Monto del Abono ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  value={abonoInput}
                  onChange={(e) => setAbonoInput(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 border border-[#CBD5E1] rounded-xl text-sm tabular-nums"
                />
              </div>
            </div>
            <div className="px-5 py-4 bg-slate-100 border-t border-slate-200 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowAbonoModal(false)}
                className="min-h-[42px] px-4 rounded-xl border border-[#CBD5E1] bg-white text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[42px] px-4 rounded-xl bg-[#10B981] text-white text-sm font-bold"
              >
                Confirmar Abono
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
