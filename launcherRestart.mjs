import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { win32 } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const execute = promisify(execFile)
const project = fileURLToPath(new URL('.', import.meta.url))

export function ownsServer(command, root = project) {
  const match = command?.match(/^(?:"[^"]+"|\S+)\s+(?:"([^"]+)"|(\S+))/)
  const entry = match?.[1] || match?.[2]
  if (!entry || !win32.isAbsolute(entry)) return false
  const normalized = win32.normalize(entry).toLowerCase()
  return ['server.mjs', 'node_modules\\vite\\bin\\vite.js'].some(file =>
    normalized === win32.join(root, file).toLowerCase())
}

async function powershell(script) {
  return execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true })
}

async function listeners() {
  const { stdout } = await powershell("$items = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in 5173,8787 } | ForEach-Object { $p = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $_.OwningProcess); [pscustomobject]@{pid=$p.ProcessId; name=$p.Name; command=$p.CommandLine} }); ConvertTo-Json -InputObject $items -Compress")
  return JSON.parse(stdout || '[]')
}

export async function restartOwnedServers() {
  const initial = await listeners()
  if (initial.some(item => item.name !== 'node.exe' || !ownsServer(item.command))) {
    throw new Error('Un port appartient a un autre programme ou a un ancien lancement non identifiable. Aucun processus arrete.')
  }
  for (const item of [...new Map(initial.map(item => [item.pid, item])).values()]) {
    // Recheck the command immediately before stopping, protecting against PID reuse.
    const current = (await listeners()).find(owner => owner.pid === item.pid)
    if (!current || current.command !== item.command || !ownsServer(current.command)) continue
    const expected = item.command.replaceAll("'", "''")
    await powershell(`$p = Get-CimInstance Win32_Process -Filter 'ProcessId = ${item.pid}'; if ($p -and $p.Name -eq 'node.exe' -and $p.CommandLine -ceq '${expected}') { Stop-Process -Id ${item.pid} -ErrorAction Stop }`)
  }
  for (let attempt = 0; attempt < 30; attempt++) {
    if (!(await listeners()).length) {
      console.log('Les anciens serveurs de ce projet sont arretes. Redemarrage...')
      return
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error('Un port reste occupe. Le redemarrage est annule sans arreter un autre programme.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await restartOwnedServers() }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
