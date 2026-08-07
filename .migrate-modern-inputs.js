/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs')
const path = require('path')

const root = process.cwd()
const files = [
  'app/broker/page.tsx',
  'app/driver/page.tsx',
  'app/station-manager/page.tsx',
  'app/store-officer/page.tsx',
  'app/truck-admin/page.tsx',
  'app/truck-officer/page.tsx',
  'components/admin/CashOfficers.tsx',
  'components/admin/StationManagers.tsx',
  'components/admin/StoreOfficers.tsx',
  'components/admin/TruckAdmins.tsx',
  'components/admin/TruckOfficers.tsx',
  'components/CashOfficerPanel.tsx',
]

const importStatement = 'import ModernInput from "@/components/ModernInput"\n'

for (const file of files) {
  const filePath = path.join(root, file)
  let text = fs.readFileSync(filePath, 'utf8')
  const original = text

  const hasModernImport = /import\s+ModernInput\s+from\s+"@\/components\/ModernInput"/.test(text)
  const hasTarget = /<input[\s\S]*?style=\{inputStyle\}|<select[\s\S]*?style=\{inputStyle\}|<textarea[\s\S]*?style=\{inputStyle\}/.test(text)

  if (hasTarget && !hasModernImport) {
    if (/^"use client"/.test(text)) {
      const lines = text.split(/\r?\n/)
      const insertAt = lines.findIndex((line, idx) => idx > 0 && line.startsWith('import '))
      if (insertAt >= 0) {
        lines.splice(insertAt, 0, importStatement.trimEnd())
      } else {
        lines.splice(1, 0, importStatement.trimEnd())
      }
      text = lines.join('\n')
    } else {
      const match = text.match(/^(?:import .*\r?\n)+/)
      if (match) {
        const prefix = match[0]
        text = prefix + importStatement + text.slice(prefix.length)
      } else {
        text = importStatement + text
      }
    }
  }

  text = text.replace(/<input([^>]*?)style=\{inputStyle\}([^>]*)\/>/g, '<ModernInput$1style={inputStyle}$2/>')
  text = text.replace(/<input([^>]*?)style=\{inputStyle\}([^>]*)>/g, '<ModernInput$1style={inputStyle}$2>')
  text = text.replace(/<select([^>]*?)style=\{inputStyle\}([^>]*)>/g, '<ModernInput as="select"$1style={inputStyle}$2>')
  text = text.replace(/<textarea([^>]*?)style=\{inputStyle\}([^>]*)>([\s\S]*?)<\/textarea>/g, '<ModernInput as="textarea"$1style={inputStyle}$2>$3</ModernInput>')

  if (text !== original) {
    fs.writeFileSync(filePath, text, 'utf8')
    console.log('updated', file)
  }
}
