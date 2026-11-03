/**
 * Пересечение двух интервалов [start, end) в миллисекундах UTC.
 * Общая проверка антидубля: для записей при бронировании и для статуса слотов.
 */
export function intervalsIntersect(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}
