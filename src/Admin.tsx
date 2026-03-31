import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    LogIn,
    LogOut,
    Trash2,
    Calendar,
    Users,
    Clock,
    Phone,
    User,
    ChevronDown,
    LayoutDashboard,
    RefreshCw,
    X,
    Settings,
    ChevronLeft,
    ChevronRight,
    List,
    CalendarDays,
} from 'lucide-react';
import { 
    format, parseISO, isToday, isTomorrow, isPast,
    startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
    addMonths, subMonths, isSameMonth, isSameDay, startOfDay
} from 'date-fns';
import { ar, enUS } from 'date-fns/locale';
import { useLanguage } from './LanguageContext';
import { t } from './translations';
import { cn } from './lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

interface AdminBooking {
    id: string | number;
    user_name: string;
    phone: string | null;
    start_time: string;
    end_time: string;
    room_name: string;
    room_id: number;
}

interface Stats {
    total: number;
    today: number;
    upcoming: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const TOKEN_KEY = 'shed_admin_token';

function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

function adminFetch(url: string, options: RequestInit = {}) {
    return fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'x-admin-token': getToken() || '',
            ...(options.headers || {}),
        },
    });
}

function dayLabel(dateStr: string, lang: 'en' | 'ar') {
    const d = parseISO(dateStr);
    const locale = lang === 'ar' ? ar : enUS;
    if (isToday(d)) return lang === 'ar' ? 'اليوم' : 'Today';
    if (isTomorrow(d)) return lang === 'ar' ? 'غداً' : 'Tomorrow';
    return format(d, 'EEE, MMM d', { locale });
}

const ROOM_COLORS: Record<number, string> = {
    1: 'bg-violet-100 text-violet-700',
    2: 'bg-amber-100 text-amber-700',
    3: 'bg-blue-100 text-blue-700',
    4: 'bg-emerald-100 text-emerald-700',
};

const ROOMS = [
    { id: 1, name: 'Office Room', color: ROOM_COLORS[1] },
    { id: 2, name: 'Shared Room', color: ROOM_COLORS[2] },
    { id: 3, name: 'Meeting Room', color: ROOM_COLORS[3] },
    { id: 4, name: 'Cordia Room', color: ROOM_COLORS[4] },
];

// ── Login Screen ─────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (token: string) => void }) {
    const [password, setPassword] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
    const { lang } = useLanguage();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('loading');
        try {
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });
            if (!res.ok) throw new Error();
            const { token } = await res.json();
            localStorage.setItem(TOKEN_KEY, token);
            onLogin(token);
        } catch {
            setStatus('error');
            setTimeout(() => setStatus('idle'), 3000);
        }
    };

    return (
        <div className="min-h-screen bg-[#FDFCFB] flex items-center justify-center p-6">
            <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-sm"
            >
                {/* Logo */}
                <div className="flex items-center gap-3 mb-10">
                    <div>
                        <p className="font-semibold text-sm leading-none">{t(lang, 'app', 'title') as string}</p>
                        <p className="text-xs text-black/40">{t(lang, 'admin', 'panel')}</p>
                    </div>
                </div>

                <h1 className="text-3xl font-bold tracking-tight mb-2">{t(lang, 'admin', 'welcomeBack')}</h1>
                <p className="text-black/50 mb-8 text-sm">{t(lang, 'admin', 'enterPassword')}</p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <input
                        autoFocus
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={t(lang, 'admin', 'passwordPlaceholder')}
                        className="w-full px-5 py-4 bg-black/5 border border-transparent rounded-2xl focus:outline-none focus:bg-white focus:border-black transition-all text-base font-medium"
                    />

                    {status === 'error' && (
                        <p className="text-red-500 text-sm font-medium bg-red-50 px-4 py-3 rounded-xl">
                            {t(lang, 'admin', 'wrongPassword')}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={!password || status === 'loading'}
                        className="w-full py-4 bg-black text-white rounded-2xl font-bold hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-40 disabled:hover:scale-100 flex items-center justify-center gap-2"
                    >
                        {status === 'loading' ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <LogIn className={cn("w-4 h-4", lang === 'ar' && "rotate-180")} /> {t(lang, 'admin', 'signIn')}
                            </>
                        )}
                    </button>
                </form>

                <p className="text-center mt-8 text-xs text-black/30">
                    <a href="/" className="hover:text-black transition-colors">{t(lang, 'admin', 'backToBooking')}</a>
                </p>
            </motion.div>
        </div>
    );
}

// ── Main Dashboard ───────────────────────────────────────────────────────────

function Dashboard({ onLogout }: { onLogout: () => void }) {
    const { lang, setLang } = useLanguage();
    const [bookings, setBookings] = useState<AdminBooking[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [filterRoom, setFilterRoom] = useState('');
    const [filterDate, setFilterDate] = useState('');
    const [confirmDelete, setConfirmDelete] = useState<AdminBooking | null>(null);
    const [deleting, setDeleting] = useState(false);
    
    // Settings / Password Modal
    const [showSettings, setShowSettings] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [savingPassword, setSavingPassword] = useState(false);
    const [passwordError, setPasswordError] = useState('');
    const [passwordSuccess, setPasswordSuccess] = useState(false);

    // View Mode & Calendar State
    const [viewMode, setViewMode] = useState<'list' | 'calendar'>('calendar');
    const [calendarMonth, setCalendarMonth] = useState(startOfMonth(new Date()));
    const [selectedDate, setSelectedDate] = useState<Date | null>(startOfDay(new Date()));
    const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterRoom) params.set('room_id', filterRoom);
            if (filterDate) params.set('date', filterDate);

            const [bRes, sRes] = await Promise.all([
                adminFetch(`/api/admin/bookings?${params}`),
                adminFetch('/api/admin/stats'),
            ]);

            if (bRes.status === 401 || sRes.status === 401) {
                onLogout();
                return;
            }

            setBookings(await bRes.json());
            setStats(await sRes.json());
        } finally {
            setLoading(false);
        }
    }, [filterRoom, filterDate, onLogout]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Real-time WebSocket updates
    useEffect(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(`${protocol}//${window.location.host}`);
        socket.onmessage = () => fetchData(); // Re-fetch on any booking change
        return () => socket.close();
    }, [fetchData]);

    const handleLogout = async () => {
        await adminFetch('/api/admin/logout', { method: 'POST' });
        localStorage.removeItem(TOKEN_KEY);
        onLogout();
    };

    const handleDelete = async () => {
        if (!confirmDelete) return;
        setDeleting(true);
        await adminFetch(`/api/admin/bookings/${confirmDelete.id}`, { method: 'DELETE' });
        setDeleting(false);
        setConfirmDelete(null);
        fetchData();
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordError('');
        setPasswordSuccess(false);
        setSavingPassword(true);

        try {
            const res = await adminFetch('/api/admin/password', {
                method: 'POST',
                body: JSON.stringify({ currentPassword, newPassword }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to change password');
            }

            setPasswordSuccess(true);
            setCurrentPassword('');
            setNewPassword('');
            setTimeout(() => setShowSettings(false), 2000);
        } catch (err: any) {
            setPasswordError(err.message);
        } finally {
            setSavingPassword(false);
        }
    };

    // Group and Merge bookings by date
    const grouped = bookings.reduce<Record<string, AdminBooking[]>>((acc, b) => {
        const key = b.start_time.slice(0, 10);
        if (!acc[key]) acc[key] = [];
        acc[key].push(b);
        return acc;
    }, {});

    // Sort dates and merge consecutive bookings within each day
    const sortedDates = Object.keys(grouped).sort();
    
    // Calendar specific variables
    const handlePrevMonth = () => setCalendarMonth(subMonths(calendarMonth, 1));
    const handleNextMonth = () => setCalendarMonth(addMonths(calendarMonth, 1));

    const daysInterval = eachDayOfInterval({
        start: startOfWeek(startOfMonth(calendarMonth)),
        end: endOfWeek(endOfMonth(calendarMonth))
    });

    sortedDates.forEach(date => {
        const dayBookings = grouped[date].sort((a, b) => 
            parseISO(a.start_time).getTime() - parseISO(b.start_time).getTime()
        );
        
        const merged: AdminBooking[] = [];
        dayBookings.forEach(current => {
            if (merged.length === 0) {
                merged.push({ ...current });
                return;
            }
            
            const last = merged[merged.length - 1];
            
            // Criteria for merging: same room, same user, same phone, back-to-back
            const isSameRoom = last.room_id === current.room_id;
            const isSameUser = last.user_name === current.user_name;
            const isSamePhone = last.phone === current.phone;
            const isConsecutive = last.end_time === current.start_time;
            
            if (isSameRoom && isSameUser && isSamePhone && isConsecutive) {
                // Extend the last merged booking
                last.end_time = current.end_time;
            } else {
                merged.push({ ...current });
            }
        });
        
        grouped[date] = merged;
    });

    return (
        <div className="min-h-screen bg-[#F5F5F3]">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-white border-b border-black/5">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">{t(lang, 'app', 'title') as string}</span>
                            <span className="text-black/20">/</span>
                            <span className="flex items-center gap-1.5 text-sm text-black/50 font-medium">
                                <LayoutDashboard className="w-3.5 h-3.5" /> {t(lang, 'admin', 'panel')}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-3">
                        <button
                            onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
                            className="text-sm font-semibold hover:bg-black/5 rounded-lg px-2 py-1.5 transition-colors text-black/50 hover:text-black cursor-pointer mr-2"
                        >
                            {lang === 'en' ? 'العربية' : 'EN'}
                        </button>
                        <button
                            onClick={fetchData}
                            className="p-2 hover:bg-black/5 rounded-full transition-colors text-black/40 hover:text-black"
                            title="Refresh"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => {
                                setShowSettings(true);
                                setPasswordSuccess(false);
                                setPasswordError('');
                                setCurrentPassword('');
                                setNewPassword('');
                            }}
                            className="p-2 hover:bg-black/5 rounded-full transition-colors text-black/40 hover:text-black"
                            title={t(lang, 'admin', 'settings')}
                        >
                            <Settings className="w-4 h-4" />
                        </button>
                        <a
                            href="/"
                            className="hidden sm:inline-block text-sm text-black/40 hover:text-black transition-colors px-3 py-1.5 rounded-lg hover:bg-black/5"
                        >
                            {t(lang, 'admin', 'viewSite')}
                        </a>
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 text-sm font-medium px-3 sm:px-4 py-2 rounded-xl bg-black/5 hover:bg-black hover:text-white transition-all"
                        >
                            <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">{t(lang, 'admin', 'logout')}</span>
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8">
                {/* Stats */}
                {stats && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {[
                            { label: 'Total Bookings', value: stats.total, icon: Calendar },
                            { label: "Today's Bookings", value: stats.today, icon: Clock },
                            { label: 'Upcoming', value: stats.upcoming, icon: Users },
                        ].map(({ label, value, icon: Icon }) => (
                            <div key={label} className="bg-white rounded-2xl p-6 border border-black/5">
                                <Icon className="w-5 h-5 text-black/30 mb-3" />
                                <p className="text-3xl font-bold">{value}</p>
                                <p className="text-sm text-black/50 mt-1">{label}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* Filters & View Toggle */}
                <div className="bg-white rounded-2xl border border-black/5 p-4 sm:p-5 flex flex-col lg:flex-row gap-4 lg:gap-6 items-stretch lg:items-center justify-between">
                    <div className="flex gap-2 bg-black/5 p-1 rounded-xl w-fit shrink-0">
                        <button
                            onClick={() => setViewMode('list')}
                            className={cn('flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all', viewMode === 'list' ? 'bg-white shadow-sm text-black' : 'text-black/40 hover:text-black')}
                        >
                            <List className="w-4 h-4" /> List
                        </button>
                        <button
                            onClick={() => setViewMode('calendar')}
                            className={cn('flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all', viewMode === 'calendar' ? 'bg-white shadow-sm text-black' : 'text-black/40 hover:text-black')}
                        >
                            <CalendarDays className="w-4 h-4" /> Calendar
                        </button>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                        <div className="relative">
                            <select
                                value={filterRoom}
                                onChange={(e) => setFilterRoom(e.target.value)}
                                className="appearance-none w-full sm:w-auto pl-4 pr-9 py-2.5 bg-black/5 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-black/10 cursor-pointer"
                            >
                                <option value="">All Rooms</option>
                                {ROOMS.map(r => (
                                    <option key={r.id} value={r.id}>{r.name}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none text-black/40" />
                        </div>

                        <input
                            type="date"
                            value={filterDate}
                            onChange={(e) => setFilterDate(e.target.value)}
                            className="w-full sm:w-auto pl-4 pr-4 py-2.5 bg-black/5 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-black/10"
                        />

                        {(filterRoom || filterDate) && (
                            <button
                                onClick={() => { setFilterRoom(''); setFilterDate(''); }}
                                className="flex items-center gap-1.5 text-sm text-black/40 hover:text-black transition-colors px-3 py-2.5 rounded-xl hover:bg-black/5"
                            >
                                <X className="w-3.5 h-3.5" /> Clear
                            </button>
                        )}
                    </div>
                </div>

                {/* Bookings list / Calendar view */}
                {loading ? (
                    <div className="flex items-center justify-center py-24">
                        <div className="w-8 h-8 border-2 border-black/10 border-t-black rounded-full animate-spin" />
                    </div>
                ) : viewMode === 'list' ? (
                    sortedDates.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-black/5 flex flex-col items-center justify-center py-24 text-center">
                            <Calendar className="w-10 h-10 text-black/10 mb-4" />
                            <p className="font-semibold text-black/40">No bookings found</p>
                            <p className="text-sm text-black/30 mt-1">Try adjusting your filters</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {sortedDates.map((date) => (
                                <div key={date}>
                                    <div className="flex items-center gap-3 mb-3">
                                        <h2 className="font-bold text-sm text-black/50 uppercase tracking-wider">
                                            {dayLabel(grouped[date][0].start_time, lang)}
                                        </h2>
                                        <span className="text-xs bg-black/10 text-black/50 rounded-full px-2 py-0.5 font-semibold">
                                            {grouped[date].length} booking{grouped[date].length !== 1 ? 's' : ''}
                                        </span>
                                    </div>

                                    <div className="space-y-2">
                                        {grouped[date].map((b) => {
                                            const past = isPast(parseISO(b.end_time));
                                            return (
                                                <motion.div
                                                    key={b.id}
                                                    initial={{ opacity: 0, y: 8 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, x: -20 }}
                                                    className={cn(
                                                        'relative bg-white rounded-2xl border border-black/5 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 transition-opacity',
                                                        past && 'opacity-50'
                                                    )}
                                                >
                                                    {/* Room pill */}
                                                    <span className={cn(
                                                        'text-xs font-bold px-3 py-1.5 rounded-full shrink-0',
                                                        ROOM_COLORS[b.room_id] || 'bg-gray-100 text-gray-600'
                                                    )}>
                                                        {t(lang, 'rooms', b.room_name as any) || b.room_name}
                                                    </span>

                                                    {/* Time */}
                                                    <div className="flex items-center gap-1.5 text-sm font-semibold shrink-0">
                                                        <Clock className="w-3.5 h-3.5 text-black/30" />
                                                        {format(parseISO(b.start_time), 'h:mm a', { locale: lang === 'ar' ? ar : enUS })} – {format(parseISO(b.end_time), 'h:mm a', { locale: lang === 'ar' ? ar : enUS })}
                                                    </div>

                                                    {/* Name */}
                                                    <div className="flex items-center gap-1.5 text-sm font-medium text-black/70 min-w-0">
                                                        <User className="w-3.5 h-3.5 text-black/30 shrink-0" />
                                                        <span className="truncate">{b.user_name}</span>
                                                    </div>

                                                    {/* Phone */}
                                                    {b.phone && (
                                                        <div className="flex items-center gap-1.5 text-sm text-black/50 shrink-0">
                                                            <Phone className="w-3.5 h-3.5" />
                                                            {b.phone}
                                                        </div>
                                                    )}

                                                    {/* Past badge */}
                                                    {past && (
                                                        <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-black/30 bg-black/5 px-2 py-1 rounded shrink-0">
                                                            Done
                                                        </span>
                                                    )}

                                                    {/* Cancel */}
                                                    <button
                                                        onClick={() => setConfirmDelete(b)}
                                                        className="absolute top-4 right-4 sm:relative sm:top-auto sm:right-auto sm:ml-auto shrink-0 p-2 text-black/20 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                                        title="Cancel booking"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                ) : (
                    <div className="space-y-8">
                        {/* Calendar Grid */}
                        <div className="bg-white rounded-3xl border border-black/5 overflow-hidden">
                            <div className="flex items-center justify-between p-5 border-b border-black/5">
                                <h2 className="text-xl font-bold">{format(calendarMonth, 'MMMM yyyy', { locale: lang === 'ar' ? ar : enUS })}</h2>
                                <div className="flex items-center gap-1">
                                    <button onClick={handlePrevMonth} className="p-2 hover:bg-black/5 rounded-full transition-colors">
                                        <ChevronLeft className="w-5 h-5 text-black/60" />
                                    </button>
                                    <button onClick={handleNextMonth} className="p-2 hover:bg-black/5 rounded-full transition-colors">
                                        <ChevronRight className="w-5 h-5 text-black/60" />
                                    </button>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-7 border-b border-black/5 bg-black/[0.02]">
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                                    <div key={day} className="py-3 text-center text-[10px] font-bold uppercase tracking-wider text-black/40">
                                        {t(lang, 'days', day as any)}
                                    </div>
                                ))}
                            </div>
                            
                            <div className="grid grid-cols-7 pb-2 px-2 gap-1 mt-2">
                                {daysInterval.map((day, i) => {
                                    const dateKey = format(day, 'yyyy-MM-dd');
                                    const dayBookings = grouped[dateKey] || [];
                                    const isCurrentMonth = isSameMonth(day, calendarMonth);
                                    const isSelected = selectedDate && isSameDay(day, selectedDate);
                                    
                                    // Get unique colors for dots based on booked rooms that day
                                    const bookedRoomIds = Array.from(new Set(dayBookings.map(b => b.room_id as number)));

                                    return (
                                        <button
                                            key={day.toISOString()}
                                            onClick={() => { setSelectedDate(day); setSelectedRoomId(null); }}
                                            className={cn(
                                                'min-h-[100px] p-1.5 flex flex-col items-center rounded-xl transition-all cursor-pointer relative',
                                                isCurrentMonth ? 'text-black' : 'text-black/30',
                                                isSelected ? 'bg-black/5 ring-2 ring-black shadow-sm' : 'hover:bg-black/5'
                                            )}
                                        >
                                            <span className={cn('text-sm font-bold w-6 h-6 flex items-center justify-center rounded-full mb-1', isToday(day) && !isSelected && 'bg-black text-white', isSelected && 'bg-black text-white')}>
                                                {format(day, 'd')}
                                            </span>
                                            {dayBookings.length > 0 && (
                                                <div className="flex flex-col gap-[2px] w-full overflow-hidden text-left mt-0.5">
                                                    {dayBookings.slice(0, 3).map(b => (
                                                        <div key={b.id} className={cn('text-[8px] sm:text-[9px] leading-tight font-semibold truncate px-1 py-[2px] sm:py-0.5 rounded-[3px]', ROOM_COLORS[b.room_id] || 'bg-black/5 text-black')}>
                                                            {format(parseISO(b.start_time), 'H:mm')} {t(lang, 'rooms', b.room_name as any) || b.room_name}
                                                        </div>
                                                    ))}
                                                    {dayBookings.length > 3 && (
                                                        <div className="text-[8px] sm:text-[10px] font-bold text-black/40 text-center mt-0.5">
                                                            +{dayBookings.length - 3} more
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Selected Date Details */}
                        {selectedDate && (
                            <div className="space-y-6">
                                <h3 className="text-xl font-bold flex items-center gap-2">
                                    <CalendarDays className="w-5 h-5 text-black/40" />
                                    {format(selectedDate, 'EEEE, MMMM d, yyyy', { locale: lang === 'ar' ? ar : enUS })}
                                </h3>
                                
                                {/* Room Selection Cards */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {ROOMS.map(room => {
                                        const dateStr = format(selectedDate, 'yyyy-MM-dd');
                                        const roomBookings = (grouped[dateStr] || []).filter(b => b.room_id === room.id);
                                        const isSelected = selectedRoomId === room.id;
                                        
                                        return (
                                            <button
                                                key={room.id}
                                                onClick={() => setSelectedRoomId(isSelected ? null : room.id)}
                                                className={cn(
                                                    'p-5 rounded-2xl border text-left transition-all',
                                                    isSelected ? 'border-black bg-white shadow-xl scale-[1.02]' : 'border-black/5 bg-white hover:border-black/20 hover:bg-black/[0.01]'
                                                )}
                                            >
                                                <h4 className="font-bold mb-1">{t(lang, 'rooms', room.name as any) || room.name}</h4>
                                                <p className={cn('text-sm font-medium px-2 py-0.5 rounded-md inline-block', roomBookings.length > 0 ? room.color : 'bg-black/5 text-black/40')}>
                                                    {roomBookings.length} booking{roomBookings.length !== 1 ? 's' : ''}
                                                </p>
                                            </button>
                                        );
                                    })}
                                </div>
                                
                                {/* Bookings For Selected Room */}
                                {selectedRoomId !== null && (
                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 pt-2">
                                        <div className="flex items-center gap-2 mb-4">
                                            <h4 className="font-bold text-black/60">
                                                Bookings for {ROOMS.find(r => r.id === selectedRoomId)?.name}
                                            </h4>
                                        </div>
                                        
                                        {(() => {
                                            const dateStr = format(selectedDate, 'yyyy-MM-dd');
                                            const roomBookings = (grouped[dateStr] || []).filter(b => b.room_id === selectedRoomId);
                                            
                                            if (roomBookings.length === 0) {
                                                return (
                                                    <div className="bg-white/50 rounded-2xl border border-dashed border-black/10 py-12 text-center text-black/40 text-sm font-medium">
                                                        No bookings for this room.
                                                    </div>
                                                );
                                            }
                                            
                                            return roomBookings.map(b => {
                                                const past = isPast(parseISO(b.end_time));
                                                return (
                                                    <div key={b.id} className={cn("relative bg-white rounded-2xl border border-black/5 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 transition-opacity", past && 'opacity-50')}>
                                                        <div className="flex items-center gap-1.5 text-sm font-bold w-32 shrink-0">
                                                            <Clock className="w-3.5 h-3.5 text-black/40" />
                                                            {format(parseISO(b.start_time), 'h:mm a', { locale: lang === 'ar' ? ar : enUS })}
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-sm font-bold w-32 shrink-0 text-black/40">
                                                            {format(parseISO(b.end_time), 'h:mm a', { locale: lang === 'ar' ? ar : enUS })}
                                                        </div>
                                                        <div className="flex items-center gap-2 text-sm font-medium text-black/80 min-w-0">
                                                            <User className="w-4 h-4 text-black/30 shrink-0" />
                                                            <span className="truncate">{b.user_name}</span>
                                                        </div>
                                                        {b.phone && (
                                                            <div className="flex items-center gap-1.5 text-xs font-semibold text-black/50 bg-black/5 px-2.5 py-1.5 rounded-lg shrink-0">
                                                                <Phone className="w-3.5 h-3.5" />
                                                                {b.phone}
                                                            </div>
                                                        )}
                                                        {past && (
                                                            <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-black/30 bg-black/5 px-2 py-1 rounded shrink-0">
                                                                Done
                                                            </span>
                                                        )}
                                                        <button
                                                            onClick={() => setConfirmDelete(b)}
                                                            className="absolute top-4 right-4 sm:relative sm:top-auto sm:right-auto sm:ml-auto shrink-0 p-2 text-black/20 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                                            title="Cancel booking"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                );
                                            });
                                        })()}
                                    </motion.div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* Confirm delete modal */}
            {confirmDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
                    <div
                        onClick={() => setConfirmDelete(null)}
                        className="absolute inset-0 bg-black/70"
                    />
                    <div
                        className="relative bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl"
                    >
                            <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mb-5">
                                <Trash2 className="w-6 h-6 text-red-500" />
                            </div>
                            <h3 className="text-xl font-bold mb-2">{t(lang, 'admin', 'cancelThisBooking')}</h3>
                            <p className="text-black/50 text-sm mb-1">
                                <strong>{t(lang, 'rooms', confirmDelete.room_name as any) || confirmDelete.room_name}</strong>
                            </p>
                            <p className="text-black/50 text-sm mb-1">
                                {format(parseISO(confirmDelete.start_time), 'EEE, MMM d · h:mm a', { locale: lang === 'ar' ? ar : enUS })}
                            </p>
                            <p className="text-black/50 text-sm mb-6">
                                {confirmDelete.user_name} {confirmDelete.phone && `· ${confirmDelete.phone}`}
                            </p>
                            <p className="text-sm text-black/40 mb-6 bg-black/5 rounded-xl px-4 py-3">
                                This will free up the slot and the customer will be able to book again.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setConfirmDelete(null)}
                                    className="flex-1 py-3 rounded-xl bg-black/5 font-semibold text-sm hover:bg-black/10 transition-colors"
                                >
                                    Keep it
                                </button>
                                <button
                                    onClick={handleDelete}
                                    disabled={deleting}
                                    className="flex-1 py-3 rounded-xl bg-red-500 text-white font-semibold text-sm hover:bg-red-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                                >
                                    {deleting ? (
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <Trash2 className="w-4 h-4" /> Cancel booking
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Settings Modal */}
                {showSettings && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
                        <div
                            onClick={() => !savingPassword && setShowSettings(false)}
                            className="absolute inset-0 bg-black/70"
                        />
                        <div
                            className="relative bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-bold">Settings</h3>
                                <button
                                    onClick={() => !savingPassword && setShowSettings(false)}
                                    className="p-2 hover:bg-black/5 rounded-full transition-colors"
                                >
                                    <X className="w-5 h-5 text-black/40" />
                                </button>
                            </div>

                            <div className="mb-6 pb-6 border-b border-black/5">
                                <h4 className="font-semibold mb-4 text-sm">Change Admin Password</h4>
                                <form onSubmit={handleChangePassword} className="space-y-4">
                                    <input
                                        type="password"
                                        required
                                        placeholder="Current password"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        className="w-full px-4 py-3 bg-black/5 border border-transparent rounded-xl focus:outline-none focus:bg-white focus:border-black transition-all text-sm font-medium"
                                    />
                                    <input
                                        type="password"
                                        required
                                        minLength={6}
                                        placeholder="New password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="w-full px-4 py-3 bg-black/5 border border-transparent rounded-xl focus:outline-none focus:bg-white focus:border-black transition-all text-sm font-medium"
                                    />
                                    
                                    {passwordError && (
                                        <p className="text-red-500 text-xs font-medium bg-red-50 px-3 py-2 rounded-lg">
                                            {passwordError}
                                        </p>
                                    )}

                                    {passwordSuccess && (
                                        <p className="text-emerald-600 text-xs font-medium bg-emerald-50 px-3 py-2 rounded-lg">
                                            Password updated successfully!
                                        </p>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={!currentPassword || !newPassword || savingPassword || passwordSuccess}
                                        className="w-full py-3 bg-black text-white rounded-xl font-bold hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-40 disabled:hover:scale-100 flex items-center justify-center h-11"
                                    >
                                        {savingPassword ? (
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            'Update Password'
                                        )}
                                    </button>
                                </form>
                            </div>


                        </div>
                    </div>
                )}
        </div>
    );
}

// ── Root Admin component ──────────────────────────────────────────────────────

export default function Admin() {
    const [token, setToken] = useState<string | null>(getToken());

    if (!token) {
        return <LoginScreen onLogin={setToken} />;
    }

    return <Dashboard onLogout={() => setToken(null)} />;
}
