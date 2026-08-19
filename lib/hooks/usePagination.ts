"use client"

import { useState, useMemo } from "react"

const PAGE_SIZE = 100

export function usePagination<T>(items: T[], pageSize: number = PAGE_SIZE) {
  const [page, setPage] = useState(0)

  const totalItems = items.length
  const totalPages = Math.ceil(totalItems / pageSize) || 1
  const safePage = Math.min(page, totalPages - 1)

  const paginatedItems = useMemo(() => {
    const start = safePage * pageSize
    return items.slice(start, start + pageSize)
  }, [items, safePage, pageSize])

  return { page: safePage, setPage, totalPages, paginatedItems, totalItems, pageSize }
}
