import re
s = '              <input type="text" placeholder="Enter ATC number" value={atc} onChange={e => { setAtc(e.target.value); setMessage("") }} onKeyDown={e => { if (e.key === "Enter") loadedQtyRef.current?.focus() }} style={inputStyle} />\n'
pattern1 = re.compile(r'style=\{inputStyle\}')
pattern2 = re.compile(r'<input.*style=\{inputStyle\}', flags=re.DOTALL)
pattern3 = re.compile(r'<input[^>]*style=\{inputStyle\}[^>]*>', flags=re.DOTALL)
pattern4 = re.compile(r'<input[\s\S]*style=\{inputStyle\}[\s\S]*?>')
print('pattern1', bool(pattern1.search(s)))
print('pattern2', bool(pattern2.search(s)))
print('pattern3', bool(pattern3.search(s)))
print('pattern4', bool(pattern4.search(s)))
print('match4', pattern4.search(s))
