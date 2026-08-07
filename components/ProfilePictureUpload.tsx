"use client"

import Image from "next/image"
import { useState, useRef } from "react"
import { Icon } from "@iconify/react"
import { supabase } from "@/lib/supabase"
import { STORAGE_BUCKET, MAX_FILE_SIZE, FONT_SIZE } from "@/lib/constants"

interface ProfilePictureUploadProps {
  isOpen: boolean
  onClose: () => void
  userId: string
  table: string
  idField: string
  currentUrl?: string
  onSuccess: (url: string) => void
}

export default function ProfilePictureUpload({
  isOpen,
  onClose,
  userId,
  table,
  idField,
  currentUrl,
  onSuccess,
}: ProfilePictureUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")

  function handleClose() {
    setSelectedFile(null)
    setPreview(null)
    setError("")
    onClose()
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file")
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      setError("Image must be less than 1MB")
      return
    }

    setSelectedFile(file)
    setError("")

    const reader = new FileReader()
    reader.onload = (event) => {
      setPreview(event.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  async function handleUpload() {
    if (!selectedFile) {
      setError("Please select an image")
      return
    }

    setUploading(true)
    setError("")

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError("Session expired"); setUploading(false); return }

      const rawExt = selectedFile.name.split(".").pop()?.toLowerCase() ?? ""
      const fileExt = /^[a-z0-9]+$/.test(rawExt) ? rawExt : "jpg"
      const fileName = `${userId}-${Date.now()}.${fileExt}`
      const filePath = `${userId}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, selectedFile, { upsert: false })

      if (uploadError) { setError("Upload failed"); setUploading(false); return }

      const { data: { publicUrl } } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(filePath)

      const { error: updateError } = await supabase
        .from(table)
        .update({ profile_picture_url: publicUrl })
        .eq(idField, userId)

      if (updateError) {
        await supabase.storage.from(STORAGE_BUCKET).remove([filePath])
        setError("Failed to save profile")
        setUploading(false)
        return
      }

      if (currentUrl) {
        const oldPath = new URL(currentUrl).pathname.split("/").slice(-2).join("/")
        await supabase.storage.from(STORAGE_BUCKET).remove([oldPath])
      }

      onSuccess(publicUrl)
      setUploading(false)
      handleClose()
    } catch {
      setError("Something went wrong")
      setUploading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      onClick={handleClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)",
        backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end",
        justifyContent: "center", zIndex: 100,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "white", borderRadius: "20px 20px 0 0",
          padding: "28px 20px", width: "100%", maxWidth: 420,
          maxHeight: "90vh", overflowY: "auto",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        }}
      >
        <h3 style={{ margin: "0 0 6px 0", fontSize: FONT_SIZE.xl, fontWeight: 700, color: "#0f172a" }}>
          Update Profile Picture
        </h3>
        <p style={{ margin: "0 0 20px 0", fontSize: FONT_SIZE.sm, color: "#64748b" }}>
          PNG, JPG up to 1MB
        </p>

        {preview ? (
          <div style={{ marginBottom: 20 }}>
            <p style={{ margin: "0 0 8px 0", fontSize: FONT_SIZE.sm, fontWeight: 600, color: "#0f172a" }}>Preview</p>
            <Image
              src={preview}
              alt="Preview"
              width={400}
              height={200}
              unoptimized
              style={{
                width: "100%", height: 200, objectFit: "cover",
                borderRadius: 12, border: "2px solid #e2e8f0",
              }}
            />
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: "2px dashed #0070f3", borderRadius: 12,
              padding: "32px 16px", cursor: "pointer", background: "#f0f7ff",
              marginBottom: 20, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
            }}
          >
            <Icon icon="mdi:cloud-upload" width={40} height={40} color="#0070f3" style={{ marginBottom: 8 }} />
            <p style={{ margin: "0 0 4px 0", fontSize: FONT_SIZE.base, fontWeight: 700, color: "#0070f3" }}>
              Click to upload
            </p>
            <p style={{ margin: 0, fontSize: FONT_SIZE.sm, color: "#64748b" }}>
              or drag and drop
            </p>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          style={{ display: "none" }}
        />

        {error && (
          <div style={{ padding: 12, background: "#fef2f2", borderLeft: "4px solid #ef4444", borderRadius: 4, marginBottom: 16, color: "#b91c1c", fontSize: FONT_SIZE.sm, fontWeight: 600 }}>
            {error}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button
            onClick={handleClose}
            style={{ padding: "12px 16px", background: "white", border: "1px solid #cbd5e1", color: "#475569", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: FONT_SIZE.md, minHeight: 44 }}
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={uploading || !selectedFile}
            style={{
              padding: "12px 16px",
              background: selectedFile ? "#0070f3" : "#bfdbfe",
              color: "white", border: "none", borderRadius: 8,
              cursor: selectedFile && !uploading ? "pointer" : "not-allowed",
              fontWeight: 700, fontSize: FONT_SIZE.md, minHeight: 44,
              opacity: uploading ? 0.7 : 1,
            }}
          >
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </div>
      </div>
    </div>
  )
}
