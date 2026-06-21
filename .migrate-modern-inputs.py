from pathlib import Path
import re

root = Path(".").resolve()
files = [
    Path("app/broker/page.tsx"),
    Path("app/driver/page.tsx"),
    Path("app/station-manager/page.tsx"),
    Path("app/store-officer/page.tsx"),
    Path("app/truck-admin/page.tsx"),
    Path("app/truck-officer/page.tsx"),
    Path("components/admin/CashOfficers.tsx"),
    Path("components/admin/StationManagers.tsx"),
    Path("components/admin/StoreOfficers.tsx"),
    Path("components/admin/TruckAdmins.tsx"),
    Path("components/admin/TruckOfficers.tsx"),
    Path("components/CashOfficerPanel.tsx"),
]

import_stmt = 'import ModernInput from "@/components/ModernInput"\n'

input_pattern = re.compile(r"<input([^>]*?)style=\{inputStyle\}([^>]*)/?>", flags=re.DOTALL)
select_pattern = re.compile(r"<select([^>]*?)style=\{inputStyle\}([^>]*)>", flags=re.DOTALL)
textarea_pattern = re.compile(r"<textarea([^>]*?)style=\{(.*?)\}([^>]*)>(.*?)</textarea>", flags=re.DOTALL)

for file in files:
    path = root / file
    if not path.exists():
        continue
    text = path.read_text(encoding="utf8")
    original = text
    if "ModernInput" not in text and re.search(r"<input[^>]*?style=\{inputStyle\}|<select[^>]*?style=\{inputStyle\}|<textarea[^>]*?style=\{", text):
        if text.startswith('"use client"'):
            lines = text.splitlines()
            insert_index = 1
            while insert_index < len(lines) and lines[insert_index].startswith("import "):
                insert_index += 1
            lines.insert(insert_index, import_stmt.rstrip())
            text = "\n".join(lines) + ("\n" if text.endswith("\n") else "")
        else:
            m = re.match(r'^(?:import .+\n)+', text)
            if m:
                prefix = m.group(0)
                text = prefix + import_stmt + text[len(prefix):]
            else:
                text = import_stmt + text
    text = input_pattern.sub(r"<ModernInput\1style={inputStyle}\2/>", text)
    text = select_pattern.sub(r"<ModernInput as=\"select\"\1style={inputStyle}\2>", text)
    text = textarea_pattern.sub(lambda m: f"<ModernInput as=\"textarea\"{m.group(1)}style={{ {m.group(2)} }}{m.group(3)}>{m.group(4)}</ModernInput>", text)
    if text != original:
        path.write_text(text, encoding="utf8")
        print(f"updated {file}")
