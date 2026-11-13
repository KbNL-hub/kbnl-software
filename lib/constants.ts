export const FONT_SIZE = {
  xs: 12,
  sm: 13,
  base: 14,
  md: 15,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 28,
} as const

export const BANKS = ["First Bank", "Access Bank", "Stanbic IBTC", "Sterling Bank", "GTB", "UBA", "Zenith Bank"]

// Generic copy for failed mutations. Never surface raw server errors to users.
export const ACTION_FAILED_MESSAGE =
  "Action failed, try again. If the issue persists, kindly contact admin or submit a complaint."

export const STORAGE_BUCKET = "profile-pictures"
export const MAX_FILE_SIZE = 1 * 1024 * 1024
export const POLLING_INTERVAL = 120000
