#!/usr/bin/env python3
"""Sign ONLY these new generic templates. No credentials or original export."""
import hashlib
import json
import pathlib
import plistlib
import subprocess
import sys
import time

root = pathlib.Path(__file__).resolve().parent
output = root / 'output'
output.mkdir(exist_ok=True)
names = ['Prueba_ChatGPT_Texto', 'Atajo_Maestro', 'Inventario_de_Atajos']
report = {'platform': subprocess.check_output(['sw_vers'], text=True),
          'sign_command': '/usr/bin/shortcuts sign --mode anyone',
          'ios_imported': False, 'ios_executed': False, 'files': []}
failed = False
for name in names:
    source = root / (name + '.unsigned.plist')
    # A .shortcut suffix is used only as PRIVATE input to Apple's signer.
    # This unsigned input is never uploaded as a usable shortcut.
    temporary_input = root / (name + '.signing-input.shortcut')
    temporary_input.write_bytes(source.read_bytes())
    plistlib.loads(temporary_input.read_bytes())
    destination = output / (name + '.shortcut')
    entry = {'name': name, 'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest()}
    try:
        proc = subprocess.run(['/usr/bin/shortcuts', 'sign', '--mode', 'anyone',
                               '--input', str(temporary_input), '--output', str(destination)],
                              capture_output=True, text=True, timeout=90)
        entry.update(exit_code=proc.returncode, stdout=proc.stdout[-4000:], stderr=proc.stderr[-4000:])
        if proc.returncode == 0 and destination.is_file():
            data = destination.read_bytes()
            entry.update(bytes=len(data), sha256=hashlib.sha256(data).hexdigest(),
                         aea1=data.startswith(b'AEA1'))
            if not data.startswith(b'AEA1'):
                failed = True
                destination.unlink()
        else:
            failed = True
            if destination.exists(): destination.unlink()
    except subprocess.TimeoutExpired:
        failed = True
        entry['error'] = 'Native signer timed out after 90 seconds'
        if destination.exists(): destination.unlink()
    finally:
        temporary_input.unlink(missing_ok=True)
    report['files'].append(entry)
    print(json.dumps(entry, ensure_ascii=False), flush=True)
    (output / 'native_signing_report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    # Failure of the minimal text probe blocks further signing attempts.
    if failed: break
sys.exit(1 if failed else 0)
