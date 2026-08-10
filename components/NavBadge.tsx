"use client"

type Props = {
  count: number
  color?: string
  showLabel: boolean
}

export default function NavBadge({ count, color = "#ef4444", showLabel }: Props) {
  if (count <= 0) return null

  if (!showLabel) {
    return (
      <span
        style={{
          position: "absolute",
          top: -6,
          right: -6,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: color,
          color: "white",
          fontSize: 10,
          fontWeight: "bold",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "2px solid #0f0f1e",
        }}
      />
    )
  }

  return (
    <span
      style={{
        background: color,
        color: "white",
        borderRadius: 12,
        minWidth: 22,
        height: 22,
        fontSize: 11,
        fontWeight: "700",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 6px",
        flexShrink: 0,
      }}
    >
      {count}
    </span>
  )
}
