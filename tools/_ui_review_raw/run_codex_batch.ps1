param(
  [Parameter(Mandatory=$true)][string]$Prompt,
  [Parameter(Mandatory=$true)][string]$Out,
  [string[]]$Images = @(),
  [string]$WorkDir = 'D:\deepseek\杂项\hamster-snack-factory',
  [int]$TimeoutSec = 900
)
# 直调 node + codex.js：完全绕开 cmd.exe 的中文路径代码页问题
# 用法: pwsh -File run_codex_batch.ps1 -Prompt <相对或绝对提示词.txt> -Out <输出.txt> -Images a.png,b.png
$ErrorActionPreference = 'Stop'
$node = (Get-Command node).Source
$codexJs = 'C:\Users\lenovo\AppData\Roaming\npm\node_modules\@openai\codex\bin\codex.js'
if (-not (Test-Path $codexJs)) { throw "codex.js not found: $codexJs" }

$list = @($codexJs, 'exec', '-C', $WorkDir, '--skip-git-repo-check', '--dangerously-bypass-approvals-and-sandbox')
foreach ($img in $Images) { if ($img) { $list += @('-i', $img) } }
$list += '-'

function Q([string]$s) { if ($s -match '[\s"]') { return '"' + ($s -replace '"', '\"') + '"' } else { return $s } }
$argStr = ($list | ForEach-Object { Q $_ }) -join ' '

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $node
$psi.Arguments = $argStr
$psi.WorkingDirectory = $WorkDir
$psi.UseShellExecute = $false
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$utf8 = New-Object System.Text.UTF8Encoding($false)
# .NET Framework 的 ProcessStartInfo 没有 StandardInputEncoding，改走 BaseStream 写 UTF-8 字节
$psi.StandardOutputEncoding = $utf8
$psi.StandardErrorEncoding = $utf8

$p = [System.Diagnostics.Process]::Start($psi)
$promptText = [System.IO.File]::ReadAllText($Prompt, [System.Text.Encoding]::UTF8)
$bytes = [System.Text.Encoding]::UTF8.GetBytes($promptText)
$p.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
$p.StandardInput.BaseStream.Flush()
$p.StandardInput.Close()

$outTask = $p.StandardOutput.ReadToEndAsync()
$errTask = $p.StandardError.ReadToEndAsync()
$finished = $p.WaitForExit($TimeoutSec * 1000)
if (-not $finished) {
  try { $p.Kill() } catch {}
  [System.IO.File]::WriteAllText($Out, "TIMEOUT after ${TimeoutSec}s", $utf8)
  Write-Output "TIMEOUT ${TimeoutSec}s -> $Out"
  exit 2
}
$outText = $outTask.Result
$errText = $errTask.Result
[System.IO.File]::WriteAllText($Out, $outText, $utf8)
$errPath = [System.IO.Path]::ChangeExtension($Out, '.stderr.txt')
[System.IO.File]::WriteAllText($errPath, $errText, $utf8)
Write-Output "EXIT=$($p.ExitCode) OUT_BYTES=$($outText.Length) ERR_BYTES=$($errText.Length) -> $Out"
