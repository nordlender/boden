import { describe, expect, it } from 'vitest';
import {
	addDaysIso,
	daysInclusive,
	formatDateDdMmYy,
	formatIsoDateDdMmYy,
	formatDateDisplay,
	formatDateTimeDisplay,
	isIsoDate,
	nowInOslo,
} from '../dates';

describe('nowInOslo', () => {
	it('reads the Oslo wall clock (CEST in summer, CET in winter), 24h, crossing midnight', () => {
		expect(nowInOslo(new Date('2026-07-01T10:05:00Z'))).toEqual({ date: '2026-07-01', time: '12:05' });
		expect(nowInOslo(new Date('2026-01-15T10:05:00Z'))).toEqual({ date: '2026-01-15', time: '11:05' });
		expect(nowInOslo(new Date('2026-07-01T22:30:00Z'))).toEqual({ date: '2026-07-02', time: '00:30' });
	});
});

describe('isIsoDate', () => {
	it('accepts real dates, including leap day', () => {
		expect(isIsoDate('2026-09-06')).toBe(true);
		expect(isIsoDate('2028-02-29')).toBe(true);
	});
	it('rejects malformed and impossible dates', () => {
		expect(isIsoDate('2026-02-31')).toBe(false);
		expect(isIsoDate('2027-02-29')).toBe(false);
		expect(isIsoDate('2026-13-01')).toBe(false);
		expect(isIsoDate('2026-9-6')).toBe(false);
		expect(isIsoDate('')).toBe(false);
	});
});

describe('addDaysIso', () => {
	it('crosses month and year boundaries', () => {
		expect(addDaysIso('2026-01-31', 1)).toBe('2026-02-01');
		expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28');
		expect(addDaysIso('2026-09-06', 7)).toBe('2026-09-13');
	});
});

describe('daysInclusive', () => {
	it('counts both ends', () => {
		expect(daysInclusive('2026-09-06', '2026-09-06')).toBe(1);
		expect(daysInclusive('2026-09-06', '2026-09-08')).toBe(3);
		expect(daysInclusive('2026-03-28', '2026-03-30')).toBe(3); // DST change
	});
});

// nb-NO output can contain NBSP/narrow spaces; normalize before comparing.
const norm = (v: string) => v.replace(/[\s\u00a0\u202f]+/g, ' ');

describe('display formatting', () => {
	it('formats bare dates with a fixed locale', () => {
		expect(norm(formatDateDisplay('2026-10-03'))).toBe('3. okt. 2026');
		expect(norm(formatDateDisplay('2026-10-03', { weekday: true }))).toBe('lør. 3. okt. 2026');
	});
	it('formats date-times in Europe/Oslo regardless of host timezone', () => {
		expect(norm(formatDateTimeDisplay(new Date('2026-07-01T10:30:00Z')))).toBe('1. juli 2026, 12:30');
		expect(norm(formatDateTimeDisplay(new Date('2026-01-01T10:30:00Z')))).toBe('1. jan. 2026, 11:30');
	});
	it('formats dd/mm/yy as the date reads in Oslo', () => {
		expect(formatDateDdMmYy(new Date('2026-09-20T10:00:00Z'))).toBe('20/09/26');
		// 23:30 UTC on the 12th is already the 13th in Oslo.
		expect(formatDateDdMmYy(new Date('2026-10-12T23:30:00Z'))).toBe('13/10/26');
	});
	it('formats a bare YYYY-MM-DD date as dd/mm/yy', () => {
		expect(formatIsoDateDdMmYy('2023-05-15')).toBe('15/05/23');
		expect(formatIsoDateDdMmYy('2001-12-01')).toBe('01/12/01');
	});
});
