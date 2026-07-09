"use client"

import React, { forwardRef, useMemo, useState } from "react"
import { Icon } from "@iconify/react"

type ModernInputStyle = React.CSSProperties

type OptionItem = { value: string; label: string }

type BaseProps = {
  as?: "input" | "select" | "textarea"
  options?: Array<OptionItem | string>
  containerStyle?: React.CSSProperties
  style?: React.CSSProperties
  className?: string
}

type InputProps = BaseProps &
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
    as?: "input"
    onChange?: React.ChangeEventHandler<HTMLInputElement>
  }

type TextareaProps = BaseProps &
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    as: "textarea"
  }

type SelectProps = BaseProps &
  React.SelectHTMLAttributes<HTMLSelectElement> & {
    as: "select"
  }

type ModernInputProps = InputProps | TextareaProps | SelectProps

const DEFAULT_BORDER_COLOR = "#d1d5db"
const FOCUSED_BORDER_COLOR = "#f5a623"
const FILLED_BORDER_COLOR = "#0070f3"

type FieldState = "idle" | "focused" | "filled"

function deriveBorder(
  border: React.CSSProperties["border"],
  color: string
) {
  if (!border) return `1px solid ${color}`

  const parts = String(border).trim().split(" ")
  const width = parts[0] || "1px"
  const style = parts[1] || "solid"

  return `${width} ${style} ${color}`
}

const baseStyles: ModernInputStyle = {
  width: "100%",
  padding: "12px 14px",
  boxSizing: "border-box",
  borderRadius: 10,
  background: "white",
  color: "#171717",
  fontSize: 15,
  minHeight: 48,
  outline: "none",
  transition:
    "border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease",
}

const ModernInput = forwardRef<HTMLElement, ModernInputProps>(
  (
    {
      as = "input",
      style,
      containerStyle,
      className,
      options,
      value,
      defaultValue,
      onFocus,
      onBlur,
      children,
      ...rest
    },
    ref
  ) => {
    const [state, setState] = useState<FieldState>("idle")

    const isFilled = useMemo(() => {
      const v = value ?? defaultValue
      return (
        v !== undefined &&
        v !== null &&
        String(v).trim() !== ""
      )
    }, [value, defaultValue])

    const borderColor =
      state === "focused"
        ? FOCUSED_BORDER_COLOR
        : state === "filled"
        ? FILLED_BORDER_COLOR
        : DEFAULT_BORDER_COLOR

    const mergedStyle: React.CSSProperties = {
      ...baseStyles,
      ...style,
      border: deriveBorder(style?.border, borderColor),
      boxShadow:
        state === "focused"
          ? "0 0 0 3px rgba(245, 166, 35, 0.15)"
          : style?.boxShadow,
    }

    const handleFocus = (e: any) => {
      setState("focused")
      onFocus?.(e)
    }

    const handleBlur = (e: any) => {
      setState(isFilled ? "filled" : "idle")
      onBlur?.(e)
    }

    if (as === "textarea") {
      return (
        <textarea
          ref={ref as React.Ref<HTMLTextAreaElement>}
          style={mergedStyle}
          className={className}
          value={value as string | undefined}
          defaultValue={defaultValue as string | undefined}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...(rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      )
    }

    if (as === "select") {
      return (
        <div
          style={{
            position: "relative",
            width: "100%",
            ...containerStyle,
          }}
        >
          <select
            ref={ref as React.Ref<HTMLSelectElement>}
            style={{
              ...mergedStyle,

              // Hide browser default arrow
              appearance: "none",
              WebkitAppearance: "none",
              MozAppearance: "none",

              // Space for custom icon
              paddingRight: 42,

              cursor: "pointer",
            }}
            className={className}
            value={value as string | number | undefined}
            defaultValue={defaultValue as string | number | undefined}
            onFocus={handleFocus}
            onBlur={handleBlur}
            {...(rest as React.SelectHTMLAttributes<HTMLSelectElement>)}
          >
            {children}

            {options?.map((o, i) =>
              typeof o === "string" ? (
                <option key={i} value={o}>
                  {o}
                </option>
              ) : (
                <option key={o.value ?? i} value={o.value}>
                  {o.label}
                </option>
              )
            )}
          </select>

          <Icon
            icon="mdi:chevron-down"
            width={20}
            height={20}
            style={{
              position: "absolute",
              right: 14,
              top: "50%",
              transform: "translateY(-50%)",
              color: "#94a3b8",
              pointerEvents: "none",
            }}
          />
        </div>
      )
    }

    const inputProps = rest as React.InputHTMLAttributes<HTMLInputElement>
    const { type: inputType, onChange: origOnChange, ...inputRest } = inputProps

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (inputType === "number" && e.target.value.startsWith("-")) {
        return
      }
      origOnChange?.(e)
    }

    return (
      <input
        ref={ref as React.Ref<HTMLInputElement>}
        type={inputType}
        style={mergedStyle}
        className={className}
        value={value as string | number | undefined}
        defaultValue={defaultValue as string | number | undefined}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={handleChange}
        {...inputRest}
        onWheel={(e) => {
          if (inputType === "number") (e.target as HTMLElement).blur()
        }}
      />
    )
  }
)

ModernInput.displayName = "ModernInput"

export default ModernInput