import { useState, useEffect, useMemo, useRef } from 'react';
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
} from 'lucide-react';
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
import { Room, Booking } from './types';
import { cn } from './lib/utils';

const AMENITIES = [
  { icon: Wifi, label: 'High-Speed WiFi' },
  { icon: Coffee, label: 'Coffee & Tea' },
  { icon: Monitor, label: 'AV Equipment' },
];

export default function App() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Booking modal state
  const [selectedSlots, setSelectedSlots] = useState<Date[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [userName, setUserName] = useState('');
  const [phone, setPhone] = useState('');

  const [bookingStatus, setBookingStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

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
        if (Array.isArray(data)) setBookings(data);
      });
  }, [currentMonth]);

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
    return bookings.some((b) => {
      if (b.room_id !== selectedRoom.id) return false;
      const startMs = parseISO(b.start_time).getTime();
      const endMs = parseISO(b.end_time).getTime();
      return timeMs >= startMs && timeMs < endMs;
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
        throw new Error('Each booking block must be at least 1 hour.');
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
          throw new Error(err.error || 'Booking failed');
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
      setErrorMsg(err.message || 'Something went wrong. Please try again.');
      setTimeout(() => setBookingStatus('idle'), 4000);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFCFB] text-[#1A1A1A] font-sans selection:bg-[#E6E6E6]">
      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-black/5">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight leading-none">The Shed</h1>
              <p className="text-xs text-black/40 tracking-wide">Coworking Space</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-black/40">
            {AMENITIES.map(({ icon: Icon, label }) => (
              <span key={label} className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-black/5 rounded-full">
                <Icon className="w-3.5 h-3.5" />
                {label}
              </span>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {/* ═══════════════════════════════════════════
              ROOMS GRID VIEW
          ═══════════════════════════════════════════ */}
          {!selectedRoom ? (
            <motion.div
              key="rooms-grid"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              <div className="max-w-2xl">
                <h2 className="text-5xl font-bold tracking-tighter mb-4">Find your space.</h2>
                <p className="text-xl text-black/60 leading-relaxed">
                  Four unique environments designed for productivity, creativity, and collaboration.
                  Book by the hour — it's that simple.
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
                    <div className="aspect-[16/10] overflow-hidden">
                      <img
                        src={room.image_url}
                        alt={room.name}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="p-8">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-2xl font-bold mb-1">{room.name}</h3>
                          <div className="flex items-center gap-1.5 text-sm text-black/50">
                            <Users className="w-4 h-4" />
                            <span>{room.capacity} people</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-4">
                          <span className="text-2xl font-bold">{room.price}</span>
                          <span className="text-sm text-black/40"> EGP</span>
                          <span className="text-sm text-black/40 block">/ hour</span>
                        </div>
                      </div>
                      <p className="text-black/60 mb-8 line-clamp-2">{room.description}</p>
                      <div className="flex items-center text-sm font-semibold group-hover:gap-2 transition-all">
                        Book this room{' '}
                        <ArrowRight className="w-4 h-4 ml-1 opacity-0 group-hover:opacity-100 transition-all" />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ) : (
            /* ═══════════════════════════════════════════
                BOOKING VIEW
            ═══════════════════════════════════════════ */
            <motion.div
              key="booking-view"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-12"
            >
              {/* Left Column: Calendar */}
              <div className="lg:col-span-8 space-y-8">
                <button
                  onClick={() => setSelectedRoom(null)}
                  className="flex items-center gap-2 text-sm font-medium text-black/40 hover:text-black transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back to rooms
                </button>

                {/* Room mini card */}
                <div className="flex items-center gap-6 p-6 bg-white border border-black/5 rounded-2xl">
                  <img
                    src={selectedRoom.image_url}
                    alt={selectedRoom.name}
                    className="w-20 h-20 object-cover rounded-xl shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <div className="flex-1 min-w-0">
                    <h2 className="text-2xl font-bold tracking-tight">{selectedRoom.name}</h2>
                    <div className="flex items-center gap-4 text-sm text-black/50 mt-1">
                      <span className="flex items-center gap-1.5">
                        <Users className="w-4 h-4" /> {selectedRoom.capacity} people
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-2xl font-bold">{selectedRoom.price}</span>
                    <span className="text-sm text-black/40"> EGP / hr</span>
                  </div>
                </div>

                {/* Month navigation */}
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{format(currentMonth, 'MMMM yyyy')}</h3>
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
                      {day}
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
                        <h3 className="font-bold">Select a date</h3>
                        <p className="text-sm text-black/40">Choose a day to see available slots</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <div>
                        <h3 className="text-xl font-bold mb-1">{format(selectedDate, 'EEEE, MMM do')}</h3>
                        <p className="text-sm text-black/40">Tap a slot to book it</p>
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
                                    {format(slot, 'h:mm a')} – {format(endSlot, 'h:mm a')}
                                  </span>
                                </div>
                              </div>
                              {isBooked ? (
                                <span className="text-[10px] font-bold uppercase tracking-wider bg-black/10 px-2 py-1 rounded">
                                  Reserved
                                </span>
                              ) : isSelected ? (
                                <CheckCircle2 className="w-4 h-4 text-white" />
                              ) : (
                                <span className="text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                                  Select
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
                              Minimum booking is 1 hour (2 slots)
                            </p>
                          )}
                          <button
                            onClick={openBookingModal}
                            disabled={selectedSlots.length < 2}
                            className="w-full py-4 bg-black text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl disabled:opacity-40 disabled:hover:scale-100"
                          >
                            Book {selectedSlots.length * 0.5} Hours
                          </button>
                        </motion.div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ══════════════════════════════════════════════
          BOOKING MODAL
      ══════════════════════════════════════════════ */}
      <AnimatePresence>
        {isModalOpen && selectedSlots.length > 0 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
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
                  <h3 className="text-2xl font-bold">Booking Confirmed!</h3>
                  <p className="text-black/50">
                    Your sessions in <strong>{selectedRoom?.name}</strong> have been reserved for <strong>{userName}</strong>.
                  </p>
                </div>
              ) : (
                <div className="space-y-7">
                  <div>
                    <h3 className="text-3xl font-bold tracking-tight mb-1">Almost there.</h3>
                    <div className="text-black/50 text-sm space-y-1">
                      <p>Booking <strong>{selectedRoom?.name}</strong> for:</p>
                      {getBookingRanges(selectedSlots).map((range, idx) => (
                        <p key={idx} className="font-semibold text-black">
                          {format(range.start, 'EEE, MMM do')} · {format(range.start, 'h:mm a')} – {format(range.end, 'h:mm a')}
                        </p>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* Name */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-black/40 ml-1">
                        Full Name
                      </label>
                      <input
                        autoFocus
                        type="text"
                        value={userName}
                        onChange={(e) => setUserName(e.target.value)}
                        placeholder="e.g. Sarah Ahmed"
                        className="w-full px-5 py-4 bg-black/5 border border-transparent rounded-2xl focus:outline-none focus:bg-white focus:border-black transition-all text-base font-medium"
                      />
                    </div>

                    {/* Phone */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-black/40 ml-1">
                        Phone Number
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-black/30" />
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="e.g. 010 1234 5678"
                          className="w-full pl-12 pr-5 py-4 bg-black/5 border border-transparent rounded-2xl focus:outline-none focus:bg-white focus:border-black transition-all text-base font-medium"
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
                        Confirming…
                      </>
                    ) : (
                      'Confirm Booking'
                    )}
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
                No Booking Required
              </span>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
                Shared Area
              </h2>
              <p className="text-lg text-white/60 mb-10 leading-relaxed">
                Looking for a more flexible way to work? Our Shared Area is perfect for digital nomads and students. Just walk in, find a spot, and focus.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <div className="p-6 bg-white/5 rounded-3xl border border-white/10">
                  <div className="text-sm text-white/40 mb-1">Hourly Rate</div>
                  <div className="text-3xl font-bold">25 EGP <span className="text-sm font-normal text-white/40">/ hr</span></div>
                </div>
                <div className="p-6 bg-white/5 rounded-3xl border border-white/10">
                  <div className="text-sm text-white/40 mb-1">Full Day Pass</div>
                  <div className="text-3xl font-bold">140 EGP <span className="text-sm font-normal text-white/40">/ day</span></div>
                </div>
              </div>
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

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.2); }
      `}</style>
    </div>
  );
}
