export function closingHour(month: number): number {
  return month >= 9 || month <= 3 ? 23 : 24;
}

export function getTimeSlots(date: Date | null): Date[] {
  if (!date) return [];
  const slots: Date[] = [];
  for (let hour = 9; hour < closingHour(date.getMonth()); hour++) {
    for (const minute of [0, 30]) {
      const slot = new Date(date);
      slot.setHours(hour, minute, 0, 0);
      slots.push(slot);
    }
  }
  return slots;
}

const cairoFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function cairoDate(date: Date) {
  const parts = Object.fromEntries(cairoFormatter.formatToParts(date).map(p => [p.type, p.value]));
  return {
    month: Number(parts.month) - 1,
    day: Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)),
    time: (Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second)) * 1000 + date.getUTCMilliseconds(),
  };
}

export function isWithinClosingHours(start: Date, end: Date): boolean {
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return false;
  const localStart = cairoDate(start);
  const localEnd = cairoDate(end);
  // Compare wall-clock dates in Cairo, allowing an end exactly at closing.
  return localEnd.day + localEnd.time <= localStart.day + closingHour(localStart.month) * 3600000;
}
