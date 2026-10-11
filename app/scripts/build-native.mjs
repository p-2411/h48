import { existsSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const output = resolve(root, 'resources', 'bin')
mkdirSync(output, { recursive: true })

// This is a plain JavaScript build script, so TypeScript return annotations are unavailable.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

if (process.platform === 'darwin') {
  run('swiftc', [
    '-O',
    'native/macos/CaptionReader.swift',
    '-o',
    'resources/bin/caption-reader-macos'
  ])
  run('swiftc', [
    '-O',
    'native/macos/AudioReader/main.swift',
    'native/macos/AudioReader/Permission.swift',
    '-o',
    'resources/bin/audio-reader-macos',
    '-Xlinker',
    '-sectcreate',
    '-Xlinker',
    '__TEXT',
    '-Xlinker',
    '__info_plist',
    '-Xlinker',
    'native/macos/AudioReader/Info.plist'
  ])
  run('codesign', [
    '-s',
    '-',
    '-f',
    '-i',
    'io.useduet.audio-reader',
    'resources/bin/audio-reader-macos'
  ])
} else if (process.platform === 'win32') {
  const compilers = [
    'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
    'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe'
  ]
  const compiler = compilers.find(existsSync)
  if (!compiler) throw new Error('Windows C# compiler not found.')
  const framework = resolve(compiler, '..')
  const wpf = resolve(framework, 'WPF')
  run(compiler, [
    '/nologo',
    '/optimize+',
    '/target:exe',
    '/out:resources\\bin\\caption-reader-windows.exe',
    `/reference:${resolve(wpf, 'UIAutomationClient.dll')}`,
    `/reference:${resolve(wpf, 'UIAutomationTypes.dll')}`,
    `/reference:${resolve(wpf, 'WindowsBase.dll')}`,
    `/reference:${resolve(framework, 'System.Web.Extensions.dll')}`,
    'native\\windows\\CaptionReader.cs'
  ])
} else {
  console.log(`No native Duet readers are built for ${process.platform}.`)
}
