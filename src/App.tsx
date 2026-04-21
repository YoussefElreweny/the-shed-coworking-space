import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users,
  Clock,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  X,
  CheckCircle2,
  Phone,
  ArrowRight,
  Wifi,
  Coffee,
  Monitor,
  Settings,
  Globe,
} from 'lucide-react';
import { useLanguage } from './LanguageContext';
import { t } from './translations';
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isToday,
  startOfDay,
  setHours,
  setMinutes,
  isBefore,
  parseISO,
  addHours,
  addMinutes,
} from 'date-fns';
import { ar, enUS } from 'date-fns/locale';
import { Room, Booking } from './types';
import { cn } from './lib/utils';

const OLD_PRICES: Record<string, number> = {
  'Cordia Room': 200,
  'Meeting Room': 240,
  'Shared Room': 320,
  'Office Room': 130,
};

const ROOM_IMAGES: Record<string, string[]> = {
  'Cordia Room': ['/images/room4.jpg'], // Assuming no new images for Cordia
  'Meeting Room': [
    '/images/room3.jpg',
    '/images/meeting_room/1.jpg',
    '/images/meeting_room/2.jpg',
    '/images/meeting_room/3.jpg',
  ],
  'Shared Room': [
    '/images/room2.jpg',
    '/images/shared_room/1.jpg'
  ],
  'Office Room': [
    '/images/office_room/1.jpg',
    '/images/room1.jpg'
  ],
};

const AMENITIES = [
  { icon: Wifi, label: 'High-Speed WiFi' },
  { icon: Coffee, label: 'Coffee & Tea' },
  { icon: Monitor, label: 'AV Equipment' },
] as const;

export default function App() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  
  const { lang, setLang } = useLanguage();

  // Booking modal state
  const [selectedSlots, setSelectedSlots] = useState<Date[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [userName, setUserName] = useState('');
  const [phone, setPhone] = useState('');

  const [bookingStatus, setBookingStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [contactStatus, setContactStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  // Removed RoomImageCarousel completely to optimize performance preventing heavy re-renders.

  // ── Refs for scrolling ──────────────────────────────────────────────────
  const calendarRef = useRef<HTMLDivElement>(null);

  // ── Auto-scroll to top when room is selected ───────────────────────────
  useEffect(() => {
    if (selectedRoom) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [selectedRoom]);

  // ── Fetch rooms once ──────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/rooms')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const sorted = data.sort((a: Room, b: Room) => a.price - b.price);
          setRooms(sorted);
        }
      });
  }, []);

  // ── Fetch bookings whenever month changes ─────────────────────────────────
  useEffect(() => {
    const start = startOfMonth(currentMonth).toISOString();
    const end = endOfMonth(currentMonth).toISOString();
    fetch(`/api/bookings?start=${start}&end=${end}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setBookings(data);
        }
      });
  }, [currentMonth]);

  // Pre-parse booking dates to drastically improve performance (solves the lag)
  const parsedBookings = useMemo(() => {
    return bookings.map((b) => ({
      ...b,
      startMs: parseISO(b.start_time).getTime(),
      endMs: parseISO(b.end_time).getTime()
    }));
  }, [bookings]);

  // ── WebSocket for real-time updates ───────────────────────────────────────
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}`);

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'BOOKING_CREATED') {
        setBookings((prev) => [...prev, data.booking]);
      } else if (data.type === 'BOOKING_DELETED') {
        setBookings((prev) => prev.filter((b) => b.id !== data.bookingId));
      }
    };

    return () => socket.close();
  }, []);

  // ── Calendar helpers ──────────────────────────────────────────────────────
  const daysInMonth = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfMonth(currentMonth),
        end: endOfMonth(currentMonth),
      }),
    [currentMonth]
  );

  // First day of month: 0=Sun … 6=Sat (used to offset the grid)
  const firstDayOffset = useMemo(
    () => startOfMonth(currentMonth).getDay(),
    [currentMonth]
  );

  const timeSlots = useMemo(() => {
    const slots = [];
    // 9 AM to 12 AM (24:00) in 30-minute increments
    for (let i = 9; i <= 23; i++) {
      slots.push(setMinutes(setHours(new Date(), i), 0));
      slots.push(setMinutes(setHours(new Date(), i), 30));
    }
    return slots;
  }, []);

  const isSlotBooked = (time: Date) => {
    if (!selectedRoom) return false;
    const timeMs = time.getTime();
    return parsedBookings.some((b) => {
      if (b.room_id !== selectedRoom.id) return false;
      return timeMs >= b.startMs && timeMs < b.endMs;
    });
  };

  // ── Toggle slot selection ───────────────────────────────────────────────
  const toggleSlot = (slot: Date) => {
    setSelectedSlots((prev) => {
      const exists = prev.find((s) => s.getTime() === slot.getTime());
      if (exists) {
        return prev.filter((s) => s.getTime() !== slot.getTime());
      }
      return [...prev, slot].sort((a, b) => a.getTime() - b.getTime());
    });
  };

  const openBookingModal = () => {
    if (selectedSlots.length === 0) return;
    setIsModalOpen(true);
    setBookingStatus('idle');
    setErrorMsg('');
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  // ── Helper to group consecutive slots ─────────────────────────────────────
  const getBookingRanges = (dates: Date[]) => {
    if (dates.length === 0) return [];
    
    const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
    const ranges: { start: Date; end: Date }[] = [];
    
    let currentStart = sorted[0];
    let currentEnd = addMinutes(sorted[0], 30);
    
    for (let i = 1; i < sorted.length; i++) {
      const date = sorted[i];
      if (date.getTime() === currentEnd.getTime()) {
        // Consecutive (30 mins later)
        currentEnd = addMinutes(date, 30);
      } else {
        // Gap reached
        ranges.push({ start: currentStart, end: currentEnd });
        currentStart = date;
        currentEnd = addMinutes(date, 30);
      }
    }
    ranges.push({ start: currentStart, end: currentEnd });
    return ranges;
  };

  // ── Submit the booking ────────────────────────────────────────────────────
  const handleConfirmBooking = async () => {
    if (!selectedRoom || selectedSlots.length === 0 || !userName || !phone) return;

    setBookingStatus('loading');
    setErrorMsg('');

    try {
      if (!userName.trim() || !phone.trim()) {
        throw new Error('Please fill in all fields.');
      }

      const phoneRegex = /^01[0125]\d{8}$/;
      if (!phoneRegex.test(phone.trim())) {
        throw new Error('Please enter a valid Egyptian mobile number (e.g., 01012345678).');
      }

      const ranges = getBookingRanges(selectedSlots);
      
      // Validation: Check if total duration is less than 1 hour (2 slots of 30 mins)
      if (selectedSlots.length < 2) {
        throw new Error('Minimum booking duration is 1 hour (2 slots).');
      }

      // Optional: Check if any range is exactly 30 mins (though with toggle, they can book 1h in one room and 1h in another)
      // The requirement says "no one 30 min is available like the min is 1 hour".
      // This usually means any contiguous block must be >= 1h.
      const hasShortRange = ranges.some(r => {
        const duration = (r.end.getTime() - r.start.getTime()) / (1000 * 60);
        return duration < 60;
      });

      if (hasShortRange) {
        throw new Error(t(lang, 'app', 'shortRangeError'));
      }
      
      // We'll perform all bookings. For simplicity, we'll do them sequentially.
      // In a more robust system, you might want to do them in parallel or have a bulk API.
      for (const range of ranges) {
        const res = await fetch('/api/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room_id: selectedRoom.id,
            user_name: userName,
            phone,
            start_time: range.start.toISOString(),
            end_time: range.end.toISOString(),
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || t(lang, 'app', 'bookingFailed'));
        }
      }

      setBookingStatus('success');
      setTimeout(() => {
        setIsModalOpen(false);
        setSelectedSlots([]);
        setBookingStatus('idle');
      }, 5000);
    } catch (err: any) {
      setBookingStatus('error');
      setErrorMsg(err.message || t(lang, 'app', 'somethingWentWrong'));
      setTimeout(() => setBookingStatus('idle'), 4000);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFCFB] text-[#1A1A1A] font-sans selection:bg-[#E6E6E6]">
      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-white/95 border-b border-black/5">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/images/logo.jpg" alt="The Shed Logo" className="w-10 h-10 object-contain rounded-lg shadow-sm" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight leading-none">{t(lang, 'app', 'title')}</h1>
              <p className="text-xs text-black/40 tracking-wide">{t(lang, 'app', 'subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-black/40">
            {AMENITIES.map(({ icon: Icon, label }) => (
              <span key={label} className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-black/5 rounded-full">
                <Icon className="w-3.5 h-3.5" />
                {t(lang, 'amenities', label as "High-Speed WiFi" | "Coffee & Tea" | "AV Equipment")}
              </span>
            ))}
            <button
              onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-black/5 hover:bg-black/10 transition-colors rounded-full text-black font-semibold ml-2 cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5" />
              {lang === 'en' ? 'العربية' : 'English'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
          {/* ═══════════════════════════════════════════
              ROOMS GRID VIEW
          ═══════════════════════════════════════════ */}
          {!selectedRoom ? (
            <div
              className="space-y-12"
            >
              <div className="max-w-2xl">
                <h2 className="text-5xl font-bold tracking-tighter mb-4">{t(lang, 'app', 'findSpace')}</h2>
                <p className="text-xl text-black/60 leading-relaxed">
                  {t(lang, 'app', 'description')}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {rooms.map((room) => (
                  <motion.div
                    key={room.id}
                    whileHover={{ y: -4 }}
                    className="group relative bg-white border border-black/5 rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-500 cursor-pointer"
                    onClick={() => {
                      setSelectedRoom(room);
                      setSelectedDate(null);
                      setSelectedSlots([]);
                    }}
                  >
                    <div className="aspect-[16/10] overflow-hidden relative">
                      <RoomImageCarousel images={ROOM_IMAGES[room.name] || [room.image_url]} name={room.name} />
                    </div>
                    <div className="p-8">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-2xl font-bold mb-1">{t(lang, 'rooms', room.name as any) || room.name}</h3>
                          <div className="flex items-center gap-1.5 text-sm text-black/50">
                            <Users className="w-4 h-4" />
                            <span>{room.capacity} {t(lang, 'app', 'people')}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-4">
                          {OLD_PRICES[room.name] && (
                            <span className="text-sm text-black/30 line-through block">
                              {OLD_PRICES[room.name]} {t(lang, 'app', 'egp')}
                            </span>
                          )}
                          <span className="text-2xl font-bold">{room.price}</span>
                          <span className="text-sm text-black/40"> {lang === 'ar' ? t(lang, 'app', 'egp') : 'EGP'}</span>
                          <span className="text-sm text-black/40 block">{t(lang, 'app', 'egpHour')}</span>
                        </div>
                      </div>
                      <p className="text-black/60 mb-8 line-clamp-2">{t(lang, 'rooms', room.description as any) || room.description}</p>
                      <div className="flex items-center text-sm font-semibold group-hover:gap-2 transition-all">
                        {t(lang, 'app', 'bookRoom')}
                        <ArrowRight className={cn("w-4 h-4 opacity-0 group-hover:opacity-100 transition-all", lang === 'ar' ? 'mr-1 rotate-180' : 'ml-1')} />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ) : (
            /* ═══════════════════════════════════════════
                BOOKING VIEW
            ═══════════════════════════════════════════ */
            <div
              className="grid grid-cols-1 lg:grid-cols-12 gap-12"
            >
              {/* Left Column: Calendar */}
              <div className="lg:col-span-8 space-y-8">
                <button
                  onClick={() => setSelectedRoom(null)}
                  className="flex items-center gap-2 text-sm font-medium text-black/40 hover:text-black transition-colors"
                >
                  <ChevronLeft className={cn("w-4 h-4", lang === 'ar' && 'rotate-180')} />
                  {t(lang, 'app', 'backToRooms')}
                </button>

                {/* Room mini card */}
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 sm:gap-6 p-4 sm:p-6 bg-white border border-black/5 rounded-2xl">
                  <div className="w-24 sm:w-32 h-20 rounded-xl shrink-0 overflow-hidden relative">
                    <img 
                      src={ROOM_IMAGES[selectedRoom.name]?.[0] || selectedRoom.image_url} 
                      alt={selectedRoom.name} 
                      className="absolute inset-0 w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="flex-1 min-w-[150px]">
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight line-clamp-1">{t(lang, 'rooms', selectedRoom.name as any) || selectedRoom.name}</h2>
                    <div className="flex items-center gap-4 text-sm text-black/50 mt-1">
                      <span className="flex items-center gap-1.5">
                        <Users className="w-4 h-4" /> {selectedRoom.capacity} {t(lang, 'app', 'people')}
                      </span>
                    </div>
                  </div>
                  <div className="w-full sm:w-auto text-right shrink-0 mt-1 sm:mt-0 pt-3 sm:pt-0 border-t sm:border-0 border-black/5">
                    {OLD_PRICES[selectedRoom.name] && (
                      <span className="text-xs text-black/30 line-through block mb-0.5">
                        {OLD_PRICES[selectedRoom.name]} {t(lang, 'app', 'egp')}
                      </span>
                    )}
                    <span className="text-2xl font-bold">{selectedRoom.price}</span>
                    <span className="text-sm text-black/40"> {lang === 'ar' ? t(lang, 'app', 'egp') : 'EGP'} / {lang === 'ar' ? 'ساعة' : 'hr'}</span>
                  </div>
                </div>

                {/* Month navigation */}
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{format(currentMonth, 'MMMM yyyy', { locale: lang === 'ar' ? ar : enUS })}</h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                      className="p-2 hover:bg-black/5 rounded-full transition-colors"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                      className="p-2 hover:bg-black/5 rounded-full transition-colors"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Calendar grid */}
                <div className="grid grid-cols-7 gap-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <div
                      key={day}
                      className="text-center text-xs font-bold uppercase tracking-widest text-black/30 py-3"
                    >
                      {t(lang, 'days', day as any)}
                    </div>
                  ))}

                  {/* Blank cells to offset first day */}
                  {Array.from({ length: firstDayOffset }).map((_, i) => (
                    <div key={`offset-${i}`} />
                  ))}

                  {daysInMonth.map((day) => {
                    const isSelected = selectedDate && isSameDay(day, selectedDate);
                    const isPast = isBefore(day, startOfDay(new Date()));

                    return (
                      <button
                        key={day.toString()}
                        disabled={isPast}
                        onClick={() => {
                          setSelectedDate(day);
                          setSelectedSlots([]);
                        }}
                        className={cn(
                          'aspect-square rounded-2xl flex flex-col items-center justify-center gap-1 transition-all relative',
                          isSelected ? 'bg-black text-white shadow-xl scale-105 z-10' : 'hover:bg-black/5',
                          isPast && 'opacity-20 cursor-not-allowed grayscale',
                          isToday(day) && !isSelected && 'border-2 border-black/20'
                        )}
                      >
                        <span className="text-lg font-semibold">{format(day, 'd')}</span>
                        {isToday(day) && (
                          <span className={cn('w-1 h-1 rounded-full', isSelected ? 'bg-white' : 'bg-black')} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Time Slots */}
              <div className="lg:col-span-4">
                <div className="sticky top-32 bg-white border border-black/5 rounded-[32px] p-8 shadow-sm">
                  {!selectedDate ? (
                    <div className="h-[420px] flex flex-col items-center justify-center text-center space-y-4">
                      <div className="w-16 h-16 bg-black/5 rounded-full flex items-center justify-center">
                        <CalendarIcon className="w-8 h-8 text-black/20" />
                      </div>
                      <div>
                        <h3 className="font-bold">{t(lang, 'app', 'selectDate')}</h3>
                        <p className="text-sm text-black/40">{t(lang, 'app', 'chooseDay')}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <div>
                        <h3 className="text-xl font-bold mb-1">{format(selectedDate, 'EEEE, MMM do', { locale: lang === 'ar' ? ar : enUS })}</h3>
                        <p className="text-sm text-black/40">{t(lang, 'app', 'tapSlot')}</p>
                      </div>

                      <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1 custom-scrollbar">
                        {timeSlots.map((slot) => {
                          const fullSlot = setMinutes(setHours(selectedDate, slot.getHours()), slot.getMinutes());
                          const isBooked = isSlotBooked(fullSlot);
                          const isPast = isBefore(fullSlot, new Date());
                          const isSelected = selectedSlots.some(s => s.getTime() === fullSlot.getTime());
                          const endSlot = addMinutes(fullSlot, 30);

                          return (
                            <button
                              key={slot.toString()}
                              disabled={isBooked || isPast}
                              onClick={() => toggleSlot(fullSlot)}
                              className={cn(
                                'w-full p-4 rounded-2xl border text-left transition-all flex items-center justify-between group',
                                isBooked
                                  ? 'bg-black/5 border-transparent opacity-60 cursor-not-allowed'
                                  : isPast
                                    ? 'bg-black/5 border-transparent opacity-20 cursor-not-allowed'
                                    : isSelected
                                      ? 'bg-black border-black text-white shadow-lg scale-[1.02]'
                                      : 'border-black/5 hover:border-black hover:bg-black hover:text-white'
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <Clock className={cn("w-4 h-4", isSelected ? "opacity-100" : "opacity-40 group-hover:opacity-100")} />
                                <div>
                                  <span className="font-semibold text-sm">
                                    {format(slot, 'h:mm a', { locale: lang === 'ar' ? ar : enUS })} – {format(endSlot, 'h:mm a', { locale: lang === 'ar' ? ar : enUS })}
                                  </span>
                                </div>
                              </div>
                              {isBooked ? (
                                <span className="text-[10px] font-bold uppercase tracking-wider bg-black/10 px-2 py-1 rounded">
                                  {t(lang, 'app', 'reserved')}
                                </span>
                              ) : isSelected ? (
                                <CheckCircle2 className="w-4 h-4 text-white" />
                              ) : (
                                <span className="text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                                  {t(lang, 'app', 'select')}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {selectedSlots.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="pt-4 space-y-3"
                        >
                          {selectedSlots.length < 2 && (
                            <p className="text-xs text-red-500 font-medium text-center bg-red-50 py-2 rounded-lg">
                              {t(lang, 'app', 'minBooking')}
                            </p>
                          )}
                          <button
                            onClick={openBookingModal}
                            disabled={selectedSlots.length < 2}
                            className="w-full py-4 bg-black text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl disabled:opacity-40 disabled:hover:scale-100"
                          >
                            {t(lang, 'app', 'bookHours', { hours: selectedSlots.length * 0.5 })}
                          </button>
                        </motion.div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
      </main>

      {/* ══════════════════════════════════════════════
          BOOKING MODAL
      ══════════════════════════════════════════════ */}
      {isModalOpen && selectedSlots.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div
            onClick={closeModal}
            className="absolute inset-0 bg-black/70"
          />

          <div
            className="relative w-full max-w-md bg-white rounded-[40px] p-10 shadow-2xl"
          >
              <button
                onClick={closeModal}
                className="absolute top-8 right-8 p-2 hover:bg-black/5 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              {bookingStatus === 'success' ? (
                <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                  <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                  </div>
                  <h3 className="text-2xl font-bold">{t(lang, 'app', 'bookingConfirmed')}</h3>
                  <p className="text-black/50">
                    {t(lang, 'app', 'sessionsReserved')} <strong>{t(lang, 'rooms', selectedRoom?.name as any) || selectedRoom?.name}</strong> {t(lang, 'app', 'haveBeenReserved')} <strong>{userName}</strong>.
                  </p>
                </div>
              ) : (
                <div className="space-y-7">
                  <div>
                    <h3 className="text-3xl font-bold tracking-tight mb-1">{t(lang, 'app', 'almostThere')}</h3>
                    <div className="text-black/50 text-sm space-y-1">
                      <p>{t(lang, 'app', 'bookingFor')} <strong>{t(lang, 'rooms', selectedRoom?.name as any) || selectedRoom?.name}</strong> {t(lang, 'app', 'for')}</p>
                      {getBookingRanges(selectedSlots).map((range, idx) => (
                        <p key={idx} className="font-semibold text-black">
                          {format(range.start, 'EEE, d MMM', { locale: lang === 'ar' ? ar : enUS })} · {format(range.start, 'h:mm a', { locale: lang === 'ar' ? ar : enUS })} – {format(range.end, 'h:mm a', { locale: lang === 'ar' ? ar : enUS })}
                        </p>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* Name */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-black/40 ml-1">
                        {t(lang, 'app', 'fullName')}
                      </label>
                      <input
                        autoFocus
                        type="text"
                        value={userName}
                        onChange={(e) => setUserName(e.target.value)}
                        placeholder={t(lang, 'app', 'namePlaceholder')}
                        className="w-full px-5 py-4 bg-black/5 border border-transparent rounded-2xl focus:outline-none focus:bg-white focus:border-black transition-all text-base font-medium"
                      />
                    </div>

                    {/* Phone */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-black/40 ml-1">
                        {t(lang, 'app', 'phone')}
                      </label>
                      <div className="relative">
                        <Phone className={cn("absolute top-1/2 -translate-y-1/2 w-4 h-4 text-black/30", lang === 'ar' ? "right-5" : "left-5")} />
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder={t(lang, 'app', 'phonePlaceholder')}
                          className={cn("w-full py-4 bg-black/5 border border-transparent rounded-2xl focus:outline-none focus:bg-white focus:border-black transition-all text-base font-medium", lang === 'ar' ? "pr-12 pl-5" : "pl-12 pr-5")}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Error message */}
                  {bookingStatus === 'error' && (
                    <p className="text-red-500 text-sm font-medium bg-red-50 px-4 py-3 rounded-xl">
                      {errorMsg}
                    </p>
                  )}

                  <button
                    disabled={!userName || !phone || bookingStatus === 'loading'}
                    onClick={handleConfirmBooking}
                    className="w-full py-5 bg-black text-white rounded-2xl font-bold text-lg hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-40 disabled:hover:scale-100 flex items-center justify-center gap-3"
                  >
                    {bookingStatus === 'loading' ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        {t(lang, 'app', 'confirming')}
                      </>
                    ) : (
                      t(lang, 'app', 'confirmBooking')
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      {/* ══════════════════════════════════════════════
          SHARED AREA SECTION
      ══════════════════════════════════════════════ */}
      {!selectedRoom && (
        <section className="max-w-7xl mx-auto px-6 py-20">
          <div className="relative bg-black text-white rounded-[48px] p-8 md:p-16 overflow-hidden">
            {/* Background pattern */}
            <div className="absolute top-0 right-0 w-1/2 h-full opacity-10 pointer-events-none">
              <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M0 0 L100 0 L100 100 Z" fill="currentColor" />
              </svg>
            </div>

            <div className="relative z-10 max-w-2xl">
              <span className="inline-block px-4 py-1.5 bg-white/10 rounded-full text-xs font-bold uppercase tracking-widest mb-6">
                {t(lang, 'app', 'noBookingRequired')}
              </span>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
                {t(lang, 'app', 'sharedArea')}
              </h2>
              <p className="text-lg text-white/60 mb-10 leading-relaxed">
                {t(lang, 'app', 'sharedAreaDesc')}
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <div className="p-6 bg-white/5 rounded-3xl border border-white/10">
                  <div className="text-sm text-white/40 mb-1">{t(lang, 'app', 'hourlyRate')}</div>
                  <div className="text-3xl font-bold">25 <span className="text-sm font-normal text-white/40">{t(lang, 'app', 'egp')} / {lang === 'ar' ? 'ساعة' : 'hr'}</span></div>
                  <div className="text-[10px] uppercase tracking-wider text-white/40 mt-1 font-medium">{t(lang, 'app', 'billingNote')}</div>
                </div>
                <div className="p-6 bg-white/5 rounded-3xl border border-white/10">
                  <div className="text-sm text-white/40 mb-1">{t(lang, 'app', 'fullDayPass')}</div>
                  <div className="text-3xl font-bold">140 <span className="text-sm font-normal text-white/40">{t(lang, 'app', 'egp')} / {lang === 'ar' ? 'يوم' : 'day'}</span></div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Partnership Contact Form ── */}
      {!selectedRoom && (
        <section className="max-w-7xl mx-auto px-6 py-24 border-t border-black/5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
            <div>
              <h2 className="text-5xl font-bold tracking-tighter mb-6">{t(lang, 'app', 'partnerWithUs')}</h2>
              <p className="text-xl text-black/60 leading-relaxed mb-8">
                {t(lang, 'app', 'partnerDesc')}
              </p>
            </div>

            <div className="bg-white border border-black/10 rounded-[40px] p-10 shadow-xl relative overflow-hidden">
               <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl rounded-full" />
              <form 
                className="space-y-6" 
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (contactStatus === 'loading') return;
                  setContactStatus('loading');
                  const form = e.target as HTMLFormElement;
                  const elements = form.elements as typeof form.elements & {
                    name: { value: string };
                    email: { value: string };
                    message: { value: string };
                  };
                  try {
                    const res = await fetch('https://formsubmit.co/ajax/theshedcoworkingspace@gmail.com', {
                      method: 'POST',
                      headers: { 
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                      },
                      body: JSON.stringify({
                        _subject: `Partnership Inquiry from ${elements.name.value}`,
                        name: elements.name.value,
                        email: elements.email.value,
                        message: elements.message.value
                      })
                    });
                    if (!res.ok) throw new Error('Failed to send');
                    setContactStatus('success');
                    form.reset();
                    setTimeout(() => setContactStatus('idle'), 5000);
                  } catch (err) {
                    setContactStatus('error');
                    setTimeout(() => setContactStatus('idle'), 5000);
                  }
                }}
              >
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-black/40 ml-1">
                    {t(lang, 'app', 'contactName')}
                  </label>
                  <input
                    name="name"
                    required
                    type="text"
                    placeholder={t(lang, 'app', 'contactNamePlaceholder')}
                    className="w-full px-5 py-4 bg-black/5 border border-transparent rounded-2xl focus:outline-none focus:bg-white focus:border-black transition-all text-base font-medium"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-black/40 ml-1">
                    {t(lang, 'app', 'contactEmail')}
                  </label>
                  <input
                    name="email"
                    required
                    type="email"
                    placeholder={t(lang, 'app', 'contactEmailPlaceholder')}
                    className="w-full px-5 py-4 bg-black/5 border border-transparent rounded-2xl focus:outline-none focus:bg-white focus:border-black transition-all text-base font-medium"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-black/40 ml-1">
                    {t(lang, 'app', 'contactMessage')}
                  </label>
                  <textarea
                    name="message"
                    required
                    rows={4}
                    placeholder={t(lang, 'app', 'contactMessagePlaceholder')}
                    className="w-full px-5 py-4 bg-black/5 border border-transparent rounded-2xl focus:outline-none focus:bg-white focus:border-black transition-all text-base font-medium resize-none"
                  />
                </div>
                <motion.button
                  type="submit"
                  disabled={contactStatus === 'loading' || contactStatus === 'success'}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-5 bg-black text-white rounded-2xl font-bold text-lg shadow-lg flex items-center justify-center gap-2 group disabled:opacity-50"
                >
                  {contactStatus === 'loading' ? (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {t(lang, 'app', 'sending')}
                    </div>
                  ) : contactStatus === 'success' ? (
                    <div className="flex items-center gap-2 text-emerald-300">
                      <CheckCircle2 className="w-5 h-5" />
                      {t(lang, 'app', 'messageSent')}
                    </div>
                  ) : (
                    <>
                      {t(lang, 'app', 'sendMessage')}
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </motion.button>
                {contactStatus === 'error' && (
                  <p className="text-red-500 text-sm font-medium text-center">
                    Failed to send message. Please try again.
                  </p>
                )}
              </form>
            </div>
          </div>
        </section>
      )}

      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-black/5 flex flex-col sm:flex-row items-center justify-between gap-6 text-sm">
        <div className="text-black/40">
          Developed by{' '}
          <a
            href="https://www.smartbitseg.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-black font-semibold hover:underline"
          >
            Youssef Elreweny
          </a>
        </div>
        <a
          href="/admin"
          className="flex items-center gap-2 px-4 py-2 bg-black/5 hover:bg-black/10 rounded-xl font-medium transition-colors"
        >
          <Settings className="w-4 h-4" />
          Admin Portal
        </a>
      </footer>

      {/* Floating WhatsApp Button */}
      <a
        href="https://wa.me/201092550532"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 p-4 bg-[#25D366] text-white rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all flex items-center justify-center"
        aria-label="Contact us on WhatsApp"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="32"
          height="32"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
        </svg>
      </a>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.2); }
      `}</style>
    </div>
  );
}

function RoomImageCarousel({ images, name }: { images: string[], name: string }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const nextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  if (!images || images.length === 0) return null;

  return (
    <div className="absolute inset-0 w-full h-full group/carousel">
      <AnimatePresence initial={false}>
        <motion.img
          key={currentIndex}
          src={images[currentIndex]}
          alt={name}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          referrerPolicy="no-referrer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        />
      </AnimatePresence>
      
      {images.length > 1 && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between px-2 opacity-0 group-hover/carousel:opacity-100 transition-opacity">
          <button
            onClick={prevImage}
            className="p-1.5 rounded-full bg-black/30 text-white hover:bg-black/50 backdrop-blur-sm transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={nextImage}
            className="p-1.5 rounded-full bg-black/30 text-white hover:bg-black/50 backdrop-blur-sm transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
      
      {images.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
          {images.map((_, idx) => (
            <div
              key={idx}
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-colors",
                idx === currentIndex ? "bg-white" : "bg-white/40"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
