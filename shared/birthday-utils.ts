const MS_PER_DAY = 24 * 60 * 60 * 1000;

const birthdayDateRegex = /^(\d{4})-(\d{2})-(\d{2})/;

export function getBirthdayMonthDay(birthDate: string | Date): { month: number; day: number } {
  if (typeof birthDate === "string") {
    const match = birthdayDateRegex.exec(birthDate);
    if (match) {
      return {
        month: Number(match[2]) - 1,
        day: Number(match[3]),
      };
    }
  }

  const parsedDate = birthDate instanceof Date ? birthDate : new Date(birthDate);
  return {
    month: parsedDate.getUTCMonth(),
    day: parsedDate.getUTCDate(),
  };
}

export function getDaysUntilBirthday(birthDate: string | Date, referenceDate: Date = new Date()): number {
  const { month, day } = getBirthdayMonthDay(birthDate);
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);

  let nextBirthday = new Date(today.getFullYear(), month, day);
  if (nextBirthday < today) {
    nextBirthday = new Date(today.getFullYear() + 1, month, day);
  }

  return Math.round((nextBirthday.getTime() - today.getTime()) / MS_PER_DAY);
}

export function isBirthdayToday(birthDate: string | Date, referenceDate: Date = new Date()): boolean {
  return getDaysUntilBirthday(birthDate, referenceDate) === 0;
}

export function formatBirthdayMonthDay(birthDate: string | Date, locale: string = "es-ES"): string {
  const { month, day } = getBirthdayMonthDay(birthDate);
  const safeDate = new Date(2000, month, day);
  return safeDate.toLocaleDateString(locale, { month: "long", day: "numeric" });
}
