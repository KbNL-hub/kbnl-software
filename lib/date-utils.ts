import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"

dayjs.extend(utc)

export function toISOString(date: Date = new Date()): string {
  return date.toISOString()
}

export function saleDateWithTime(dateStr: string): string {
  return dayjs(dateStr).hour(dayjs().hour()).minute(dayjs().minute()).second(dayjs().second()).utc().toISOString()
}

export function formatDateTime(date: string | Date): string {
  return dayjs(date).format("MMM D, YYYY h:mm A")
}

export function formatDate(date: string | Date): string {
  return dayjs(date).format("MMM D, YYYY")
}

export function formatTime(date: string | Date): string {
  return dayjs(date).format("h:mm A")
}

export function formatTimeShort(date: string | Date): string {
  return dayjs(date).format("h:mm A")
}
