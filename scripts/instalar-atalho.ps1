# Cria os atalhos "Gerar 50 leads" e "Ensaio (5 leads)" no ambiente de trabalho do Windows.
# Uso:  npm run atalho
$ErrorActionPreference = 'Stop'

$raiz = Split-Path -Parent $PSScriptRoot
$alvo = Join-Path $raiz 'gerar-leads.cmd'
if (-not (Test-Path $alvo)) { throw "Não encontrei $alvo" }

# Funciona também com o Ambiente de Trabalho redirecionado para o OneDrive.
$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell

function Novo-Atalho($nome, $argumentos, $descricao) {
    $caminho = Join-Path $desktop "$nome.lnk"
    $lnk = $shell.CreateShortcut($caminho)
    $lnk.TargetPath = $alvo
    $lnk.Arguments = $argumentos
    $lnk.WorkingDirectory = $raiz
    $lnk.Description = $descricao
    $lnk.IconLocation = "$env:SystemRoot\System32\shell32.dll,22"
    $lnk.WindowStyle = 1
    $lnk.Save()
    Write-Host "Atalho criado: $caminho"
}

Novo-Atalho 'Gerar 50 leads' '' 'Elmavere Lead Agent: gera 50 leads na Google Sheet (não envia mensagens)'
Novo-Atalho 'Ensaio (5 leads)' '--dry-run --n 5' 'Elmavere Lead Agent: ensaio com 5 leads, sem escrever na folha'
