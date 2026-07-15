import { useI18n } from '../i18n';
import type { Profile } from '../types';

export const availabilityDayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type AvailabilityDayKey = typeof availabilityDayKeys[number];
export type AvailabilityDay = { enabled: boolean; start: string; end: string };
export type AvailabilityHours = {
  version: 1;
  timezone: string;
  weekly: Record<AvailabilityDayKey, AvailabilityDay>;
  note?: string;
};

export function isAllDayAvailability(day: Pick<AvailabilityDay, 'enabled' | 'start' | 'end'>) {
  return day.enabled && day.start === '00:00' && day.end === '00:00';
}

const defaultDay = (): AvailabilityDay => ({ enabled: false, start: '09:00', end: '18:00' });

export function normalizeAvailabilityHoursForEditor(value: Profile['opening_hours']): AvailabilityHours {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const weeklyInput = input.weekly && typeof input.weekly === 'object' && !Array.isArray(input.weekly)
    ? input.weekly as Record<string, unknown>
    : input;
  const weekly = Object.fromEntries(availabilityDayKeys.map((day) => {
    const raw = weeklyInput[day];
    const schedule = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const start = validTime(schedule.start ?? schedule.from) || '09:00';
    const end = validTime(schedule.end ?? schedule.to) || '18:00';
    return [day, { enabled: Boolean(schedule.enabled), start, end }];
  })) as Record<AvailabilityDayKey, AvailabilityDay>;
  const legacyNote = typeof value === 'string' ? value : '';
  return {
    version: 1,
    timezone: String(input.timezone || 'Europe/Berlin'),
    weekly,
    ...(String(input.note || legacyNote).trim() ? { note: String(input.note || legacyNote).trim() } : {})
  };
}

export function AvailabilityHoursEditor({ value, onChange }: {
  value: Profile['opening_hours'];
  onChange: (value: AvailabilityHours) => void;
}) {
  const { t } = useI18n();
  const schedule = normalizeAvailabilityHoursForEditor(value);

  function updateDay(day: AvailabilityDayKey, patch: Partial<AvailabilityDay>) {
    onChange({ ...schedule, weekly: { ...schedule.weekly, [day]: { ...schedule.weekly[day], ...patch } } });
  }

  return (
    <fieldset className="availability-hours-editor">
      <legend>{t('availability.hours')}</legend>
      <div className="availability-hours-timezone">
        <label htmlFor="availability-timezone">{t('availability.timezone')}</label>
        <input id="availability-timezone" value={schedule.timezone} onChange={(event) => onChange({ ...schedule, timezone: event.target.value })} placeholder="Europe/Berlin" />
      </div>
      <div className="availability-hours-week">
        {availabilityDayKeys.map((day) => (
          <div className={`availability-hours-day ${schedule.weekly[day].enabled ? 'is-enabled' : ''}`} key={day}>
            <label className="availability-hours-toggle">
              <input type="checkbox" checked={schedule.weekly[day].enabled} onChange={(event) => updateDay(day, { enabled: event.target.checked })} />
              <span>{t(`availability.days.${day}`)}</span>
            </label>
            <div className="availability-hours-range">
              <input type="time" aria-label={`${t(`availability.days.${day}`)} ${t('availability.from')}`} value={schedule.weekly[day].start} disabled={!schedule.weekly[day].enabled} onChange={(event) => updateDay(day, { start: event.target.value })} />
              <span aria-hidden="true">–</span>
              <input type="time" aria-label={`${t(`availability.days.${day}`)} ${t('availability.to')}`} value={schedule.weekly[day].end} disabled={!schedule.weekly[day].enabled} onChange={(event) => updateDay(day, { end: event.target.value })} />
            </div>
            {isAllDayAvailability(schedule.weekly[day])
              ? <small>{t('availability.allDay')}</small>
              : !schedule.weekly[day].enabled && <small>{t('availability.closed')}</small>}
          </div>
        ))}
      </div>
      <label className="availability-hours-note">
        <span>{t('availability.note')}</span>
        <textarea value={schedule.note || ''} maxLength={500} onChange={(event) => onChange({ ...schedule, note: event.target.value })} placeholder={t('availability.notePlaceholder')} />
      </label>
    </fieldset>
  );
}

function validTime(value: unknown) {
  const time = String(value || '');
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : '';
}
