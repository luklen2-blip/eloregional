@echo off
chcp 65001 > nul
title EloRegional - Match de Solucoes Regionais
echo =======================================================
echo    🌱 EloRegional - Rede Brasileira de Solucoes
echo    Conectando desafios e inovacoes sociais 24/7
echo =======================================================
echo.

cd /d "%~dp0"

IF NOT EXIST "node_modules\" (
    echo [1/3] Instalando dependencias necessarias...
    call npm install
) ELSE (
    echo [1/3] Dependencias verificadas.
)

echo [2/3] Executando testes locais de integridade...
call npm test
IF %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRO] Falha nos testes de integridade. Verifique os erros acima.
    pause
    exit /b %ERRORLEVEL%
)

echo [3/3] Iniciando servidor e abrindo aplicacao...
start http://localhost:3000

call node server.js
pause
