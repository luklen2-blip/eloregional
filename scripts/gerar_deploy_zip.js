/**
 * Script de Empacotamento de Deploy Limpo (.zip)
 * Gera o pacote de implantação diretamente na Área de Trabalho do Luciano.
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

console.log('📦 Gerando pacote limpo de deploy (.zip)...');

const projectDir = path.resolve('.');
const desktopDir = path.join(os.homedir(), 'Desktop');
const zipName = 'match-solucoes-regionais-deploy.zip';
const targetZip = path.join(desktopDir, zipName);

try {
  // Comando PowerShell seguro com separadores de ponto-e-vírgula
  const psCommand = [
    `$ErrorActionPreference = 'Stop'`,
    `$target = '${targetZip}'`,
    `if (Test-Path $target) { Remove-Item $target -Force }`,
    `$items = Get-ChildItem -Path . -Exclude 'node_modules', '.git', '.system_generated', '*.log', 'dist', '*.zip'`,
    `Compress-Archive -Path $items -DestinationPath $target -Force`
  ].join('; ');

  execSync(`powershell -NoProfile -Command "${psCommand}"`, {
    cwd: projectDir,
    stdio: 'inherit'
  });

  if (fs.existsSync(targetZip)) {
    const stats = fs.statSync(targetZip);
    const sizeKb = (stats.size / 1024).toFixed(1);
    console.log(`✅ Pacote ZIP gerado com sucesso!`);
    console.log(`📍 Localização: ${targetZip} (${sizeKb} KB)`);
  } else {
    console.log('⚠️ Aviso: Verifique a geração do arquivo ZIP.');
  }
} catch (err) {
  console.error('Erro ao gerar pacote ZIP:', err.message);
  process.exit(1);
}
